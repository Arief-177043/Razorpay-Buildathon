import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loading, ErrorState } from "@/components/States";
import { formatPercent, formatNumber, categoryLabel } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function MerchantAnalytics() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
        .order("views_count", { ascending: false });
      if (error) throw error;
      setProducts(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Loading message="Loading analytics..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const topByViews = [...products].sort((a, b) => b.views_count - a.views_count).slice(0, 10);
  const topByConversion = [...products].filter((p) => p.views_count > 100).sort((a, b) => {
    const ca = a.views_count > 0 ? a.purchase_count / a.views_count : 0;
    const cb = b.views_count > 0 ? b.purchase_count / b.views_count : 0;
    return cb - ca;
  }).slice(0, 10);
  const topByAbandonment = [...products].filter((p) => p.add_to_cart_count > 50).sort((a, b) => {
    const aa = a.add_to_cart_count > 0 ? a.abandonment_count / a.add_to_cart_count : 0;
    const ab = b.add_to_cart_count > 0 ? b.abandonment_count / b.add_to_cart_count : 0;
    return ab - aa;
  }).slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Analytics</h1>
        <p className="text-sm text-ink-500 mt-1">Product performance, conversion, and abandonment breakdown.</p>
      </div>

      <AnalyticsTable title="Top Products by Traffic" description="High views — check if conversion follows" products={topByViews} metric="views" />
      <AnalyticsTable title="Top Products by Conversion" description="Best view-to-purchase ratio" products={topByConversion} metric="conversion" />
      <AnalyticsTable title="Highest Abandonment Rate" description="Cart adds that didn't convert — recovery candidates" products={topByAbandonment} metric="abandonment" />
    </div>
  );
}

function AnalyticsTable({ title, description, products, metric }: { title: string; description: string; products: Product[]; metric: "views" | "conversion" | "abandonment" }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-100">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <p className="text-xs text-ink-400 mt-0.5">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/50">
              <th className="text-left font-medium text-ink-500 px-4 py-2.5">Product</th>
              <th className="text-left font-medium text-ink-500 px-4 py-2.5">Category</th>
              <th className="text-right font-medium text-ink-500 px-4 py-2.5">Views</th>
              <th className="text-right font-medium text-ink-500 px-4 py-2.5">Cart Adds</th>
              <th className="text-right font-medium text-ink-500 px-4 py-2.5">Purchases</th>
              {metric === "abandonment" && <th className="text-right font-medium text-ink-500 px-4 py-2.5">Abandoned</th>}
              <th className="text-right font-medium text-ink-500 px-4 py-2.5">{metric === "views" ? "Views" : metric === "conversion" ? "Conv." : "Abandon %"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {products.map((p) => {
              const conv = p.views_count > 0 ? (p.purchase_count / p.views_count) * 100 : 0;
              const abandon = p.add_to_cart_count > 0 ? (p.abandonment_count / p.add_to_cart_count) * 100 : 0;
              const value = metric === "views" ? formatNumber(p.views_count) : metric === "conversion" ? formatPercent(conv, 1) : formatPercent(abandon, 1);
              const valueClass = metric === "conversion" ? (conv < 2 ? "text-warning-600" : "text-success-600") : metric === "abandonment" ? "text-error-600" : "text-ink-900";
              return (
                <tr key={p.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-2.5 font-medium text-ink-900">{p.name}</td>
                  <td className="px-4 py-2.5 text-ink-600">{categoryLabel(p.category)}</td>
                  <td className="px-4 py-2.5 text-right text-ink-600">{formatNumber(p.views_count)}</td>
                  <td className="px-4 py-2.5 text-right text-ink-600">{formatNumber(p.add_to_cart_count)}</td>
                  <td className="px-4 py-2.5 text-right text-ink-600">{p.purchase_count}</td>
                  {metric === "abandonment" && <td className="px-4 py-2.5 text-right text-ink-600">{p.abandonment_count}</td>}
                  <td className={`px-4 py-2.5 text-right font-semibold ${valueClass}`}>{value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
