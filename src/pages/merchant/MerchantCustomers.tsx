import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { fetchCustomers, formatINR, timeAgo } from "@/lib/utils";
import type { Customer } from "@/lib/types";

export function MerchantCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomers(await fetchCustomers());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Loading message="Loading customers..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const segmentColors: Record<string, string> = {
    vip: "badge-brand", regular: "badge-success", new: "badge-warning",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Customers</h1>
        <p className="text-sm text-ink-500 mt-1">{customers.length} customers across segments.</p>
      </div>
      {customers.length === 0 ? (
        <EmptyState icon={<Users className="w-10 h-10" />} title="No customers yet" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="text-left font-medium text-ink-500 px-4 py-3">Customer</th>
                  <th className="text-left font-medium text-ink-500 px-4 py-3">Segment</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Orders</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Total Spent</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">LTV</th>
                  <th className="text-right font-medium text-ink-500 px-4 py-3">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{c.name}</p>
                      <p className="text-xs text-ink-400">{c.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={segmentColors[c.segment] ?? "badge-neutral"}>{c.segment}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-ink-600">{c.total_orders}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-900">{formatINR(c.total_spent_cents)}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{formatINR(c.lifetime_value_cents)}</td>
                    <td className="px-4 py-3 text-right text-ink-400">{c.last_order_at ? timeAgo(c.last_order_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
