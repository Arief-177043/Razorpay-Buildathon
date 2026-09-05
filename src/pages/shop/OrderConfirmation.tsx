import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Package, ArrowRight, RotateCcw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatINRDecimal, timeAgo } from "@/lib/utils";
import { Loading, ErrorState } from "@/components/States";
import type { Order, OrderItem, Payment } from "@/lib/types";

export function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: ord, error: oe } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (oe || !ord) { setError("Order not found"); return; }
      setOrder(ord);
      const [itemsRes, paysRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", id),
        supabase.from("payments").select("*").eq("order_id", id),
      ]);
      setItems(itemsRes.data ?? []);
      setPayments(paysRes.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  if (loading) return <Loading message="Loading order..." />;
  if (error) return <ErrorState message={error} />;
  if (!order) return null;

  const isPaid = order.status === "paid";
  const isFailed = order.status === "failed";

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Status hero */}
      <div className={`card p-8 text-center ${isPaid ? "border-success-200" : isFailed ? "border-error-200" : ""}`}>
        <div className={`flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-4 ${isPaid ? "bg-success-100 text-success-600" : isFailed ? "bg-error-100 text-error-600" : "bg-ink-100 text-ink-500"}`}>
          {isPaid ? <CheckCircle className="w-8 h-8" /> : isFailed ? <XCircle className="w-8 h-8" /> : <Package className="w-8 h-8" />}
        </div>
        <h1 className="text-xl font-semibold text-ink-900">
          {isPaid ? "Payment Successful" : isFailed ? "Payment Failed" : "Order Created"}
        </h1>
        <p className="text-sm text-ink-500 mt-2">
          {isPaid
            ? `Your order ${order.order_number} has been confirmed.`
            : isFailed
            ? `Order ${order.order_number} could not be completed.`
            : `Order ${order.order_number} is being processed.`}
        </p>
        {order.failure_reason && (
          <div className="mt-4 p-3 rounded-lg bg-error-50 border border-error-100">
            <p className="text-sm font-medium text-error-700">{order.failure_reason}</p>
          </div>
        )}
        {isFailed && (
          <div className="mt-4 p-4 rounded-lg bg-ink-50 text-left">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-700 mb-2">
              <ShieldCheck className="w-4 h-4 text-success-600" /> Failure Recovery
            </div>
            <ul className="text-xs text-ink-600 space-y-1">
              <li>✓ Your cart has been preserved</li>
              <li>✓ No duplicate order was created</li>
              <li>✓ The failure has been recorded in the audit trail</li>
              <li>✓ You can safely retry the checkout</li>
            </ul>
          </div>
        )}
        <div className="flex items-center justify-center gap-3 mt-6">
          {isFailed ? (
            <Link to="/shop/cart" className="btn-primary">
              <RotateCcw className="w-4 h-4" /> Retry Checkout
            </Link>
          ) : (
            <Link to="/shop" className="btn-secondary">
              Continue Shopping
            </Link>
          )}
          <Link to="/shop/products" className="btn-ghost">Browse Catalog <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>

      {/* Order details */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-ink-900 mb-4">Order Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div><p className="text-xs text-ink-400">Order Number</p><p className="text-ink-900 font-medium font-mono mt-0.5">{order.order_number}</p></div>
          <div><p className="text-xs text-ink-400">Date</p><p className="text-ink-900 font-medium mt-0.5">{timeAgo(order.created_at)}</p></div>
          <div><p className="text-xs text-ink-400">Status</p><p className="mt-0.5"><span className={isPaid ? "badge-success" : isFailed ? "badge-error" : "badge-neutral"}>{order.status}</span></p></div>
          <div><p className="text-xs text-ink-400">Items</p><p className="text-ink-900 font-medium mt-0.5">{order.items_count}</p></div>
        </div>
        <div className="border-t border-ink-100 pt-4 space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex justify-between text-sm">
              <span className="text-ink-600">Qty {it.quantity} × {it.product_name}</span>
              <span className="text-ink-900 font-medium">{formatINRDecimal(it.total_cents)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-ink-100 mt-4 pt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span className="text-ink-900">{formatINRDecimal(order.subtotal_cents)}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">GST (18%)</span><span className="text-ink-900">{formatINRDecimal(order.tax_cents)}</span></div>
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-ink-100">
            <span className="text-ink-900">Total</span><span className="text-ink-900">{formatINRDecimal(order.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Payment info */}
      {payments.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900 mb-4">Payment</h2>
          {payments.map((pay) => (
            <div key={pay.id} className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">Provider</span><span className="text-ink-900 font-medium">{pay.provider}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Status</span><span className={pay.status === "captured" ? "badge-success" : pay.status === "failed" ? "badge-error" : "badge-neutral"}>{pay.status}</span></div>
              {pay.method && <div className="flex justify-between"><span className="text-ink-500">Method</span><span className="text-ink-900">{pay.method}</span></div>}
              {pay.razorpay_payment_id && <div className="flex justify-between"><span className="text-ink-500">Payment ID</span><span className="text-ink-900 font-mono text-xs">{pay.razorpay_payment_id}</span></div>}
              {pay.razorpay_order_id && <div className="flex justify-between"><span className="text-ink-500">Razorpay Order</span><span className="text-ink-900 font-mono text-xs">{pay.razorpay_order_id}</span></div>}
              {pay.verified && <div className="flex items-center gap-2 text-xs text-success-600 pt-2"><ShieldCheck className="w-3.5 h-3.5" /> Signature verified cryptographically</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
