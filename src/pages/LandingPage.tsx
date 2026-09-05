import { Link } from "react-router-dom";
import { Zap, Store, ShoppingBag, ArrowRight, ShieldCheck, Cpu, TrendingUp, CreditCard } from "lucide-react";
import { Logo } from "@/components/Logo";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      {/* Nav */}
      <nav className="border-b border-ink-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <Link to="/shop" className="btn-ghost">Shop</Link>
            <Link to="/merchant" className="btn-primary">Merchant Dashboard</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-900 to-brand-950" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #3377ff 0%, transparent 50%), radial-gradient(circle at 80% 20%, #10b981 0%, transparent 40%)" }} />
        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-brand-200 text-xs font-medium mb-6">
              <Zap className="w-3.5 h-3.5" fill="currentColor" />
              Razorpay Buildathon · Track 01: AI Growth & Agentic Commerce
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
              An AI agent that turns merchant data into measurable revenue growth.
            </h1>
            <p className="mt-6 text-lg text-ink-300 max-w-2xl leading-relaxed">
              RazorFlow AI discovers revenue opportunities from real merchant data, explains every recommendation, gates every action behind merchant approval, and lets an AI buyer complete a transaction end-to-end through Razorpay test checkout.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link to="/merchant" className="btn bg-white text-ink-900 hover:bg-ink-100 active:scale-[0.98] px-6 py-3 text-base">
                Enter Merchant Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/shop" className="btn bg-white/10 backdrop-blur text-white border border-white/20 hover:bg-white/15 active:scale-[0.98] px-6 py-3 text-base">
                Try AI Buyer <ShoppingBag className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Two experiences */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-6">
          <Link to="/merchant" className="card p-8 card-hover group">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-brand-100 text-brand-700 mb-5">
              <Store className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold text-ink-900">Merchant AI Growth</h2>
            <p className="mt-2 text-sm text-ink-500 leading-relaxed">
              AI Growth Agent analyzes your catalog, customers, and orders to surface revenue opportunities with evidence, confidence, and estimated impact. Approve, simulate, or reject — every action is bounded and audited.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-brand-600 group-hover:gap-3 transition-all">
              Open dashboard <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
          <Link to="/shop" className="card p-8 card-hover group">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-accent-100 text-accent-700 mb-5">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold text-ink-900">AI Buyer Commerce</h2>
            <p className="mt-2 text-sm text-ink-500 leading-relaxed">
              A conversational commerce experience where an AI buyer discovers products from the real catalog, gets grounded cross-sell recommendations, builds a cart, and checks out through Razorpay test mode — with full agent trace.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-accent-600 group-hover:gap-3 transition-all">
              Start shopping <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-white border-y border-ink-100">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-semibold text-ink-900 text-center mb-12">Why RazorFlow is different</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Cpu, title: "Real tool-using agent", desc: "AI picks tools and explains why. Deterministic code computes prices, totals, and inventory — never the LLM." },
              { icon: ShieldCheck, title: "Bounded & gated", desc: "Every money action requires merchant approval. The agent cannot change prices, bypass inventory, or charge arbitrary amounts." },
              { icon: TrendingUp, title: "Data-grounded growth", desc: "Opportunities come from co-purchase, conversion, and abandonment patterns in real data — not fabricated conclusions." },
              { icon: CreditCard, title: "Razorpay test checkout", desc: "Real Razorpay test-mode order creation, cryptographic payment verification, and idempotent webhook handling." },
            ].map((p) => (
              <div key={p.title}>
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-ink-50 text-brand-600 mb-4">
                  <p.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-ink-900">{p.title}</h3>
                <p className="mt-1.5 text-xs text-ink-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
          <Logo />
          <p className="text-xs text-ink-400">Razorpay Buildathon · RazorFlow AI</p>
        </div>
      </footer>
    </div>
  );
}
