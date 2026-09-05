import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Trash2, ArrowRight, Package } from "lucide-react";
import { Loading, EmptyState } from "@/components/States";
import { useCart } from "@/lib/cart-context";
import { supabase } from "@/lib/supabase";
import { formatINRDecimal, categoryLabel } from "@/lib/utils";

export function ShopCart() {
  const { cartId, items, loading, refresh, removeItem } = useCart();
  const [totals, setTotals] = useState<{ subtotal_cents: number; tax_cents: number; total_cents: number } | null>(null);
  const [loadingTotals, setLoadingTotals] = useState(false);

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!cartId || items.length === 0) { setTotals(null); return; }
    setLoadingTotals(true);
    (async () => {
      try {
        const { data } = await supabase.rpc("calculate_order_total", { p_cart_id: cartId, p_discount_cents: 0, p_tax_rate: 18.0 });
        setTotals(data);
      } catch {
        setTotals(null);
      } finally {
        setLoadingTotals(false);
      }
    })();
  }, [cartId, items]);

  if (loading) return <Loading message="Loading cart..." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Your Cart</h1>
        <p className="text-sm text-ink-500 mt-1">{items.length} item{items.length !== 1 ? "s" : ""}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="w-10 h-10" />}
          title="Your cart is empty"
          description="Chat with the AI Buyer or browse the catalog to add products."
          action={<Link to="/shop" className="btn-primary">Browse Catalog</Link>}
        />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="card p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-ink-100 overflow-hidden shrink-0">
                  {item.product?.image_url ? (
                    <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink-300">
                      <Package className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{item.product?.name ?? "Unknown product"}</p>
                  <p className="text-xs text-ink-400">{item.product ? categoryLabel(item.product.category) : ""}</p>
                  <p className="text-xs text-ink-500 mt-1">Qty: {item.quantity} · {formatINRDecimal(item.unit_price_cents)} each</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-ink-900">{formatINRDecimal(item.unit_price_cents * item.quantity)}</p>
                  <button onClick={() => removeItem(item.product_id)} className="text-xs text-error-500 hover:text-error-700 mt-1 flex items-center gap-1 ml-auto">
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-5 h-fit sticky top-24">
            <h2 className="text-sm font-semibold text-ink-900 mb-4">Order Summary</h2>
            {loadingTotals || !totals ? (
              <div className="h-24 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-ink-200 border-t-brand-600 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span className="text-ink-900">{formatINRDecimal(totals.subtotal_cents)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">GST (18%)</span><span className="text-ink-900">{formatINRDecimal(totals.tax_cents)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Discount</span><span className="text-ink-900">₹0.00</span></div>
                  <div className="border-t border-ink-100 pt-2 mt-2 flex justify-between">
                    <span className="font-semibold text-ink-900">Total</span>
                    <span className="font-semibold text-ink-900">{formatINRDecimal(totals.total_cents)}</span>
                  </div>
                </div>
                <p className="text-xs text-ink-400 mt-3">Total computed deterministically. Tax calculated server-side.</p>
                <Link to="/shop/checkout" className="btn-primary w-full mt-4">
                  Checkout <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
