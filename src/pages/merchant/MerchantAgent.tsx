import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Bot, Send, Sparkles, Cpu, Clock, CheckCircle, XCircle } from "lucide-react";
import { Loading, ErrorState } from "@/components/States";
import { fetchAgentRuns, fetchAgentActions, edgeFetch, timeAgo } from "@/lib/utils";
import type { AgentRun } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ tool_name: string; status: string; latency_ms: number }>;
  run_code?: string;
}

const SUGGESTED = [
  "Discover revenue opportunities from my store data",
  "Which products have the highest abandonment rate?",
  "Find cross-sell opportunities in my catalog",
  "Which products have high traffic but low conversion?",
];

export function MerchantAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [actions, setActions] = useState<import("@/lib/types").AgentAction[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadRuns = async () => {
    setLoadingRuns(true);
    try {
      setRuns(await fetchAgentRuns(15));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => { loadRuns(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await edgeFetch<{ reply: string; actions: Array<{ tool_name: string; status: string; latency_ms: number }>; run_code: string }>("/agent/chat", {
        role: "growth",
        message: msg,
        history,
      });
      setMessages((m) => [...m, {
        role: "assistant",
        content: res.reply,
        actions: res.actions,
        run_code: res.run_code,
      }]);
      await loadRuns();
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `I encountered an error: ${e.message}. The failure has been recorded.` }]);
    } finally {
      setSending(false);
    }
  };

  const viewRun = async (run: AgentRun) => {
    setSelectedRun(run);
    setActions([]);
    setActions(await fetchAgentActions(run.id));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">AI Growth Agent</h1>
        <p className="text-sm text-ink-500 mt-1">Chat with the AI Growth Agent. It uses deterministic tools to analyze your data and explain opportunities.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chat */}
        <div className="lg:col-span-2 card flex flex-col h-[600px]">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center gap-2">
            <Bot className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-semibold text-ink-900">Growth Agent</span>
            <span className="badge-success ml-auto"><span className="w-1.5 h-1.5 rounded-full bg-success-500" /> Online</span>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-10">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand-100 text-brand-700 mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-ink-700">Ask the Growth Agent anything</p>
                <p className="text-xs text-ink-400 mt-1 max-w-xs">It will call deterministic tools on your data and explain the findings.</p>
                <div className="mt-6 grid gap-2 w-full max-w-sm">
                  {SUGGESTED.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left p-3 rounded-lg border border-ink-100 hover:border-brand-200 hover:bg-brand-50/30 transition-all text-sm text-ink-700">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${msg.role === "user" ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-900"} rounded-xl px-4 py-3`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-ink-200/30 space-y-1.5">
                      {msg.run_code && <p className="text-xs opacity-70 font-mono">{msg.run_code} · {msg.actions.length} tool calls</p>}
                      {msg.actions.map((a, j) => (
                        <div key={j} className="flex items-center gap-2 text-xs">
                          {a.status === "success" ? <CheckCircle className="w-3 h-3 text-success-500" /> : <XCircle className="w-3 h-3 text-error-500" />}
                          <span className="font-mono opacity-80">{a.tool_name}</span>
                          <span className="opacity-50">{a.latency_ms}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-ink-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-ink-400 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-ink-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 rounded-full bg-ink-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-ink-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask the Growth Agent..."
                className="input flex-1"
                disabled={sending}
              />
              <button onClick={() => send()} disabled={sending || !input.trim()} className="btn-primary">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Trace sidebar */}
        <div className="card flex flex-col h-[600px]">
          <div className="px-5 py-3 border-b border-ink-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-ink-600" />
            <span className="text-sm font-semibold text-ink-900">Agent Trace</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingRuns ? <Loading message="Loading runs..." /> : runs.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-10">No runs yet.</p>
            ) : (
              <div className="divide-y divide-ink-50">
                {runs.map((run) => (
                  <button key={run.id} onClick={() => viewRun(run)} className={`w-full text-left p-3 hover:bg-ink-50 transition-colors ${selectedRun?.id === run.id ? "bg-brand-50/50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`badge ${run.status === "success" ? "badge-success" : run.status === "failed" ? "badge-error" : "badge-neutral"}`}>{run.status}</span>
                      <span className="text-xs text-ink-400">{timeAgo(run.created_at)}</span>
                    </div>
                    <p className="text-xs font-medium text-ink-700 mt-1.5 truncate">{run.intent}</p>
                    <p className="text-xs text-ink-400 mt-0.5 font-mono">{run.run_code} · {run.tools_called_count} tools · {run.latency_ms}ms</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedRun && actions.length > 0 && (
            <div className="border-t border-ink-100 p-4 max-h-64 overflow-y-auto">
              <p className="text-xs font-semibold text-ink-700 mb-2">Tool Trace — {selectedRun.run_code}</p>
              <div className="space-y-2">
                {actions.map((a) => (
                  <div key={a.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-ink-600">#{a.step}</span>
                      <span className="font-medium text-ink-900">{a.tool_name}</span>
                      {a.status === "success" ? <CheckCircle className="w-3 h-3 text-success-500" /> : <XCircle className="w-3 h-3 text-error-500" />}
                      <span className="text-ink-400 ml-auto">{a.latency_ms}ms</span>
                    </div>
                    {a.error && <p className="text-error-600 mt-0.5 pl-5">{a.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
