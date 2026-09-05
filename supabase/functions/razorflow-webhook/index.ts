// RazorFlow AI — Razorpay Webhook Handler
//
// Receives Razorpay webhooks, verifies the signature using the webhook secret,
// and processes payment events idempotently. A duplicate webhook NEVER creates
// a duplicate order or payment — we check webhook_events.event_id first.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const MERCHANT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Verify Razorpay webhook signature: HMAC-SHA256(body, webhook_secret)
async function verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  if (!RAZORPAY_WEBHOOK_SECRET) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(RAZORPAY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") ?? "";

    // 1. Verify signature
    const signatureValid = await verifyWebhookSignature(rawBody, signature);
    if (!signatureValid) {
      // Log failed attempt
      await supabase.from("webhook_events").insert({
        merchant_id: MERCHANT_ID,
        event_id: `failed_${Date.now()}`,
        event_type: "signature_verification_failed",
        payload: JSON.parse(rawBody || "{}"),
        signature_verified: false,
        processed: false,
      });
      return json({ error: "Invalid signature" }, 401);
    }

    const event = JSON.parse(rawBody);
    const eventId = event.event_id ?? `evt_${Date.now()}`;
    const eventType = event.event ?? "unknown";
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;

    // 2. IDEMPOTENCY: check if this event was already processed
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing?.processed) {
      // Duplicate webhook — return success without reprocessing
      return json({ received: true, idempotent: true, event_id: eventId });
    }

    // 3. Record the webhook event
    if (existing) {
      await supabase.from("webhook_events").update({
        signature_verified: true,
        payload: event,
      }).eq("id", existing.id);
    } else {
      await supabase.from("webhook_events").insert({
        merchant_id: MERCHANT_ID,
        event_id: eventId,
        event_type: eventType,
        entity_type: paymentEntity ? "payment" : "order",
        entity_id: paymentEntity?.id ?? orderEntity?.id,
        payload: event,
        signature_verified: true,
      });
    }

    // 4. Process the event
    let processingResult: Record<string, unknown> = { event: eventType };

    if (eventType.includes("payment.captured") || eventType.includes("payment.authorized")) {
      const razorpayOrderId = paymentEntity?.order_id;
      const razorpayPaymentId = paymentEntity?.id;
      const amount = paymentEntity?.amount;
      const method = paymentEntity?.method;

      if (razorpayOrderId && razorpayPaymentId) {
        // Find the order by razorpay_order_id
        const { data: order } = await supabase
          .from("orders")
          .select("*")
          .eq("razorpay_order_id", razorpayOrderId)
          .maybeSingle();

        if (order) {
          // Update payment record
          await supabase.from("payments")
            .update({
              status: "captured",
              razorpay_payment_id: razorpayPaymentId,
              method,
              verified: true,
              verified_at: new Date().toISOString(),
            })
            .eq("order_id", order.id);

          // Update order status
          await supabase.from("orders").update({ status: "paid" }).eq("id", order.id);

          // Mark cart converted
          if (order.cart_id) {
            await supabase.from("carts").update({ status: "converted", converted_order_id: order.id }).eq("id", order.cart_id);
          }

          // Decrement inventory
          const { data: items } = await supabase.from("order_items").select("product_id,quantity").eq("order_id", order.id);
          if (items) {
            for (const it of items) {
              await supabase.rpc("decrement_inventory", { p_product_id: it.product_id, p_qty: it.quantity }).maybeSingle();
            }
          }

          // Audit log
          await supabase.from("audit_logs").insert({
            merchant_id: MERCHANT_ID,
            action: "payment_verify",
            actor: "razorpay-webhook",
            target_type: "payment",
            target_id: order.id,
            order_id: order.id,
            amount_cents: amount,
            reason: `Webhook ${eventType}: payment captured via ${method}`,
            details: { event_id: eventId, razorpay_payment_id: razorpayPaymentId },
          });

          processingResult = { processed: true, order_id: order.id, status: "paid" };
        }
      }
    } else if (eventType.includes("payment.failed")) {
      const razorpayOrderId = paymentEntity?.order_id;
      const failureReason = paymentEntity?.error_description ?? "Payment failed";
      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("razorpay_order_id", razorpayOrderId)
        .maybeSingle();
      if (order) {
        await supabase.from("orders").update({ status: "failed", failure_reason: failureReason }).eq("id", order.id);
        await supabase.from("payments").update({ status: "failed", failure_reason }).eq("order_id", order.id);
        await supabase.from("audit_logs").insert({
          merchant_id: MERCHANT_ID,
          action: "payment_verify",
          actor: "razorpay-webhook",
          target_type: "payment",
          order_id: order.id,
          reason: `Webhook ${eventType}: payment failed`,
          failure_reason: failureReason,
          recovery_action: "Cart preserved; order marked failed; no duplicate created.",
          final_state: "cart_active",
        });
        processingResult = { processed: true, order_id: order.id, status: "failed" };
      }
    }

    // 5. Mark webhook processed
    await supabase.from("webhook_events").update({
      processed: true,
      processed_at: new Date().toISOString(),
      processing_result: processingResult,
    }).eq("event_id", eventId);

    return json({ received: true, processed: true, event_id: eventId, result: processingResult });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});
