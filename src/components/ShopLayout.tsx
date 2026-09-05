import { NavLink, Outlet, Link } from "react-router-dom";
import { ShoppingBag, MessageSquare, Package, ShoppingCart, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useCart } from "@/lib/cart-context";

const navItems = [
  { to: "/shop", label: "Chat", icon: MessageSquare, end: true },
  { to: "/shop/products", label: "Catalog", icon: Package },
  { to: "/shop/cart", label: "Cart", icon: ShoppingCart },
];

export function ShopLayout() {
  const { itemCount } = useCart();
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <header className="bg-white border-b border-ink-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-50"
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                  {item.label === "Cart" && itemCount > 0 && (
                    <span className="badge-brand px-1.5 py-0">{itemCount}</span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="btn-ghost text-sm">
              <ArrowLeft className="w-4 h-4" /> Home
            </Link>
            <Link to="/merchant" className="btn-secondary text-sm">
              <ShoppingBag className="w-4 h-4" /> Merchant
            </Link>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="md:hidden flex items-center gap-1 px-6 pb-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-ink-600"
                }`
              }
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
