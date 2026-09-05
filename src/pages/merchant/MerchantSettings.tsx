import { useEffect, useState } from "react";
import { Settings as SettingsIcon, RotateCcw, AlertTriangle, Zap, ShieldCheck, CreditCard } from "lucide-react";
import { Loading, ErrorState } from "@/components/States";
import { fetchDemoControls, edgeFetch } from "@/lib/utils";
import type { DemoControls } from "@/lib/types";

export function MerchantSettings() {
  const [controls, setControls] = useState<DemoControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setControls(await fetchDemoControls());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (key: "simulate_payment_failure" | "simulate_api_timeout" | "simulate_inventory_failure") => {
    if (!controls) return;
    setActing(true);
    setMessage(null);
    try {
      const res = await edgeFetch<{ controls: DemoControls }>("/demo/simulate", { [key]: !controls[key] });
      setControls(res.controls);
      setMessage(`${key.replace(/_/g, " ")} ${res.controls[key] ? "enabled" : "disabled"}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  };

  const reset = async () => {
    setActing(true);
    setMessage(null);
    try {
      await edgeFetch("/demo/reset");
      await load();
      setMessage("Demo controls reset to defaults.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <Loading message="Loading settings..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!controls) return null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500 mt-1">Demo controls, failure simulation, and payment provider status.</p>
      </div>

      {message && (
        <div className="card p-3 border-success-200 bg-success-50 animate-slide-down">
          <p className="text-sm text-success-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> {message}</p>
        </div>
      )}

      {/* Demo Mode */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-ink-900">Demo Mode</h2>
        </div>
        <p className="text-xs text-ink-500 mb-5">Safely demonstrate failure recovery without breaking the demo scenario.</p>

        <div className="space-y-3">
          <ToggleRow
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Simulate Payment Failure"
            description="Next checkout will fail — cart is preserved, no duplicate order."
            value={controls.simulate_payment_failure}
            onChange={() => toggle("simulate_payment_failure")}
            disabled={acting}
            danger
          />
          <ToggleRow
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Simulate API Timeout"
            description="Agent API calls will simulate a timeout response."
            value={controls.simulate_api_timeout}
            onChange={() => toggle("simulate_api_timeout")}
            disabled={acting}
            danger
          />
          <ToggleRow
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Simulate Inventory Failure"
            description="Add-to-cart will reject due to simulated out-of-stock."
            value={controls.simulate_inventory_failure}
            onChange={() => toggle("simulate_inventory_failure")}
            disabled={acting}
            danger
          />
        </div>

        <div className="mt-5 pt-5 border-t border-ink-50">
          <button onClick={reset} disabled={acting} className="btn-secondary">
            <RotateCcw className="w-4 h-4" /> Reset Demo
          </button>
          <p className="text-xs text-ink-400 mt-2">Resets all simulation flags to off. Your data is preserved.</p>
        </div>
      </div>

      {/* Payment Provider */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-4 h-4 text-ink-600" />
          <h2 className="text-sm font-semibold text-ink-900">Payment Provider</h2>
        </div>
        <div className="mt-3 p-4 rounded-lg bg-ink-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900">{controls.payment_provider === "auto" ? "Auto-detected" : controls.payment_provider}</p>
              <p className="text-xs text-ink-500 mt-0.5">
                {controls.payment_provider === "auto"
                  ? "Uses Razorpay Test Mode if credentials are set, otherwise Mock provider."
                  : "Using configured provider."}
              </p>
            </div>
            <span className="badge-brand">Test Mode</span>
          </div>
        </div>
        <p className="text-xs text-ink-400 mt-3">
          Razorpay credentials are configured via environment variables (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) on the server. The frontend never touches payment secrets.
        </p>
      </div>

      {/* Merchant Info */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon className="w-4 h-4 text-ink-600" />
          <h2 className="text-sm font-semibold text-ink-900">Merchant</h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-xs text-ink-400">Name</p><p className="text-ink-900 font-medium mt-0.5">NexaGear</p></div>
          <div><p className="text-xs text-ink-400">Currency</p><p className="text-ink-900 font-medium mt-0.5">INR</p></div>
          <div><p className="text-xs text-ink-400">Tax Rate</p><p className="text-ink-900 font-medium mt-0.5">18% GST</p></div>
          <div><p className="text-xs text-ink-400">Slug</p><p className="text-ink-900 font-medium mt-0.5">nexagear</p></div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, description, value, onChange, disabled, danger }: { icon: React.ReactNode; label: string; description: string; value: boolean; onChange: () => void; disabled: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-ink-100">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${danger ? "text-warning-600" : "text-ink-500"}`}>{icon}</div>
        <div>
          <p className="text-sm font-medium text-ink-900">{label}</p>
          <p className="text-xs text-ink-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-brand-600" : "bg-ink-200"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}
