export type ProductCategory =
  | "gaming_headphones"
  | "wireless_headphones"
  | "mechanical_keyboards"
  | "gaming_mice"
  | "monitors"
  | "webcams"
  | "microphones"
  | "laptop_accessories"
  | "gaming_accessories"
  | "carrying_cases"
  | "usb_hubs"
  | "stands";

export interface Merchant {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  description: string | null;
  website: string | null;
  currency: string;
  default_tax_rate: number;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  slug: string;
  description: string;
  category: ProductCategory;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  inventory_count: number;
  attributes: Record<string, unknown>;
  rating: number;
  rating_count: number;
  views_count: number;
  add_to_cart_count: number;
  purchase_count: number;
  abandonment_count: number;
  repeat_purchase_count: number;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  segment: string;
  lifetime_value_cents: number;
  total_orders: number;
  total_spent_cents: number;
  last_order_at: string | null;
  created_at: string;
}

export interface Cart {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  status: "active" | "abandoned" | "converted" | "expired";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  product?: Pick<Product, "name" | "slug" | "category" | "image_url">;
}

export interface Order {
  id: string;
  order_number: string;
  status: "created" | "paid" | "failed" | "cancelled" | "refunded";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  razorpay_order_id: string | null;
  idempotency_key: string | null;
  items_count: number;
  failure_reason: string | null;
  created_at: string;
  cart_id: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

export interface Payment {
  id: string;
  order_id: string;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  amount_cents: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "failed" | "refunded" | "pending";
  method: string | null;
  provider: string;
  verified: boolean;
  failure_reason: string | null;
  failure_code: string | null;
  created_at: string;
}

export interface GrowthOpportunity {
  id: string;
  type: "cross_sell" | "upsell" | "abandoned_cart_recovery" | "price_optimization" | "repeat_purchase" | "traffic_conversion";
  title: string;
  observation: string;
  reason: string;
  primary_product_id: string | null;
  related_product_id: string | null;
  current_value: number;
  target_value: number;
  estimated_monthly_revenue_cents: number;
  confidence: number;
  recommended_action: string;
  status: "discovered" | "approved" | "rejected" | "simulated" | "executed" | "expired";
  approved_by: string | null;
  approved_at: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  audience: string;
  offer: string;
  message: string;
  timing: string;
  expected_impact: string;
  confidence: number;
  reason: string;
  status: "draft" | "approved" | "rejected" | "active" | "completed";
  created_at: string;
}

export interface AgentRun {
  id: string;
  run_code: string;
  role: "growth" | "buyer" | "campaign";
  intent: string;
  user_query: string | null;
  final_decision: string | null;
  final_result: Record<string, unknown>;
  tools_called_count: number;
  latency_ms: number;
  errors: string | null;
  status: "success" | "failed" | "skipped" | "pending" | "denied";
  created_at: string;
  completed_at: string | null;
}

export interface AgentAction {
  id: string;
  run_id: string;
  step: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  decision: string | null;
  reasoning: string | null;
  status: "success" | "failed" | "skipped" | "pending" | "denied";
  latency_ms: number;
  error: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  reason: string | null;
  request_id: string | null;
  order_id: string | null;
  payment_id: string | null;
  amount_cents: number | null;
  failure_reason: string | null;
  recovery_action: string | null;
  final_state: string | null;
  created_at: string;
}

export interface DemoControls {
  id: string;
  simulate_payment_failure: boolean;
  simulate_api_timeout: boolean;
  simulate_inventory_failure: boolean;
  payment_provider: string;
}

export interface Recommendation {
  product_id: string;
  score: number;
  relationship_type: string;
  evidence: string;
  name: string;
  category: string;
  price_cents: number;
  rating: number;
  inventory_count: number;
  image_url: string | null;
}

export interface MerchantMetrics {
  total_revenue_cents: number;
  total_orders: number;
  paid_orders: number;
  total_views: number;
  total_cart_adds: number;
  total_purchases: number;
  total_abandonment: number;
  total_customers: number;
  repeat_customers: number;
  avg_order_value_cents: number;
  conversion_rate: number;
  abandonment_rate: number;
  repeat_customer_rate: number;
}
