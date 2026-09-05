import { useEffect, useState } from "react";
import { Package, Search, Plus, Check } from "lucide-react";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { fetchProducts, formatINR, categoryLabel } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";
import type { Product, ProductCategory } from "@/lib/types";

const categories: (ProductCategory | "all")[] = [
  "all", "gaming_headphones", "wireless_headphones", "mechanical_keyboards",
  "gaming_mice", "monitors", "webcams", "microphones",
  "laptop_accessories", "gaming_accessories", "carrying_cases", "usb_hubs", "stands",
];

export function ShopProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const { addItem } = useCart();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchProducts());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (productId: string) => {
    const res = await addItem(productId);
    if (res.success) {
      setAdded((s) => new Set([...s, productId]));
      setTimeout(() => setAdded((s) => { const n = new Set(s); n.delete(productId); return n; }), 2000);
    }
  };

  const filtered = products.filter((p) => {
    if (filter !== "all" && p.category !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <Loading message="Loading catalog..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Catalog</h1>
        <p className="text-sm text-ink-500 mt-1">{products.length} products from NexaGear.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input type="text" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as ProductCategory | "all")} className="input sm:w-56">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : categoryLabel(c)}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="w-10 h-10" />} title="No products found" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="card overflow-hidden card-hover group">
              <div className="aspect-square bg-ink-100 overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-300">
                    <Package className="w-12 h-12" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-900 leading-snug">{p.name}</h3>
                  <span className="badge-neutral shrink-0">{categoryLabel(p.category)}</span>
                </div>
                <p className="text-xs text-ink-500 mt-1.5 line-clamp-2">{p.description}</p>
                <div className="flex items-center gap-1 mt-2 text-xs text-ink-500">
                  <span>★ {p.rating}</span>
                  <span>·</span>
                  <span>{p.inventory_count > 0 ? "In stock" : "Out of stock"}</span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className="text-base font-semibold text-ink-900">{formatINR(p.price_cents)}</p>
                    {p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents && (
                      <p className="text-xs text-ink-400 line-through">{formatINR(p.compare_at_price_cents)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAdd(p.id)}
                    disabled={p.inventory_count === 0 || added.has(p.id)}
                    className={added.has(p.id) ? "btn-success text-xs" : "btn-primary text-xs"}
                  >
                    {added.has(p.id) ? <><Check className="w-3.5 h-3.5" /> Added</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
