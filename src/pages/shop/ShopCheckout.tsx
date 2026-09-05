import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2, AlertCircle, ArrowLeft, CreditCard } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { edgeFetch, formatINRDecimal } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Loading, EmptyState } from "@/components/States";
import { Link } from "react-router-dom";

interface CheckoutTotal {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  items: Array<{ product_id: string; quantity: number; unit_price_cents: number; line_total_cents: number }>;
}

interface CreatedOrder {
  id: string;
  order_number: string;
  total_cents: number;
  status: string;
  failure_reason?: string | null;
  razorpay_order_id?: string | null;
}

interface PaymentResponse {
  order: CreatedOrder;
  payment?: { razorpay_order_id: string; amount_cents: number; status: string; provider: string };
  total: CheckoutTotal;
  key_id?: string;
  simulated_failure?: boolean;
  idempotent?: boolean;
}

export function ShopCheckout() {
  const { cartId, items, refresh } = useCart();
  const navigate = useNavigate();
  const [totals, setTotals] = useState<CheckoutTotal | null>(null);
  const [loadingTotals, setLoadingTotals] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<PaymentResponse | null>(null);

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!cartId || items.length === 0) { setTotals(null); setLoadingTotals(false); return; }
    setLoadingTotals(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("calculate_order_total", { p_cart_id: cartId, p_discount_cents: 0, p_tax_rate: 18.0 });
        if (error) throw error;
        setTotals(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingTotals(false);
      }
    })();
  }, [cartId, items]);

  const createOrder = async () => {
    if (!cartId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await edgeFetch<PaymentResponse>("/payment/create", { cart_id: cartId });
      setCreatedOrder(res);
      if (res.simulated_failure) {
        // Demo failure — stay on page, show error
        setError("Demo: simulated payment failure. Your cart has been preserved. No duplicate order was created. You can safely retry.");
        return;
      }
      if (res.idempotent) {
        // Order already exists — go to confirmation
        navigate(`/shop/order/${res.order.id}`);
        return;
      }
      // If we have a Razorpay key, open checkout; otherwise mock-confirm
      if (res.key_id && res.key_id !== "mock_key" && res.payment) {
        openRazorpayCheckout(res);
      } else {
        // Mock provider — simulate a successful "demo_captured" verification
        await mockConfirmPayment(res);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const openRazorpayCheckout = (res: PaymentResponse) => {
    // Load Razorpay checkout script
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      const rzp = (window as any).Razorpay({
        key: res.key_id,
        amount: res.total.total_cents,
        currency: "INR",
        name: "NexaGear",
        description: `Order ${res.order.order_number}`,
        order_id: res.payment?.razorpay_order_id,
        handler: async (response: any) => {
          // Verify payment on server
          try {
            const verifyRes = await edgeFetch<{ verified: boolean; order: CreatedOrder }>("/payment/verify", {
              order_id: res.order.id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            navigate(`/shop/order/${verifyRes.order.id}`);
          } catch (e: any) {
            setError(`Payment verification failed: ${e.message}. Your cart is preserved.`);
          }
        },
        modal: {
          ondismiss: () => {
            setError("Payment was cancelled. Your cart is preserved — no duplicate order was created.");
            setCreatedOrder(null);
          },
        },
        theme: { color: "#1d57f5" },
      });
      rzp.open();
    };
    script.onerror = () => setError("Failed to load Razorpay checkout. Please try again.");
    document.body.appendChild(script);
  };

  const mockConfirmPayment = async (res: PaymentResponse) => {
    if (!res.payment) { navigate(`/shop/order/${res.order.id}`); return; }
    try {
      const verifyRes = await edgeFetch<{ verified: boolean; order: CreatedOrder }>("/payment/verify", {
        order_id: res.order.id,
        razorpay_payment_id: `mock_pay_${res.order.order_number}`,
        razorpay_order_id: res.payment.razorpay_order_id,
        razorpay_signature: `mock_sig_${res.payment.razorpay_order_id}`,
      });
      navigate(`/shop/order/${verifyRes.order.id}`);
    } catch (e: any) {
      setError(`Payment confirmation failed: ${e.message}. Your cart is preserved.`);
    }
  };

  if (loadingTotals) return <Loading message="Loading checkout..." />;
  if (items.length === 0 && !createdOrder) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add products before checking out."
        action={<Link to="/shop/products" className="btn-primary">Browse Catalog</Link>}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <Link to="/shop/cart" className="text-xs text-ink-500 hover:text-ink-700 flex items-center gap-1 mb-3">
          <ArrowLeft className="w-3 h-3" /> Back to cart
        </Link>
        <h1 className="text-2xl font-semibold text-ink-900">Checkout</h1>
        <p className="text-sm text-ink-500 mt-1">Secure payment via Razorpay Test Mode. Total computed deterministically.</p>
      </div>

      {error && (
        <div className="card p-4 border-error-200 bg-error-50 animate-slide-down">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-error-700">Payment could not be completed</p>
              <p className="text-xs text-error-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Order summary */}
      {totals && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900 mb-4">Order Summary</h2>
          <div className="space-y-3">
            {totals.items.map((it) => (
              <div key={it.product_id} className="flex justify-between text-sm">
                <span className="text-ink-600">Qty {it.quantity} × {formatINRDecimal(it.unit_price_cents)}</span>
                <span className="text-ink-900 font-medium">{formatINRDecimal(it.line_total_cents)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-ink-100 mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span className="text-ink-900">{formatINRDecimal(totals.subtotal_cents)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">GST (18%)</span><span className="text-ink-900">{formatINRDecimal(totals.tax_cents)}</span></div>
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-ink-100">
              <span className="text-ink-900">Total</span>
              <span className="text-ink-900">{formatINRDecimal(totals.total_cents)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Payment */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-ink-900">Payment</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-500 mb-4">
          <ShieldCheck className="w-4 h-4 text-success-600" />
          Cryptographic signature verification · Idempotent order creation · Cart preserved on failure
        </div>
        <button onClick={createOrder} disabled={creating || !totals} className="btn-primary w-full">
          {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating order...</> : <><CreditCard className="w-4 h-4" /> Pay {totals ? formatINRDecimal(totals.total_cents) : ""}</>}
        </button>
        <p className="text-xs text-ink-400 mt-3 text-center">
          By proceeding, you agree to pay via Razorpay Test Mode. No real charges occur.
        </p>
      </div>
    </div>
  );
}
