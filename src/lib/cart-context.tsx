import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { supabase } from "./supabase";
import { CartItem } from "./types";

interface CartState {
  cartId: string | null;
  items: CartItem[];
  itemCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  ensureCart: () => Promise<string>;
  addItem: (productId: string, quantity?: number) => Promise<{ success: boolean; error?: string }>;
  removeItem: (productId: string) => Promise<void>;
  clear: () => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartId, setCartId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!cartId) { setItems([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cart_items")
        .select("*, product:products(name,slug,category,image_url)")
        .eq("cart_id", cartId);
      if (error) throw error;
      setItems(data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [cartId]);

  const ensureCart = useCallback(async (): Promise<string> => {
    if (cartId) return cartId;
    const { data, error } = await supabase
      .from("carts")
      .insert({ merchant_id: "a1b2c3d4-0000-0000-0000-000000000001", status: "active", currency: "INR" })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create cart: ${error.message}`);
    setCartId(data.id);
    return data.id;
  }, [cartId]);

  const addItem = useCallback(async (productId: string, quantity = 1): Promise<{ success: boolean; error?: string }> => {
    try {
      const id = await ensureCart();
      const { data: prod } = await supabase.from("products").select("price_cents,inventory_count,is_active").eq("id", productId).maybeSingle();
      if (!prod) return { success: false, error: "Product not found" };
      if (!prod.is_active || prod.inventory_count < quantity) return { success: false, error: "Out of stock" };
      const { error } = await supabase.from("cart_items").upsert(
        { cart_id: id, product_id: productId, quantity, unit_price_cents: prod.price_cents },
        { onConflict: "cart_id,product_id" }
      );
      if (error) throw error;
      await refresh();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }, [ensureCart, refresh]);

  const removeItem = useCallback(async (productId: string) => {
    if (!cartId) return;
    await supabase.from("cart_items").delete().eq("cart_id", cartId).eq("product_id", productId);
    await refresh();
  }, [cartId, refresh]);

  const clear = useCallback(() => {
    setCartId(null);
    setItems([]);
  }, []);

  const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <CartContext.Provider value={{ cartId, items, itemCount, loading, refresh, ensureCart, addItem, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
