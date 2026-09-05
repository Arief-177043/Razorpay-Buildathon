import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/lib/cart-context";
import { LandingPage } from "@/pages/LandingPage";
import { MerchantLayout } from "@/components/MerchantLayout";
import { ShopLayout } from "@/components/ShopLayout";
import { MerchantOverview } from "@/pages/merchant/MerchantOverview";
import { MerchantProducts } from "@/pages/merchant/MerchantProducts";
import { MerchantCustomers } from "@/pages/merchant/MerchantCustomers";
import { MerchantAnalytics } from "@/pages/merchant/MerchantAnalytics";
import { MerchantGrowth } from "@/pages/merchant/MerchantGrowth";
import { MerchantAgent } from "@/pages/merchant/MerchantAgent";
import { MerchantCampaigns } from "@/pages/merchant/MerchantCampaigns";
import { MerchantAudit } from "@/pages/merchant/MerchantAudit";
import { MerchantSettings } from "@/pages/merchant/MerchantSettings";
import { ShopChat } from "@/pages/shop/ShopChat";
import { ShopProducts } from "@/pages/shop/ShopProducts";
import { ShopCart } from "@/pages/shop/ShopCart";
import { ShopCheckout } from "@/pages/shop/ShopCheckout";
import { OrderConfirmation } from "@/pages/shop/OrderConfirmation";

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/merchant" element={<MerchantLayout />}>
            <Route index element={<MerchantOverview />} />
            <Route path="products" element={<MerchantProducts />} />
            <Route path="customers" element={<MerchantCustomers />} />
            <Route path="analytics" element={<MerchantAnalytics />} />
            <Route path="growth" element={<MerchantGrowth />} />
            <Route path="agent" element={<MerchantAgent />} />
            <Route path="campaigns" element={<MerchantCampaigns />} />
            <Route path="audit" element={<MerchantAudit />} />
            <Route path="settings" element={<MerchantSettings />} />
          </Route>
          <Route path="/shop" element={<ShopLayout />}>
            <Route index element={<ShopChat />} />
            <Route path="products" element={<ShopProducts />} />
            <Route path="cart" element={<ShopCart />} />
            <Route path="checkout" element={<ShopCheckout />} />
            <Route path="order/:id" element={<OrderConfirmation />} />
          </Route>
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}

export default App;
