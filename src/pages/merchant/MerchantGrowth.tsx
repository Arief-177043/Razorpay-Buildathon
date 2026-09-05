import { useEffect, useState } from "react";
import { Sparkles, Check, X, Play, TrendingUp, Link2, ShoppingCart, Repeat } from "lucide-react";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { fetchOpportunities, edgeFetch, formatINR } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { GrowthOpportunity } from "@/lib/types";

const typeIcons: Record<string, typeof TrendingUp> = {
  cross_sell: Link2,
  upsell: TrendingUp,
  abandoned_cart_recovery: ShoppingCart,
  traffic_conversion: TrendingUp,
  repeat_purchase: Repeat,
  price_optimization: TrendingUp,
};

const statusBadge: Record<string, string> = {
  discovered: "badge-warning",
  approved: "badge-success",
  rejected: "badge-error",
  simulated: "badge-brand",
  executed: "badge-success",
};

export function MerchantGrowth() {
  const [opps, setOpps] = useState<GrowthOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOpps(await fetchOpportunities());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (opp: GrowthOpportunity, action: "approve" | "reject" | "simulate") => {
    setActing(opp.id);
    try {
      if (action === "simulate") {
        await supabaseUpdate("growth_opportunities", opp.id, { status: "simulated" });
      } else {
        await edgeFetch(`/opportunity/${action}`, { opportunity_id: opp.id, approved_by: "merchant" });
      }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  if (loading) return <Loading message="Loading opportunities..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const pending = opps.filter((o) => o.status === "discovered");
  const resolved = opps.filter((o) => o.status !== "discovered");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Growth Opportunities</h1>
        <p className="text-sm text-ink-500 mt-1">
          AI-discovered revenue opportunities from your store data. Each is grounded in real metrics — approve, simulate, or reject.
        </p>
      </div>

      {pending.length === 0 && resolved.length === 0 ? (
        <EmptyState icon={<Sparkles className="w-10 h-10" />} title="No opportunities yet" description="Run the AI Growth Agent to discover opportunities." />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-ink-700">Pending Review ({pending.length})</h2>
              {pending.map((opp) => {
                const Icon = typeIcons[opp.type] ?? TrendingUp;
                return (
                  <div key={opp.id} className="card p-6 border-l-4 border-l-brand-500">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-700">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="badge-brand">{opp.type.replace(/_/g, " ")}</span>
                          <span className="badge-neutral">{opp.confidence}% confidence</span>
                        </div>
                        <h3 className="text-base font-semibold text-ink-900">{opp.title}</h3>

                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-medium text-ink-400 uppercase tracking-wide">Observation</p>
                            <p className="text-sm text-ink-700 mt-1">{opp.observation}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-ink-400 uppercase tracking-wide">Reason</p>
                            <p className="text-sm text-ink-700 mt-1">{opp.reason}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-ink-400 uppercase tracking-wide">Recommended Action</p>
                            <p className="text-sm text-ink-700 mt-1">{opp.recommended_action}</p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-4">
                          <div className="p-3 rounded-lg bg-ink-50">
                            <p className="text-xs text-ink-400">Current</p>
                            <p className="text-sm font-semibold text-ink-900 mt-0.5">{opp.current_value}{opp.type === "cross_sell" || opp.type === "abandoned_cart_recovery" ? "%" : ""}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-ink-50">
                            <p className="text-xs text-ink-400">Target</p>
                            <p className="text-sm font-semibold text-ink-900 mt-0.5">{opp.target_value}{opp.type === "cross_sell" || opp.type === "abandoned_cart_recovery" ? "%" : ""}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-success-50">
                            <p className="text-xs text-success-600">Est. Monthly</p>
                            <p className="text-sm font-semibold text-success-700 mt-0.5">{formatINR(opp.estimated_monthly_revenue_cents)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleAction(opp, "simulate")}
                          disabled={acting === opp.id}
                          className="btn-secondary text-xs"
                        >
                          <Play className="w-3.5 h-3.5" /> Simulate
                        </button>
                        <button
                          onClick={() => handleAction(opp, "approve")}
                          disabled={acting === opp.id}
                          className="btn-success text-xs"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleAction(opp, "reject")}
                          disabled={acting === opp.id}
                          className="btn-danger text-xs"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-700">Resolved ({resolved.length})</h2>
              {resolved.map((opp) => {
                const Icon = typeIcons[opp.type] ?? TrendingUp;
                return (
                  <div key={opp.id} className="card p-4 opacity-75">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="w-4 h-4 text-ink-400 shrink-0" />
                        <p className="text-sm font-medium text-ink-700 truncate">{opp.title}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-ink-400">{formatINR(opp.estimated_monthly_revenue_cents)}</span>
                        <span className={statusBadge[opp.status] ?? "badge-neutral"}>{opp.status}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function supabaseUpdate(table: string, id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(data).eq("id", id);
  if (error) throw error;
}
