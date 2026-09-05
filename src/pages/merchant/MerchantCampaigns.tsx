import { useEffect, useState } from "react";
import { Megaphone, Check, X, Sparkles } from "lucide-react";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { fetchCampaigns, edgeFetch } from "@/lib/utils";
import type { Campaign } from "@/lib/types";

const statusBadge: Record<string, string> = {
  draft: "badge-warning",
  approved: "badge-success",
  rejected: "badge-error",
  active: "badge-brand",
  completed: "badge-neutral",
};

export function MerchantCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await fetchCampaigns());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActing(id);
    try {
      await edgeFetch(`/campaign/${action}`, { campaign_id: id, approved_by: "merchant" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  };

  if (loading) return <Loading message="Loading campaigns..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Campaigns</h1>
        <p className="text-sm text-ink-500 mt-1">AI-generated campaign drafts for merchant approval. No external messages are sent — simulation only.</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="w-10 h-10" />}
          title="No campaigns yet"
          description="Ask the AI Growth Agent to generate a campaign draft."
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {campaigns.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-100 text-brand-700">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink-900">{c.name}</h3>
                </div>
                <span className={statusBadge[c.status] ?? "badge-neutral"}>{c.status}</span>
              </div>

              <p className="text-xs text-ink-500 mb-4">{c.description}</p>

              <div className="space-y-2.5 text-sm">
                <Field label="Audience" value={c.audience} />
                <Field label="Offer" value={c.offer} />
                <Field label="Message" value={c.message} />
                <Field label="Timing" value={c.timing} />
                <Field label="Expected Impact" value={c.expected_impact} />
                <div className="flex items-center gap-2 pt-1">
                  <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  <span className="text-xs text-ink-600">Confidence: <span className="font-semibold text-ink-900">{c.confidence}%</span></span>
                </div>
                <div className="pt-2 border-t border-ink-50">
                  <p className="text-xs font-medium text-ink-400 uppercase tracking-wide">Reason</p>
                  <p className="text-xs text-ink-600 mt-1">{c.reason}</p>
                </div>
              </div>

              {c.status === "draft" && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-ink-50">
                  <button onClick={() => handleAction(c.id, "approve")} disabled={acting === c.id} className="btn-success text-xs flex-1">
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => handleAction(c.id, "reject")} disabled={acting === c.id} className="btn-danger text-xs flex-1">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-ink-700 mt-0.5">{value}</p>
    </div>
  );
}
