import { useState, useRef, useEffect } from "react";
import { Send, Bot, ShoppingBag, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { edgeFetch } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";
import { formatINR } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: Array<{ tool_name: string; status: string; result: Record<string, unknown> }>;
  run_code?: string;
}

const SUGGESTED = [
  "I need good wireless headphones for gaming under ₹5,000",
  "Show me mechanical keyboards under ₹8,000",
  "Find me a gaming mouse with high DPI",
  "I want a 4K monitor for gaming and work",
];

export function ShopChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const { cartId, refresh } = useCart();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await edgeFetch<{ reply: string; actions: Array<{ tool_name: string; status: string; result: Record<string, unknown> }>; run_code: string }>("/agent/chat", {
        role: "buyer",
        message: msg,
        cart_id: cartId,
        history,
      });
      setMessages((m) => [...m, {
        role: "assistant",
        content: res.reply,
        actions: res.actions,
        run_code: res.run_code,
      }]);
      // If any add_to_cart succeeded, refresh cart
      if (res.actions?.some((a) => a.tool_name === "add_to_cart" && a.status === "success")) {
        await refresh();
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `I ran into an issue: ${e.message}. Your cart is safe — please try again.` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">AI Buyer</h1>
        <p className="text-sm text-ink-500 mt-1">Tell the AI what you need. It searches the real catalog, explains recommendations, and helps you check out.</p>
      </div>

      <div className="card flex flex-col h-[560px]">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center gap-2">
          <Bot className="w-4 h-4 text-brand-600" />
          <span className="text-sm font-semibold text-ink-900">RazorFlow AI Buyer</span>
          <span className="badge-success ml-auto"><span className="w-1.5 h-1.5 rounded-full bg-success-500" /> Ready</span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand-100 text-brand-700 mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-ink-700">What are you looking for today?</p>
              <p className="text-xs text-ink-400 mt-1 max-w-xs">The AI searches real products, explains why, and helps you buy.</p>
              <div className="mt-6 grid gap-2 w-full max-w-md">
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
                    {msg.run_code && <p className="text-xs opacity-70 font-mono">{msg.run_code}</p>}
                    {msg.actions.map((a, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs">
                        {a.status === "success" ? <CheckCircle className="w-3 h-3 text-success-500" /> : <XCircle className="w-3 h-3 text-error-500" />}
                        <span className="font-mono opacity-80">{a.tool_name}</span>
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
              placeholder="Describe what you need..."
              className="input flex-1"
              disabled={sending}
            />
            <button onClick={() => send()} disabled={sending || !input.trim()} className="btn-primary">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
