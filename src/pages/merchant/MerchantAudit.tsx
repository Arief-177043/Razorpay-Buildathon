import { useEffect, useState } from "react";
import { ScrollText, AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";
import { Loading, ErrorState, EmptyState } from "@/components/States";
import { fetchAuditLogs, formatINR, timeAgo } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";

const actionIcons: Record<string, typeof CheckCircle> = {
  approve: CheckCircle,
  reject: AlertCircle,
  simulate: ShieldCheck,
  execute: CheckCircle,
  payment_create: ShieldCheck,
  payment_verify: CheckCircle,
  order_create: ShieldCheck,
  failure_simulate: AlertCircle,
  demo_reset: ShieldCheck,
};

export function MerchantAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await fetchAuditLogs(40));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Loading message="Loading audit trail..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Audit Trail</h1>
        <p className="text-sm text-ink-500 mt-1">Every money action, approval, and failure — recorded and explainable.</p>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={<ScrollText className="w-10 h-10" />} title="No audit entries yet" />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-ink-50">
            {logs.map((log) => {
              const Icon = actionIcons[log.action] ?? ScrollText;
              const isFailure = !!log.failure_reason;
              return (
                <div key={log.id} className="p-4 hover:bg-ink-50/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${isFailure ? "bg-error-100 text-error-600" : "bg-ink-50 text-ink-500"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-900">{log.action.replace(/_/g, " ")}</span>
                        <span className="badge-neutral">{log.actor}</span>
                        {log.amount_cents != null && <span className="text-xs font-medium text-ink-600">{formatINR(log.amount_cents)}</span>}
                        <span className="text-xs text-ink-400 ml-auto">{timeAgo(log.created_at)}</span>
                      </div>
                      {log.reason && <p className="text-sm text-ink-600 mt-1">{log.reason}</p>}
                      {log.failure_reason && (
                        <div className="mt-2 p-2.5 rounded-lg bg-error-50 border border-error-100">
                          <p className="text-xs font-medium text-error-700">Failure: {log.failure_reason}</p>
                          {log.recovery_action && <p className="text-xs text-error-600 mt-1">Recovery: {log.recovery_action}</p>}
                          {log.final_state && <p className="text-xs text-error-600 mt-0.5">Final state: {log.final_state}</p>}
                        </div>
                      )}
                      {log.request_id && <p className="text-xs text-ink-400 mt-1 font-mono">req: {log.request_id}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
