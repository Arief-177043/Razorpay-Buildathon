import { useEffect, useState } from "react";
import { Package, Search } from "lucide-react";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { fetchProducts, formatINR, categoryLabel } from "@/lib/utils";
import type { Product, ProductCategory } from "@/lib/types";

const categories: (ProductCategory | "all")[] = [
  "all", "gaming_headphones", "wireless_headphones", "mechanical_keyboards",
  "gaming_mice", "monitors", "webcams", "microphones",
  "laptop_accessories", "gaming_accessories", "carrying_cases", "usb_hubs", "stands",
];

export function MerchantProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) => {
    if (filter !== "all" && p.category !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <Loading message="Loading products..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Products</h1>
        <p className="text-sm text-ink-500 mt-1">{products.length} products in your catalog.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as ProductCategory | "all")} className="input sm:w-56">
          {categories.map((c) => (
            <option key={c} value={c}>{c === "all" ? "All categories" : categoryLabel(c)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="w-10 h-10" />} title="No products found" description="Try adjusting your search or filter." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left font-medium text-ink-500 px-4 py-3">Product</th>
                  <th className="text-left font-medium text-ink-500 px-4 py-3">Category</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Price</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Inventory</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Views</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Purchases</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {filtered.map((p) => {
                  const conv = p.views_count > 0 ? ((p.purchase_count / p.views_count) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={p.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-9 h-9 rounded-lg object-cover bg-ink-100" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-ink-100 flex items-center justify-center text-ink-400">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-ink-900">{p.name}</p>
                            <p className="text-xs text-ink-400">★ {p.rating} ({p.rating_count})</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{categoryLabel(p.category)}</td>
                      <td className="px-4 py-3 text-right font-medium text-ink-900">{formatINR(p.price_cents)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={p.inventory_count < 20 ? "text-warning-600 font-medium" : "text-ink-600"}>
                          {p.inventory_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-600">{p.views_count.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-right text-ink-600">{p.purchase_count}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={Number(conv) < 2 ? "text-warning-600 font-medium" : "text-ink-600"}>{conv}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
