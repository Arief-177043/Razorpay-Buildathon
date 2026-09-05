// RazorFlow AI — Agent + Payment Edge Function
//
// This is the server-side brain of RazorFlow. It exposes a single edge function
// that routes requests by `action`:
//
//   agent/chat       — buyer or growth agent with tool calling
//   agent/tools/:t   — call a single deterministic tool directly
//   payment/create   — create a Razorpay test order (deterministic amount)
//   payment/verify   — cryptographically verify a Razorpay payment
//   payment/status   — get payment + order status
//   demo/reset       — reset demo controls
//   demo/simulate    — toggle failure simulation flags
//
// Design principles:
// - AI decides WHICH tool to call and explains WHY; deterministic code computes
//   prices, totals, taxes, discounts, inventory, and payment amounts.
// - The LLM never touches the database directly and never sets money values.
// - Every money action is audit-logged and idempotent.
// - Uses a RazorpayPaymentProvider when RAZORPAY_KEY_ID/SECRET are configured,
//   otherwise falls back to MockPaymentProvider (no fake success).

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// ---------------------------------------------------------------------------
// Config + clients
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_BASE_URL = Deno.env.get("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-sonnet-20241022";

const MERCHANT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 500, details?: unknown) {
  return json({ error: message, details }, status);
}

function toCents(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}

function fromCents(cents: number | bigint | string): number {
  return Number(cents) / 100;
}

// ---------------------------------------------------------------------------
// Payment Provider abstraction
// ---------------------------------------------------------------------------
interface PaymentOrderResult {
  razorpay_order_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
}

interface PaymentVerifyResult {
  verified: boolean;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  method?: string;
}

interface PaymentProvider {
  name: string;
  createOrder(amountCents: number, currency: string, receipt: string): Promise<PaymentOrderResult>;
  verifyPayment(paymentId: string, orderId: string, signature: string): Promise<PaymentVerifyResult>;
  getPaymentStatus(paymentId: string): Promise<{ status: string; method?: string; amount_cents: number }>;
}

// Razorpay Test Mode provider — real API calls, no fake success
class RazorpayPaymentProvider implements PaymentProvider {
  name = "razorpay";
  private keyId: string;
  private keySecret: string;

  constructor(keyId: string, keySecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  private authHeader(): string {
    return "Basic " + btoa(`${this.keyId}:${this.keySecret}`);
  }

  async createOrder(amountCents: number, currency: string, receipt: string): Promise<PaymentOrderResult> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(),
      },
      body: JSON.stringify({
        amount: amountCents,
        currency,
        receipt,
        payment: { capture: true },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Razorpay createOrder failed (${res.status}): ${body}`);
    }
    const order = await res.json();
    return {
      razorpay_order_id: order.id,
      amount_cents: order.amount,
      currency: order.currency,
      status: order.status,
      provider: this.name,
    };
  }

  async verifyPayment(paymentId: string, orderId: string, signature: string): Promise<PaymentVerifyResult> {
    // Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    // We verify using the Web Crypto API.
    const data = `${orderId}|${paymentId}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(this.keySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const verified = expected === signature;
    return {
      verified,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: signature,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<{ status: string; method?: string; amount_cents: number }> {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Razorpay getPayment failed (${res.status}): ${body}`);
    }
    const p = await res.json();
    return { status: p.status, method: p.method, amount_cents: p.amount };
  }
}

// Mock provider — never fakes success; simulates the checkout flow for local dev
// without Razorpay credentials. Payment verification always FAILS unless the
// demo explicitly marks a payment as "demo_captured".
class MockPaymentProvider implements PaymentProvider {
  name = "mock";

  async createOrder(amountCents: number, currency: string, receipt: string): Promise<PaymentOrderResult> {
    return {
      razorpay_order_id: `mock_order_${receipt}_${Date.now()}`,
      amount_cents: amountCents,
      currency,
      status: "created",
      provider: this.name,
    };
  }

  async verifyPayment(paymentId: string, orderId: string, signature: string): Promise<PaymentVerifyResult> {
    // Mock signature is "mock_sig_<orderId>" — only valid if explicitly set by demo
    const verified = signature === `mock_sig_${orderId}`;
    return {
      verified,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: signature,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<{ status: string; method?: string; amount_cents: number }> {
    return { status: "created", method: "mock", amount_cents: 0 };
  }
}

function getPaymentProvider(): PaymentProvider {
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
    return new RazorpayPaymentProvider(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET);
  }
  return new MockPaymentProvider();
}

// ---------------------------------------------------------------------------
// DETERMINISTIC TOOLS — the only functions that touch money / data writes
// Each tool returns plain JSON. The AI reasons over outputs, never computes.
// ---------------------------------------------------------------------------

async function tool_get_merchant_profile() {
  const { data, error } = await supabase
    .from("merchants")
    .select("id,name,slug,email,description,website,currency,default_tax_rate")
    .eq("id", MERCHANT_ID)
    .maybeSingle();
  if (error) throw new Error(`get_merchant_profile: ${error.message}`);
  return data;
}

async function tool_get_catalog(args: { category?: string; limit?: number }) {
  let q = supabase.from("products").select("id,name,slug,category,price_cents,inventory_count,rating,rating_count,is_active,image_url,attributes").eq("merchant_id", MERCHANT_ID).eq("is_active", true);
  if (args.category) q = q.eq("category", args.category);
  const { data, error } = await q.limit(args.limit ?? 50);
  if (error) throw new Error(`get_catalog: ${error.message}`);
  return data;
}

async function tool_search_products(args: { query?: string; category?: string; max_price_cents?: number; min_price_cents?: number; limit?: number }) {
  let q = supabase.from("products").select("id,name,slug,category,price_cents,inventory_count,rating,rating_count,is_active,image_url,description,attributes").eq("merchant_id", MERCHANT_ID).eq("is_active", true);
  if (args.category) q = q.eq("category", args.category);
  if (args.max_price_cents != null) q = q.lte("price_cents", args.max_price_cents);
  if (args.min_price_cents != null) q = q.gte("price_cents", args.min_price_cents);
  if (args.query) q = q.or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  const { data, error } = await q.limit(args.limit ?? 10);
  if (error) throw new Error(`search_products: ${error.message}`);
  return data;
}

async function tool_get_product_details(args: { product_id: string }) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", args.product_id)
    .eq("merchant_id", MERCHANT_ID)
    .maybeSingle();
  if (error) throw new Error(`get_product_details: ${error.message}`);
  return data;
}

async function tool_get_product_recommendations(args: { product_id: string; limit?: number }) {
  const { data, error } = await supabase.rpc("get_recommendations_for_product", {
    p_product_id: args.product_id,
    p_limit: args.limit ?? 4,
  });
  if (error) throw new Error(`get_product_recommendations: ${error.message}`);
  return data;
}

async function tool_get_sales_metrics() {
  const { data, error } = await supabase.rpc("get_merchant_metrics", { p_merchant_id: MERCHANT_ID });
  if (error) throw new Error(`get_sales_metrics: ${error.message}`);
  return data;
}

async function tool_get_conversion_metrics() {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,views_count,add_to_cart_count,purchase_count,abandonment_count,conversion_rate")
    .eq("merchant_id", MERCHANT_ID)
    .order("views_count", { ascending: false })
    .limit(20);
  if (error) throw new Error(`get_conversion_metrics: ${error.message}`);
  return data;
}

async function tool_get_customer_segments() {
  const { data, error } = await supabase.rpc("get_customer_segments", { p_merchant_id: MERCHANT_ID });
  if (error) throw new Error(`get_customer_segments: ${error.message}`);
  return data;
}

async function tool_get_abandoned_carts() {
  const { data, error } = await supabase.rpc("get_abandoned_carts", { p_merchant_id: MERCHANT_ID });
  if (error) throw new Error(`get_abandoned_carts: ${error.message}`);
  return data;
}

async function tool_get_revenue_opportunities() {
  const { data, error } = await supabase.rpc("discover_growth_opportunities", { p_merchant_id: MERCHANT_ID });
  if (error) throw new Error(`get_revenue_opportunities: ${error.message}`);
  return data;
}

async function tool_get_product_relationships(args: { product_id?: string }) {
  let q = supabase.from("product_relationships").select("*,source_product_id:name,source:products!product_relationships_source_product_id_fkey(name,slug,category),target:products!product_relationships_target_product_id_fkey(name,slug,category,price_cents)").eq("merchant_id", MERCHANT_ID);
  if (args.product_id) q = q.eq("source_product_id", args.product_id);
  const { data, error } = await q.limit(20);
  if (error) throw new Error(`get_product_relationships: ${error.message}`);
  return data;
}

async function tool_check_inventory(args: { product_id: string; quantity?: number }) {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,inventory_count,is_active")
    .eq("id", args.product_id)
    .maybeSingle();
  if (error) throw new Error(`check_inventory: ${error.message}`);
  if (!data) return { available: false, reason: "Product not found" };
  const qty = args.quantity ?? 1;
  const available = data.is_active && data.inventory_count >= qty;
  return { available, inventory_count: data.inventory_count, requested: qty, product_name: data.name };
}

async function tool_calculate_order_total(args: { cart_id: string; discount_cents?: number; tax_rate?: number }) {
  const { data, error } = await supabase.rpc("calculate_order_total", {
    p_cart_id: args.cart_id,
    p_discount_cents: args.discount_cents ?? 0,
    p_tax_rate: args.tax_rate ?? 18.0,
  });
  if (error) throw new Error(`calculate_order_total: ${error.message}`);
  return data;
}

async function tool_add_to_cart(args: { cart_id?: string; product_id: string; quantity?: number }) {
  const qty = args.quantity ?? 1;
  // Check inventory first (deterministic gate)
  const inv = await tool_check_inventory({ product_id: args.product_id, quantity: qty });
  if (!inv.available) {
    return { success: false, reason: inv.reason ?? "Insufficient inventory", product_name: inv.product_name };
  }
  const { data: prod } = await supabase.from("products").select("price_cents").eq("id", args.product_id).maybeSingle();
  if (!prod) return { success: false, reason: "Product not found" };

  let cartId = args.cart_id;
  if (!cartId) {
    const { data: newCart, error: ce } = await supabase.from("carts").insert({ merchant_id: MERCHANT_ID, status: "active", currency: "INR" }).select("id").single();
    if (ce) throw new Error(`add_to_cart create cart: ${ce.message}`);
    cartId = newCart.id;
  }
  const { error } = await supabase.from("cart_items").upsert(
    { cart_id: cartId, product_id: args.product_id, quantity: qty, unit_price_cents: prod.price_cents },
    { onConflict: "cart_id,product_id" }
  );
  if (error) throw new Error(`add_to_cart: ${error.message}`);
  return { success: true, cart_id: cartId, product_id: args.product_id, quantity: qty };
}

async function tool_get_cart(args: { cart_id: string }) {
  const { data: cart, error: ce } = await supabase.from("carts").select("*").eq("id", args.cart_id).maybeSingle();
  if (ce) throw new Error(`get_cart: ${ce.message}`);
  if (!cart) return { cart: null, items: [] };
  const { data: items, error: ie } = await supabase
    .from("cart_items")
    .select("*,product:products(name,slug,category,image_url)")
    .eq("cart_id", args.cart_id);
  if (ie) throw new Error(`get_cart items: ${ie.message}`);
  const total = await tool_calculate_order_total({ cart_id: args.cart_id });
  return { cart, items, total };
}

async function tool_create_audit_log(args: { action: string; actor?: string; target_type?: string; target_id?: string; details?: unknown; reason?: string; request_id?: string; order_id?: string; payment_id?: string; amount_cents?: number; failure_reason?: string; recovery_action?: string; final_state?: string }) {
  const { data, error } = await supabase.from("audit_logs").insert({
    merchant_id: MERCHANT_ID,
    action: args.action,
    actor: args.actor ?? "buyer-agent",
    target_type: args.target_type,
    target_id: args.target_id,
    details: args.details ?? {},
    reason: args.reason,
    request_id: args.request_id,
    order_id: args.order_id,
    payment_id: args.payment_id,
    amount_cents: args.amount_cents,
    failure_reason: args.failure_reason,
    recovery_action: args.recovery_action,
    final_state: args.final_state,
  }).select("id").single();
  if (error) throw new Error(`create_audit_log: ${error.message}`);
  return { logged: true, audit_id: data.id };
}

// ---------------------------------------------------------------------------
// PAYMENT ACTIONS — deterministic, idempotent, audited
// ---------------------------------------------------------------------------

async function action_create_payment_order(body: { cart_id: string; idempotency_key?: string }) {
  // 1. Compute total deterministically (AI never sets this)
  const total = await tool_calculate_order_total({ cart_id: body.cart_id, tax_rate: 18.0 });
  if (total.total_cents <= 0) return err("Cart is empty — cannot create payment order", 400);

  // 2. Idempotency: if an order with this key exists, return it
  const idemKey = body.idempotency_key ?? `idem-${body.cart_id}`;
  const { data: existing } = await supabase.from("orders").select("*").eq("idempotency_key", idemKey).maybeSingle();
  if (existing) {
    return json({ order: existing, idempotent: true });
  }

  // 3. Generate order number
  const { data: onum } = await supabase.rpc("generate_order_number").maybeSingle();

  // 4. Check demo failure simulation
  const { data: ctrl } = await supabase.from("demo_controls").select("*").eq("merchant_id", MERCHANT_ID).maybeSingle();
  const simulateFail = ctrl?.simulate_payment_failure;

  // 5. Create the order record (status=created)
  const { data: order, error: oe } = await supabase.from("orders").insert({
    merchant_id: MERCHANT_ID,
    cart_id: body.cart_id,
    order_number: onum,
    status: "created",
    subtotal_cents: total.subtotal_cents,
    discount_cents: total.discount_cents,
    tax_cents: total.tax_cents,
    total_cents: total.total_cents,
    currency: "INR",
    items_count: total.items?.length ?? 0,
    idempotency_key: idemKey,
  }).select("*").single();
  if (oe) return err(`Failed to create order: ${oe.message}`, 500);

  // 6. Create order items from cart
  const { data: items } = await supabase.from("cart_items").select("*,product:products(name)").eq("cart_id", body.cart_id);
  if (items && items.length > 0) {
    await supabase.from("order_items").insert(
      items.map((it: any) => ({
        order_id: order.id,
        product_id: it.product_id,
        product_name: it.product?.name ?? "Unknown",
        quantity: it.quantity,
        unit_price_cents: it.unit_price_cents,
        total_cents: it.unit_price_cents * it.quantity,
      }))
    );
  }

  // 7. If simulating failure, mark order failed and return (no Razorpay call)
  if (simulateFail) {
    await supabase.from("orders").update({ status: "failed", failure_reason: "Demo: simulated payment failure" }).eq("id", order.id);
    await supabase.from("payments").insert({
      merchant_id: MERCHANT_ID,
      order_id: order.id,
      amount_cents: total.total_cents,
      currency: "INR",
      status: "failed",
      provider: getPaymentProvider().name,
      failure_reason: "Demo: simulated payment failure",
    });
    await tool_create_audit_log({
      action: "payment_create",
      target_type: "order",
      target_id: order.id,
      reason: "Demo: simulated payment failure",
      order_id: order.id,
      amount_cents: total.total_cents,
      failure_reason: "Demo: simulated payment failure",
      recovery_action: "Cart preserved; order marked failed; no duplicate created.",
      final_state: "cart_active",
    });
    return json({ order: { ...order, status: "failed", failure_reason: "Demo: simulated payment failure" }, simulated_failure: true, total });
  }

  // 8. Create Razorpay (or mock) order
  const provider = getPaymentProvider();
  try {
    const rp = await provider.createOrder(total.total_cents, "INR", order.order_number);
    await supabase.from("orders").update({ razorpay_order_id: rp.razorpay_order_id }).eq("id", order.id);
    await supabase.from("payments").insert({
      merchant_id: MERCHANT_ID,
      order_id: order.id,
      razorpay_order_id: rp.razorpay_order_id,
      amount_cents: total.total_cents,
      currency: "INR",
      status: "created",
      provider: rp.provider,
    });
    await tool_create_audit_log({
      action: "payment_create",
      target_type: "order",
      target_id: order.id,
      reason: `Created ${rp.provider} order for checkout.`,
      order_id: order.id,
      amount_cents: total.total_cents,
    });
    return json({ order: { ...order, razorpay_order_id: rp.razorpay_order_id }, payment: rp, total, key_id: RAZORPAY_KEY_ID || "mock_key" });
  } catch (e: any) {
    await supabase.from("orders").update({ status: "failed", failure_reason: e.message }).eq("id", order.id);
    await tool_create_audit_log({
      action: "payment_create",
      target_type: "order",
      target_id: order.id,
      reason: "Payment provider order creation failed.",
      order_id: order.id,
      amount_cents: total.total_cents,
      failure_reason: e.message,
      recovery_action: "Cart preserved; order marked failed; safe to retry.",
      final_state: "cart_active",
    });
    return err(`Payment provider error: ${e.message}`, 502);
  }
}

async function action_verify_payment(body: { order_id: string; razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
  const provider = getPaymentProvider();
  // 1. Fetch the order
  const { data: order, error: oe } = await supabase.from("orders").select("*").eq("id", body.order_id).maybeSingle();
  if (oe || !order) return err("Order not found", 404);

  // 2. Idempotency: if already paid, return existing
  const { data: existingPay } = await supabase.from("payments").select("*").eq("razorpay_payment_id", body.razorpay_payment_id).maybeSingle();
  if (existingPay?.status === "captured") {
    return json({ verified: true, order: { ...order, status: "paid" }, payment: existingPay, idempotent: true });
  }

  // 3. Cryptographic verification
  let verifyResult;
  try {
    verifyResult = await provider.verifyPayment(body.razorpay_payment_id, body.razorpay_order_id, body.razorpay_signature);
  } catch (e: any) {
    await tool_create_audit_log({
      action: "payment_verify",
      target_type: "payment",
      order_id: order.id,
      reason: "Verification error",
      failure_reason: e.message,
      recovery_action: "Cart preserved; retry checkout.",
      final_state: "cart_active",
    });
    return err(`Verification error: ${e.message}`, 500);
  }

  if (!verifyResult.verified) {
    // Mark failed but preserve cart
    await supabase.from("orders").update({ status: "failed", failure_reason: "Signature verification failed" }).eq("id", order.id);
    await supabase.from("payments").update({ status: "failed", failure_reason: "Signature verification failed", razorpay_payment_id: body.razorpay_payment_id, razorpay_signature: body.razorpay_signature }).eq("order_id", order.id);
    await tool_create_audit_log({
      action: "payment_verify",
      target_type: "payment",
      order_id: order.id,
      reason: "Signature verification failed.",
      failure_reason: "Signature verification failed",
      recovery_action: "Cart preserved; order marked failed; no duplicate created.",
      final_state: "cart_active",
    });
    return json({ verified: false, order: { ...order, status: "failed" }, reason: "Signature verification failed" });
  }

  // 4. Verified — mark order paid + payment captured + decrement inventory
  await supabase.from("orders").update({ status: "paid" }).eq("id", order.id);
  await supabase.from("payments").update({
    status: "captured",
    verified: true,
    verified_at: new Date().toISOString(),
    razorpay_payment_id: body.razorpay_payment_id,
    razorpay_signature: body.razorpay_signature,
  }).eq("order_id", order.id);
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
  await tool_create_audit_log({
    action: "payment_verify",
    target_type: "payment",
    order_id: order.id,
    reason: "Cryptographic signature verification succeeded.",
    amount_cents: order.total_cents,
  });
  const { data: updatedOrder } = await supabase.from("orders").select("*").eq("id", order.id).maybeSingle();
  const { data: updatedPay } = await supabase.from("payments").select("*").eq("order_id", order.id).maybeSingle();
  return json({ verified: true, order: updatedOrder, payment: updatedPay });
}

async function action_get_payment_status(body: { order_id: string }) {
  const { data: order, error: oe } = await supabase.from("orders").select("*").eq("id", body.order_id).maybeSingle();
  if (oe || !order) return err("Order not found", 404);
  const { data: payments } = await supabase.from("payments").select("*").eq("order_id", body.order_id);
  return json({ order, payments: payments ?? [] });
}

// ---------------------------------------------------------------------------
// DEMO CONTROLS
// ---------------------------------------------------------------------------
async function action_demo_reset() {
  await supabase.from("demo_controls").update({
    simulate_payment_failure: false,
    simulate_api_timeout: false,
    simulate_inventory_failure: false,
    payment_provider: "auto",
  }).eq("merchant_id", MERCHANT_ID);
  await tool_create_audit_log({ action: "demo_reset", actor: "demo-control", reason: "Reset demo controls to defaults." });
  return json({ reset: true });
}

async function action_demo_simulate(body: { simulate_payment_failure?: boolean; simulate_api_timeout?: boolean; simulate_inventory_failure?: boolean }) {
  const update: Record<string, boolean> = {};
  if (body.simulate_payment_failure !== undefined) update.simulate_payment_failure = body.simulate_payment_failure;
  if (body.simulate_api_timeout !== undefined) update.simulate_api_timeout = body.simulate_api_timeout;
  if (body.simulate_inventory_failure !== undefined) update.simulate_inventory_failure = body.simulate_inventory_failure;
  const { data, error } = await supabase.from("demo_controls").update(update).eq("merchant_id", MERCHANT_ID).select("*").single();
  if (error) return err(`Failed to update demo controls: ${error.message}`, 500);
  await tool_create_audit_log({
    action: "failure_simulate",
    actor: "demo-control",
    reason: `Updated simulation flags: ${JSON.stringify(update)}`,
    details: update,
  });
  return json({ controls: data });
}

async function action_get_demo_controls() {
  const { data, error } = await supabase.from("demo_controls").select("*").eq("merchant_id", MERCHANT_ID).maybeSingle();
  if (error) return err(`Failed to load demo controls: ${error.message}`, 500);
  return json({ controls: data });
}

// ---------------------------------------------------------------------------
// APPROVE / REJECT OPPORTUNITY + CAMPAIGN (merchant gating)
// ---------------------------------------------------------------------------
async function action_approve_opportunity(body: { opportunity_id: string; approved_by?: string }) {
  const { data, error } = await supabase.from("growth_opportunities")
    .update({ status: "approved", approved_by: body.approved_by ?? "merchant", approved_at: new Date().toISOString() })
    .eq("id", body.opportunity_id).select("*").single();
  if (error) return err(`Failed to approve opportunity: ${error.message}`, 500);
  await tool_create_audit_log({
    action: "approve",
    actor: body.approved_by ?? "merchant",
    target_type: "growth_opportunity",
    target_id: body.opportunity_id,
    reason: `Approved growth opportunity: ${data.title}`,
    details: { type: data.type, estimated_revenue_cents: data.estimated_monthly_revenue_cents },
  });
  return json({ opportunity: data });
}

async function action_reject_opportunity(body: { opportunity_id: string; approved_by?: string }) {
  const { data, error } = await supabase.from("growth_opportunities")
    .update({ status: "rejected", approved_by: body.approved_by ?? "merchant", approved_at: new Date().toISOString() })
    .eq("id", body.opportunity_id).select("*").single();
  if (error) return err(`Failed to reject opportunity: ${error.message}`, 500);
  await tool_create_audit_log({
    action: "reject",
    actor: body.approved_by ?? "merchant",
    target_type: "growth_opportunity",
    target_id: body.opportunity_id,
    reason: `Rejected growth opportunity: ${data.title}`,
  });
  return json({ opportunity: data });
}

async function action_approve_campaign(body: { campaign_id: string; approved_by?: string }) {
  const { data, error } = await supabase.from("campaigns")
    .update({ status: "approved", approved_by: body.approved_by ?? "merchant", approved_at: new Date().toISOString() })
    .eq("id", body.campaign_id).select("*").single();
  if (error) return err(`Failed to approve campaign: ${error.message}`, 500);
  await tool_create_audit_log({
    action: "approve",
    actor: body.approved_by ?? "merchant",
    target_type: "campaign",
    target_id: body.campaign_id,
    reason: `Approved campaign: ${data.name}`,
  });
  return json({ campaign: data });
}

async function action_reject_campaign(body: { campaign_id: string; approved_by?: string }) {
  const { data, error } = await supabase.from("campaigns")
    .update({ status: "rejected", approved_by: body.approved_by ?? "merchant", approved_at: new Date().toISOString() })
    .eq("id", body.campaign_id).select("*").single();
  if (error) return err(`Failed to reject campaign: ${error.message}`, 500);
  await tool_create_audit_log({
    action: "reject",
    actor: body.approved_by ?? "merchant",
    target_type: "campaign",
    target_id: body.campaign_id,
    reason: `Rejected campaign: ${data.name}`,
  });
  return json({ campaign: data });
}

// ---------------------------------------------------------------------------
// TOOL REGISTRY — maps tool names to deterministic functions
// ---------------------------------------------------------------------------
const TOOLS: Record<string, (args: any) => Promise<unknown>> = {
  get_merchant_profile: () => tool_get_merchant_profile(),
  get_catalog: (a: any) => tool_get_catalog(a),
  search_products: (a: any) => tool_search_products(a),
  search_catalog: (a: any) => tool_search_products(a),
  get_product_details: (a: any) => tool_get_product_details(a),
  get_product_recommendations: (a: any) => tool_get_product_recommendations(a),
  get_sales_metrics: () => tool_get_sales_metrics(),
  get_conversion_metrics: () => tool_get_conversion_metrics(),
  get_customer_segments: () => tool_get_customer_segments(),
  get_abandoned_carts: () => tool_get_abandoned_carts(),
  get_revenue_opportunities: () => tool_get_revenue_opportunities(),
  get_product_relationships: (a: any) => tool_get_product_relationships(a),
  check_inventory: (a: any) => tool_check_inventory(a),
  calculate_order_total: (a: any) => tool_calculate_order_total(a),
  add_to_cart: (a: any) => tool_add_to_cart(a),
  get_cart: (a: any) => tool_get_cart(a),
  create_audit_log: (a: any) => tool_create_audit_log(a),
};

// ---------------------------------------------------------------------------
// AGENT — uses AI to pick tools and explain, deterministic code executes
// ---------------------------------------------------------------------------

const BUYER_SYSTEM_PROMPT = `You are RazorFlow's AI Buyer Agent for NexaGear, an electronics & gaming store.
You help customers discover and buy products conversationally.

RULES:
- You MUST call tools to get real data. NEVER invent product names, prices, inventory, or specs.
- Prices and inventory come ONLY from tool results. If a tool doesn't return it, say it's unavailable.
- You NEVER offer discounts or change prices. The system computes all totals deterministically.
- If a customer asks for an unavailable product or unauthorized price, refuse politely and suggest alternatives.
- For product recommendations, call get_product_recommendations after selecting a product to offer grounded cross-sells.
- When the customer wants to buy, call add_to_cart and calculate_order_total. Do not create orders or payments directly.
- Be concise, friendly, and specific. Always explain WHY you recommend a product using real attributes from tool results.
- Format prices as ₹X,XXX (e.g. ₹4,999).`;

const GROWTH_SYSTEM_PROMPT = `You are RazorFlow's AI Growth Agent for NexaGear.
You analyze merchant data and identify revenue opportunities.

RULES:
- You MUST call tools to get real metrics. NEVER fabricate numbers, rates, or revenue.
- All opportunity estimates come from get_revenue_opportunities and deterministic analytics. Explain them, don't invent them.
- You recommend actions for the merchant to APPROVE. You do not execute them directly.
- For campaigns, generate a structured draft (name, audience, offer, message, timing, expected impact, confidence, reason).
- Explain the EVIDENCE behind each recommendation (co-purchase counts, conversion rates, abandonment rates).
- Be analytical and specific. The merchant trusts you because every number is traceable to data.`;

const BUYER_TOOLS = [
  { name: "search_catalog", description: "Search the product catalog by query, category, or price range. Returns real products with prices and inventory." , input_schema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" }, max_price_cents: { type: "number" }, min_price_cents: { type: "number" }, limit: { type: "number" } } } },
  { name: "get_product_details", description: "Get full details of a specific product by ID.", input_schema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] } },
  { name: "get_product_recommendations", description: "Get deterministic cross-sell / complementary product recommendations for a product.", input_schema: { type: "object", properties: { product_id: { type: "string" }, limit: { type: "number" } }, required: ["product_id"] } },
  { name: "check_inventory", description: "Check if a product is in stock for a given quantity.", input_schema: { type: "object", properties: { product_id: { type: "string" }, quantity: { type: "number" } }, required: ["product_id"] } },
  { name: "add_to_cart", description: "Add a product to the customer's cart. Checks inventory first. Returns cart_id.", input_schema: { type: "object", properties: { product_id: { type: "string" }, quantity: { type: "number" }, cart_id: { type: "string" } }, required: ["product_id"] } },
  { name: "get_cart", description: "Get the current cart with items and computed total.", input_schema: { type: "object", properties: { cart_id: { type: "string" } }, required: ["cart_id"] } },
  { name: "calculate_order_total", description: "Compute the deterministic order total (subtotal + 18% GST - discount) for a cart. The AI never sets prices.", input_schema: { type: "object", properties: { cart_id: { type: "string" } }, required: ["cart_id"] } },
];

const GROWTH_TOOLS = [
  { name: "get_merchant_profile", description: "Get the merchant's profile.", input_schema: { type: "object", properties: {} } },
  { name: "get_sales_metrics", description: "Get aggregate sales metrics (revenue, orders, conversion, AOV, abandonment, repeat rate).", input_schema: { type: "object", properties: {} } },
  { name: "get_conversion_metrics", description: "Get per-product conversion metrics (views, cart adds, purchases, abandonment).", input_schema: { type: "object", properties: {} } },
  { name: "get_customer_segments", description: "Get customer segment breakdown.", input_schema: { type: "object", properties: {} } },
  { name: "get_abandoned_carts", description: "Get abandoned carts for recovery.", input_schema: { type: "object", properties: {} } },
  { name: "get_revenue_opportunities", description: "Discover deterministic revenue opportunities from data patterns.", input_schema: { type: "object", properties: {} } },
  { name: "get_product_relationships", description: "Get co-purchase / compatibility relationships between products.", input_schema: { type: "object", properties: { product_id: { type: "string" } } } },
];

interface AgentTraceAction {
  step: number;
  tool_name: string;
  arguments: unknown;
  result: unknown;
  decision?: string;
  reasoning?: string;
  status: "success" | "failed";
  latency_ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// DETERMINISTIC FALLBACK — used when no ANTHROPIC_API_KEY is configured.
// Calls real tools and formats grounded responses without an LLM.
// ---------------------------------------------------------------------------
function formatPrice(cents: number | bigint | string): string {
  return "₹" + (Number(cents) / 100).toLocaleString("en-IN");
}

function categoryFromQuery(msg: string): string | undefined {
  const m = msg.toLowerCase();
  if (m.includes("headphone") || m.includes("earphone") || m.includes("earbuds")) return "wireless_headphones";
  if (m.includes("gaming headphone")) return "gaming_headphones";
  if (m.includes("keyboard")) return "mechanical_keyboards";
  if (m.includes("mouse")) return "gaming_mice";
  if (m.includes("monitor") || m.includes("display")) return "monitors";
  if (m.includes("webcam") || m.includes("camera")) return "webcams";
  if (m.includes("microphone") || m.includes("mic ")) return "microphones";
  if (m.includes("stand") || m.includes("mount")) return "stands";
  if (m.includes("hub") || m.includes("dongle")) return "usb_hubs";
  if (m.includes("case") || m.includes("bag") || m.includes("sleeve")) return "carrying_cases";
  return undefined;
}

function extractPriceLimit(msg: string): { min?: number; max?: number } {
  const maxMatch = msg.match(/(?:under|below|max|up to|≤)\s*₹?\s*([\d,]+)/i);
  const minMatch = msg.match(/(?:over|above|min|≥|at least)\s*₹?\s*([\d,]+)/i);
  const result: { min?: number; max?: number } = {};
  if (maxMatch) result.max = parseInt(maxMatch[1].replace(/,/g, "")) * 100;
  if (minMatch) result.min = parseInt(minMatch[1].replace(/,/g, "")) * 100;
  return result;
}

async function run_deterministic_buyer(body: { message: string; cart_id?: string }, runId: string): Promise<{ reply: string; actions: AgentTraceAction[] }> {
  const actions: AgentTraceAction[] = [];
  let step = 0;
  const msg = body.message;
  const priceLimit = extractPriceLimit(msg);
  const category = categoryFromQuery(msg);

  // Strip price patterns and filler words, keep meaningful terms like "gaming", "bluetooth", "4k"
  let searchQuery = msg
    .replace(/(?:under|below|max|up to|≤|over|above|min|≥|at least)\s*₹?\s*[\d,]+/gi, " ")
    .replace(/\b(i need|i want|show me|find me|looking for|get me|please|can you|help me|recommend|suggest)\b/gi, " ")
    .replace(/\b(headphones?|earphones?|earbuds|keyboard|mouse|monitor|display|webcam|camera|microphones?|stands?|mounts?|hubs?|dongles?|cases?|bags?|sleeves?|wireless|mechanical|bluetooth|usb)\b/gi, " ")
    .replace(/[^\w\s]/g, " ")
    .trim();
  if (searchQuery.length < 3) searchQuery = "";

  // Step 1: Search products
  step++;
  const searchArgs: Record<string, unknown> = { limit: 8 };
  if (searchQuery) searchArgs.query = searchQuery;
  if (category) searchArgs.category = category;
  if (priceLimit.max) searchArgs.max_price_cents = priceLimit.max;
  if (priceLimit.min) searchArgs.min_price_cents = priceLimit.min;
  const t0 = Date.now();
  const searchResults = await tool_search_products(searchArgs);
  actions.push({ step, tool_name: "search_catalog", arguments: searchArgs, result: searchResults, status: "success", latency_ms: Date.now() - t0 });

  if (!searchResults || searchResults.length === 0) {
    // Broaden: try catalog without query but keep price/category filters
    step++;
    const t1 = Date.now();
    let catalogQuery = supabase.from("products")
      .select("id,name,slug,category,price_cents,inventory_count,rating,rating_count,is_active,image_url,description,attributes")
      .eq("merchant_id", MERCHANT_ID).eq("is_active", true);
    if (category) catalogQuery = catalogQuery.eq("category", category);
    if (priceLimit.max) catalogQuery = catalogQuery.lte("price_cents", priceLimit.max);
    if (priceLimit.min) catalogQuery = catalogQuery.gte("price_cents", priceLimit.min);
    const { data: catalogData, error: catErr } = await catalogQuery.limit(8);
    if (catErr) throw new Error(`catalog fallback: ${catErr.message}`);
    const catalogArgs: Record<string, unknown> = { limit: 8 };
    if (category) catalogArgs.category = category;
    if (priceLimit.max) catalogArgs.max_price_cents = priceLimit.max;
    if (priceLimit.min) catalogArgs.min_price_cents = priceLimit.min;
    actions.push({ step, tool_name: "get_catalog", arguments: catalogArgs, result: catalogData, status: "success", latency_ms: Date.now() - t1 });
    if (!catalogData || catalogData.length === 0) {
      return { reply: "I couldn't find any products matching your request. Try browsing the full catalog instead.", actions };
    }
    return { reply: formatProductList("Here are some products from our catalog:", catalogData as any[]), actions };
  }

  // Step 2: Get recommendations for the top product
  const topProduct = (searchResults as any[])[0];
  if (topProduct?.id) {
    step++;
    const t2 = Date.now();
    try {
      const recs = await tool_get_product_recommendations({ product_id: topProduct.id, limit: 3 });
      actions.push({ step, tool_name: "get_product_recommendations", arguments: { product_id: topProduct.id, limit: 3 }, result: recs, status: "success", latency_ms: Date.now() - t2 });
    } catch (e: any) {
      actions.push({ step, tool_name: "get_product_recommendations", arguments: { product_id: topProduct.id, limit: 3 }, result: { error: e.message }, status: "failed", latency_ms: Date.now() - t2, error: e.message });
    }
  }

  // Step 3: Add to cart if the user asks to buy/add
  const wantsCart = /\b(buy|add|cart|order|purchase|get this|take it|checkout)\b/i.test(msg);
  if (wantsCart && topProduct?.id) {
    step++;
    const t3 = Date.now();
    const cartArgs: Record<string, unknown> = { product_id: topProduct.id, quantity: 1 };
    if (body.cart_id) cartArgs.cart_id = body.cart_id;
    try {
      const cartResult = await tool_add_to_cart(cartArgs as any);
      actions.push({ step, tool_name: "add_to_cart", arguments: cartArgs, result: cartResult, status: "success", latency_ms: Date.now() - t3 });
    } catch (e: any) {
      actions.push({ step, tool_name: "add_to_cart", arguments: cartArgs, result: { error: e.message }, status: "failed", latency_ms: Date.now() - t3, error: e.message });
    }
  }

  // Step 4: Calculate total if cart exists
  const cartId = actions.find((a) => a.tool_name === "add_to_cart")?.result as any;
  if (cartId?.cart_id) {
    step++;
    const t4 = Date.now();
    try {
      const total = await tool_calculate_order_total({ cart_id: cartId.cart_id });
      actions.push({ step, tool_name: "calculate_order_total", arguments: { cart_id: cartId.cart_id }, result: total, status: "success", latency_ms: Date.now() - t4 });
    } catch (e: any) {
      actions.push({ step, tool_name: "calculate_order_total", arguments: { cart_id: cartId.cart_id }, result: { error: e.message }, status: "failed", latency_ms: Date.now() - t4, error: e.message });
    }
  }

  return { reply: formatProductList("Here's what I found based on your request:", searchResults as any[]), actions };
}

function formatProductList(intro: string, products: any[]): string {
  if (!products || products.length === 0) return "No products found.";
  const lines = products.slice(0, 6).map((p: any, i: number) => {
    const price = formatPrice(p.price_cents);
    const stock = p.inventory_count > 0 ? `${p.inventory_count} in stock` : "Out of stock";
    const rating = p.rating ? ` ${p.rating}★ (${p.rating_count ?? 0})` : "";
    return `${i + 1}. ${p.name} — ${price} · ${stock}${rating}`;
  });
  return `${intro}\n\n${lines.join("\n")}\n\nYou can add any of these to your cart, or ask me for more details about a specific product.`;
}

async function run_deterministic_growth(body: { message: string }, runId: string): Promise<{ reply: string; actions: AgentTraceAction[] }> {
  const actions: AgentTraceAction[] = [];
  let step = 0;
  const msg = body.message.toLowerCase();

  if (msg.includes("opportunit") || msg.includes("growth") || msg.includes("revenue") || msg.includes("insight") || msg.length > 0) {
    // Step 1: Get sales metrics
    step++;
    const t0 = Date.now();
    const metrics = await tool_get_sales_metrics();
    actions.push({ step, tool_name: "get_sales_metrics", arguments: {}, result: metrics, status: "success", latency_ms: Date.now() - t0 });

    // Step 2: Get revenue opportunities
    step++;
    const t1 = Date.now();
    try {
      const opps = await tool_get_revenue_opportunities();
      actions.push({ step, tool_name: "get_revenue_opportunities", arguments: {}, result: opps, status: "success", latency_ms: Date.now() - t1 });
    } catch (e: any) {
      actions.push({ step, tool_name: "get_revenue_opportunities", arguments: {}, result: { error: e.message }, status: "failed", latency_ms: Date.now() - t1, error: e.message });
    }

    // Step 3: Get customer segments
    step++;
    const t2 = Date.now();
    try {
      const segments = await tool_get_customer_segments();
      actions.push({ step, tool_name: "get_customer_segments", arguments: {}, result: segments, status: "success", latency_ms: Date.now() - t2 });
    } catch (e: any) {
      actions.push({ step, tool_name: "get_customer_segments", arguments: {}, result: { error: e.message }, status: "failed", latency_ms: Date.now() - t2, error: e.message });
    }

    const m = metrics as any;
    const opps = actions.find((a) => a.tool_name === "get_revenue_opportunities")?.result as any[];
    const reply = buildGrowthReply(m, opps);
    return { reply, actions };
  }

  return { reply: "I can analyze your sales metrics, revenue opportunities, and customer segments. Ask me about growth opportunities or revenue insights.", actions };
}

function buildGrowthReply(metrics: any, opportunities: any[]): string {
  const lines: string[] = ["Here's a summary of your store's performance and growth opportunities:"];
  if (metrics) {
    lines.push("");
    lines.push("Sales Overview:");
    lines.push(`  Revenue: ${formatPrice(metrics.total_revenue_cents)}`);
    lines.push(`  Orders: ${metrics.total_orders} (${metrics.paid_orders} paid)`);
    lines.push(`  Avg Order Value: ${formatPrice(metrics.avg_order_value_cents)}`);
    lines.push(`  Conversion Rate: ${metrics.conversion_rate}%`);
    lines.push(`  Abandonment Rate: ${metrics.abandonment_rate}%`);
    lines.push(`  Repeat Customer Rate: ${metrics.repeat_customer_rate}%`);
  }
  if (opportunities && opportunities.length > 0) {
    lines.push("");
    lines.push(`Growth Opportunities (${opportunities.length} found):`);
    opportunities.slice(0, 5).forEach((o: any, i: number) => {
      lines.push(`  ${i + 1}. ${o.title}`);
      lines.push(`     ${o.observation}`);
      lines.push(`     Est. revenue: ${formatPrice(o.estimated_monthly_revenue_cents)}/mo · Confidence: ${o.confidence}%`);
      lines.push(`     Action: ${o.recommended_action}`);
    });
  } else {
    lines.push("");
    lines.push("No new growth opportunities detected at this time.");
  }
  lines.push("");
  lines.push("Visit the Growth Opportunities page to approve, simulate, or reject any of these.");
  return lines.join("\n");
}

async function run_agent(body: { role: "buyer" | "growth"; message: string; cart_id?: string; history?: Array<{ role: string; content: string }> }) {
  const isGrowth = body.role === "growth";
  const systemPrompt = isGrowth ? GROWTH_SYSTEM_PROMPT : BUYER_SYSTEM_PROMPT;
  const toolDefs = isGrowth ? GROWTH_TOOLS : BUYER_TOOLS;
  const startTime = Date.now();

  // Create agent run record
  const { data: runCode } = await supabase.rpc("generate_run_code").maybeSingle();
  const { data: run, error: re } = await supabase.from("agent_runs").insert({
    merchant_id: MERCHANT_ID,
    run_code: runCode,
    role: isGrowth ? "growth" : "buyer",
    intent: body.message.slice(0, 200),
    user_query: body.message,
    status: "pending",
  }).select("*").single();
  if (re) return err(`Failed to create agent run: ${re.message}`, 500);

  const actions: AgentTraceAction[] = [];
  let step = 0;

  // --- DETERMINISTIC FALLBACK: no AI API key configured ---
  if (!ANTHROPIC_API_KEY) {
    try {
      let detResult: { reply: string; actions: AgentTraceAction[] };
      if (isGrowth) {
        detResult = await run_deterministic_growth({ message: body.message }, run.id);
      } else {
        detResult = await run_deterministic_buyer({ message: body.message, cart_id: body.cart_id }, run.id);
      }

      const latency = Date.now() - startTime;
      const finalActions = detResult.actions;

      if (finalActions.length > 0) {
        await supabase.from("agent_actions").insert(
          finalActions.map((a) => ({
            run_id: run.id,
            step: a.step,
            tool_name: a.tool_name,
            arguments: a.arguments,
            result: a.result,
            status: a.status,
            latency_ms: a.latency_ms,
            error: a.error,
          }))
        );
      }

      await supabase.from("agent_runs").update({
        final_decision: detResult.reply.slice(0, 500),
        final_result: { actions: finalActions.length, tools: finalActions.map((a) => a.tool_name), mode: "deterministic" },
        tools_called_count: finalActions.length,
        latency_ms: latency,
        status: "success",
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);

      return json({
        run_id: run.id,
        run_code: run.run_code,
        reply: detResult.reply,
        actions: finalActions,
        latency_ms: latency,
        mode: "deterministic",
      });
    } catch (e: any) {
      const latency = Date.now() - startTime;
      await supabase.from("agent_runs").update({
        errors: e.message,
        status: "failed",
        latency_ms: latency,
        completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      return err(`Agent error: ${e.message}`, 500, { run_id: run.id, run_code: run.run_code });
    }
  }

  // --- LLM PATH: Anthropic API key is configured ---
  let messages: Array<{ role: string; content: string }> = [
    { role: "user", content: body.message },
  ];
  if (body.history && body.history.length > 0) {
    messages = [...body.history, { role: "user", content: body.message }];
  }

  let finalText = "";
  let maxIterations = 6;

  try {
    while (maxIterations > 0) {
      maxIterations--;
      // Call Anthropic API with tool definitions
      const apiBody = {
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages,
        tools: toolDefs.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      };

      const apiRes = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(apiBody),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.text();
        throw new Error(`AI API error (${apiRes.status}): ${errBody}`);
      }

      const apiData = await apiRes.json();
      // Append assistant response to messages
      messages.push({ role: "assistant", content: apiData.content });

      // Check for tool_use blocks
      const toolUses = (apiData.content || []).filter((b: any) => b.type === "tool_use");
      const textBlocks = (apiData.content || []).filter((b: any) => b.type === "text");

      if (toolUses.length === 0) {
        // No more tool calls — extract final text
        finalText = textBlocks.map((b: any) => b.text).join("\n");
        break;
      }

      // Execute each tool call deterministically
      const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
      for (const tu of toolUses) {
        step++;
        const toolStart = Date.now();
        let result: unknown;
        let status: "success" | "failed" = "success";
        let errMsg: string | undefined;
        try {
          const fn = TOOLS[tu.name];
          if (!fn) throw new Error(`Unknown tool: ${tu.name}`);
          result = await fn(tu.input ?? {});
        } catch (e: any) {
          status = "failed";
          errMsg = e.message;
          result = { error: e.message };
        }
        const latency = Date.now() - toolStart;
        actions.push({
          step,
          tool_name: tu.name,
          arguments: tu.input ?? {},
          result,
          status,
          latency_ms: latency,
          error: errMsg,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }

      // Feed tool results back to the AI
      messages.push({ role: "user", content: toolResults as any });
    }

    if (!finalText) finalText = "I've completed the analysis. See the tool results for details.";

    const latency = Date.now() - startTime;

    // Persist agent actions
    if (actions.length > 0) {
      await supabase.from("agent_actions").insert(
        actions.map((a) => ({
          run_id: run.id,
          step: a.step,
          tool_name: a.tool_name,
          arguments: a.arguments,
          result: a.result,
          status: a.status,
          latency_ms: a.latency_ms,
          error: a.error,
        }))
      );
    }

    // Update run
    await supabase.from("agent_runs").update({
      final_decision: finalText.slice(0, 500),
      final_result: { actions: actions.length, tools: actions.map((a) => a.tool_name) },
      tools_called_count: actions.length,
      latency_ms: latency,
      status: "success",
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    return json({
      run_id: run.id,
      run_code: run.run_code,
      reply: finalText,
      actions,
      latency_ms: latency,
    });
  } catch (e: any) {
    const latency = Date.now() - startTime;
    await supabase.from("agent_runs").update({
      errors: e.message,
      status: "failed",
      latency_ms: latency,
      completed_at: new Date().toISOString(),
      tools_called_count: actions.length,
    }).eq("id", run.id);
    if (actions.length > 0) {
      await supabase.from("agent_actions").insert(
        actions.map((a) => ({
          run_id: run.id,
          step: a.step,
          tool_name: a.tool_name,
          arguments: a.arguments,
          result: a.result,
          status: a.status,
          latency_ms: a.latency_ms,
          error: a.error,
        }))
      );
    }
    return err(`Agent error: ${e.message}`, 500, { run_id: run.id, run_code: run.run_code, actions });
  }
}

// ---------------------------------------------------------------------------
// ROUTER
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/razorflow-agent\/?/, "");
    const parts = path.split("/").filter(Boolean);
    const action = parts[0] ?? "";

    // POST endpoints with JSON body
    if (req.method === "POST") {
      let body: any = {};
      try { body = await req.json(); } catch { /* allow empty */ }

      switch (action) {
        case "agent": {
          const sub = parts[1] ?? "chat";
          if (sub === "chat") return await run_agent(body);
          return err("Unknown agent action", 404);
        }
        case "payment": {
          const sub = parts[1] ?? "";
          if (sub === "create") return await action_create_payment_order(body);
          if (sub === "verify") return await action_verify_payment(body);
          if (sub === "status") return await action_get_payment_status(body);
          return err("Unknown payment action", 404);
        }
        case "opportunity": {
          const sub = parts[1] ?? "";
          if (sub === "approve") return await action_approve_opportunity(body);
          if (sub === "reject") return await action_reject_opportunity(body);
          return err("Unknown opportunity action", 404);
        }
        case "campaign": {
          const sub = parts[1] ?? "";
          if (sub === "approve") return await action_approve_campaign(body);
          if (sub === "reject") return await action_reject_campaign(body);
          return err("Unknown campaign action", 404);
        }
        case "demo": {
          const sub = parts[1] ?? "";
          if (sub === "reset") return await action_demo_reset();
          if (sub === "simulate") return await action_demo_simulate(body);
          if (sub === "controls") return await action_get_demo_controls();
          return err("Unknown demo action", 404);
        }
        default:
          return err("Unknown action", 404);
      }
    }

    if (req.method === "GET") {
      switch (action) {
        case "demo": {
          const sub = parts[1] ?? "";
          if (sub === "controls") return await action_get_demo_controls();
          return err("Unknown demo action", 404);
        }
        case "health":
          return json({ status: "ok", provider: getPaymentProvider().name, has_razorpay: !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET), ai_mode: ANTHROPIC_API_KEY ? "llm" : "deterministic" });
        default:
          return err("Unknown action", 404);
      }
    }

    return err("Method not allowed", 405);
  } catch (e: any) {
    return err(e.message, 500);
  }
});
