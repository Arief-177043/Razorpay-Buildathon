import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IndianRupee, ShoppingBag, TrendingUp, ShoppingCart, Users, Repeat, Sparkles, ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Loading, ErrorState } from "@/components/States";
import { fetchMetrics, fetchOpportunities, fetchAgentRuns } from "@/lib/utils";
import { formatINR, formatNumber, formatPercent, timeAgo } from "@/lib/utils";
import type { MerchantMetrics, GrowthOpportunity, AgentRun } from "@/lib/types";

export function MerchantOverview() {
  const [metrics, setMetrics] = useState<MerchantMetrics | null>(null);
  const [opps, setOpps] = useState<GrowthOpportunity[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, o, r] = await Promise.all([fetchMetrics(), fetchOpportunities(), fetchAgentRuns(5)]);
      setMetrics(m);
      setOpps(o.filter((x) => x.status === "discovered").slice(0, 3));
      setRuns(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Loading message="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Overview</h1>
        <p className="text-sm text-ink-500 mt-1">NexaGear merchant dashboard — real-time metrics from your store data.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatINR(metrics?.total_revenue_cents ?? 0)} icon={<IndianRupee className="w-5 h-5" />} subValue={`${metrics?.paid_orders ?? 0} paid orders`} />
        <StatCard label="Total Orders" value={formatNumber(metrics?.total_orders ?? 0)} icon={<ShoppingBag className="w-5 h-5" />} subValue={`AOV ${formatINR(metrics?.avg_order_value_cents ?? 0)}`} />
        <StatCard label="Conversion Rate" value={formatPercent(metrics?.conversion_rate ?? 0)} icon={<TrendingUp className="w-5 h-5" />} subValue={`${formatNumber(metrics?.total_views ?? 0)} views`} />
        <StatCard label="Cart Abandonment" value={formatPercent(metrics?.abandonment_rate ?? 0)} icon={<ShoppingCart className="w-5 h-5" />} subValue={`${formatNumber(metrics?.total_abandonment ?? 0)} abandoned`} trend={{ value: "Recoverable", positive: true }} />
        <StatCard label="Repeat Customers" value={formatPercent(metrics?.repeat_customer_rate ?? 0)} icon={<Repeat className="w-5 h-5" />} subValue={`${metrics?.repeat_customers ?? 0} of ${metrics?.total_customers ?? 0}`} />
        <StatCard label="Total Customers" value={formatNumber(metrics?.total_customers ?? 0)} icon={<Users className="w-5 h-5" />} />
        <StatCard label="Cart Adds" value={formatNumber(metrics?.total_cart_adds ?? 0)} icon={<ShoppingCart className="w-5 h-5" />} />
        <StatCard label="Purchases" value={formatNumber(metrics?.total_purchases ?? 0)} icon={<ShoppingBag className="w-5 h-5" />} />
      </div>

      {/* AI Opportunities preview */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-semibold text-ink-900">AI Revenue Opportunities</h2>
          </div>
          <Link to="/merchant/growth" className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {opps.length === 0 ? (
          <p className="text-sm text-ink-400 py-6 text-center">No pending opportunities.</p>
        ) : (
          <div className="space-y-3">
            {opps.map((opp) => (
              <Link key={opp.id} to="/merchant/growth" className="block p-4 rounded-lg border border-ink-100 hover:border-brand-200 hover:bg-brand-50/30 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="badge-brand">{opp.type.replace(/_/g, " ")}</span>
                      <span className="badge-neutral">{opp.confidence}% confidence</span>
                    </div>
                    <p className="text-sm font-medium text-ink-900 truncate">{opp.title}</p>
                    <p className="text-xs text-ink-500 mt-1 line-clamp-2">{opp.observation}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-success-600">{formatINR(opp.estimated_monthly_revenue_cents)}</p>
                    <p className="text-xs text-ink-400">est. / month</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent agent runs */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink-900">Recent Agent Activity</h2>
          <Link to="/merchant/agent" className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-400 py-6 text-center">No agent activity yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-ink-50 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`badge ${run.status === "success" ? "badge-success" : run.status === "failed" ? "badge-error" : "badge-neutral"}`}>
                    {run.status}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{run.intent}</p>
                    <p className="text-xs text-ink-400">{run.run_code} · {run.tools_called_count} tools · {run.latency_ms}ms</p>
                  </div>
                </div>
                <span className="text-xs text-ink-400 shrink-0">{timeAgo(run.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
