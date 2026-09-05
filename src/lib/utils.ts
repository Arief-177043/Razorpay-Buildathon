import { supabase } from "./supabase";

/** Format paise (cents) into Indian Rupee display string. */
export function formatINR(cents: number | bigint | string | null | undefined): string {
  if (cents == null) return "₹0";
  const n = Number(cents);
  if (isNaN(n)) return "₹0";
  const rupees = n / 100;
  return "₹" + rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatINRDecimal(cents: number | bigint | string | null | undefined): string {
  if (cents == null) return "₹0.00";
  const n = Number(cents);
  if (isNaN(n)) return "₹0.00";
  const rupees = n / 100;
  return "₹" + rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

export function formatPercent(n: number, decimals = 2): string {
  return `${n.toFixed(decimals)}%`;
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function categoryLabel(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Generic fetch wrapper for the razorflow-agent edge function. */
export async function edgeFetch<T = unknown>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST"
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorflow-agent${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Fetch helper for the webhook edge function (used in demo/testing). */
export async function webhookSimulate(event: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorflow-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  return res.json();
}

// --- Query helpers ---------------------------------------------------------

export async function fetchProducts(category?: string): Promise<import("./types").Product[]> {
  let q = supabase.from("products").select("*").eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001").eq("is_active", true);
  if (category) q = q.eq("category", category);
  const { data, error } = await q.order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchProductById(id: string): Promise<import("./types").Product | null> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMetrics(): Promise<import("./types").MerchantMetrics> {
  const { data, error } = await supabase.rpc("get_merchant_metrics", { p_merchant_id: "a1b2c3d4-0000-0000-0000-000000000001" });
  if (error) throw error;
  return data;
}

export async function fetchOpportunities(): Promise<import("./types").GrowthOpportunity[]> {
  const { data, error } = await supabase
    .from("growth_opportunities")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAgentRuns(limit = 20): Promise<import("./types").AgentRun[]> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAgentActions(runId: string): Promise<import("./types").AgentAction[]> {
  const { data, error } = await supabase
    .from("agent_actions")
    .select("*")
    .eq("run_id", runId)
    .order("step", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAuditLogs(limit = 30): Promise<import("./types").AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCampaigns(): Promise<import("./types").Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchOrders(limit = 20): Promise<import("./types").Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCustomers(limit = 30): Promise<import("./types").Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchDemoControls(): Promise<import("./types").DemoControls> {
  const { data, error } = await supabase
    .from("demo_controls")
    .select("*")
    .eq("merchant_id", "a1b2c3d4-0000-0000-0000-000000000001")
    .maybeSingle();
  if (error) throw error;
  return data;
}
