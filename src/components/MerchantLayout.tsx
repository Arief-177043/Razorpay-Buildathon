import { NavLink, Outlet, Link } from "react-router-dom";
import {
  LayoutDashboard, Package, Users, BarChart3, Sparkles, Bot,
  Megaphone, ScrollText, Settings, ArrowLeft, Store,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const navItems = [
  { to: "/merchant", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/merchant/products", label: "Products", icon: Package },
  { to: "/merchant/customers", label: "Customers", icon: Users },
  { to: "/merchant/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/merchant/growth", label: "Growth Opportunities", icon: Sparkles },
  { to: "/merchant/agent", label: "AI Growth Agent", icon: Bot },
  { to: "/merchant/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/merchant/audit", label: "Audit Trail", icon: ScrollText },
  { to: "/merchant/settings", label: "Settings", icon: Settings },
];

export function MerchantLayout() {
  return (
    <div className="min-h-screen bg-ink-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-ink-100 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="h-16 flex items-center px-5 border-b border-ink-100">
          <Logo />
        </div>
        <div className="px-3 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-50">
            <Store className="w-4 h-4 text-ink-400" />
            <span className="text-sm font-medium text-ink-700">NexaGear</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-ink-100">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-64">
        <main className="p-8 max-w-7xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
