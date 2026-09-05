/*
# RazorFlow AI — Core Schema

Single-tenant demo (merchant "NexaGear"). RLS enabled on all tables with
anon+authenticated access so the React frontend (anon key) can read/write.

Tables: merchants, products, customers, product_relationships, product_events,
carts, cart_items, orders, order_items, payments, growth_opportunities,
campaigns, agent_runs, agent_actions, audit_logs, webhook_events,
recommendations, demo_controls.
*/

DO $$ BEGIN
  CREATE TYPE product_category AS ENUM (
    'gaming_headphones','wireless_headphones','mechanical_keyboards',
    'gaming_mice','monitors','webcams','microphones','laptop_accessories',
    'gaming_accessories','carrying_cases','usb_hubs','stands'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE event_type AS ENUM ('view','add_to_cart','remove_from_cart','purchase','abandon'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cart_status AS ENUM ('active','abandoned','converted','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('created','paid','failed','cancelled','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('created','authorized','captured','failed','refunded','pending'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE opportunity_type AS ENUM ('cross_sell','upsell','abandoned_cart_recovery','price_optimization','repeat_purchase','traffic_conversion'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE opportunity_status AS ENUM ('discovered','approved','rejected','simulated','executed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_status AS ENUM ('draft','approved','rejected','active','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE agent_role AS ENUM ('growth','buyer','campaign'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE action_status AS ENUM ('success','failed','skipped','pending','denied'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE audit_action AS ENUM ('approve','reject','simulate','execute','payment_create','payment_verify','order_create','cart_modify','campaign_create','failure_simulate','demo_reset'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE recommendation_type AS ENUM ('frequently_bought_together','compatible','complementary','category_sibling','price_ladder'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text UNIQUE NOT NULL, email text, phone text,
  description text, logo_url text, website text,
  razorpay_key_id text, razorpay_key_secret text, razorpay_webhook_secret text,
  currency text NOT NULL DEFAULT 'INR', default_tax_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL, slug text NOT NULL, description text NOT NULL,
  category product_category NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  compare_at_price_cents bigint CHECK (compare_at_price_cents >= 0),
  currency text NOT NULL DEFAULT 'INR',
  inventory_count integer NOT NULL DEFAULT 0 CHECK (inventory_count >= 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  rating numeric(2,1) NOT NULL DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
  rating_count integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  add_to_cart_count integer NOT NULL DEFAULT 0,
  purchase_count integer NOT NULL DEFAULT 0,
  abandonment_count integer NOT NULL DEFAULT 0,
  repeat_purchase_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL, email text NOT NULL, phone text,
  segment text NOT NULL DEFAULT 'new',
  lifetime_value_cents bigint NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0, total_spent_cents bigint NOT NULL DEFAULT 0,
  last_order_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment);

CREATE TABLE IF NOT EXISTS product_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  source_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relationship_type text NOT NULL, co_purchase_count integer NOT NULL DEFAULT 0,
  confidence numeric(4,3) NOT NULL DEFAULT 0.000, evidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_product_id <> target_product_id)
);
CREATE INDEX IF NOT EXISTS idx_rel_source ON product_relationships(source_product_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON product_relationships(target_product_id);

CREATE TABLE IF NOT EXISTS product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  event_type event_type NOT NULL, session_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_product ON product_events(product_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON product_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON product_events(created_at);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status cart_status NOT NULL DEFAULT 'active',
  subtotal_cents bigint NOT NULL DEFAULT 0, discount_cents bigint NOT NULL DEFAULT 0,
  tax_cents bigint NOT NULL DEFAULT 0, total_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR', abandoned_at timestamptz, converted_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carts_customer ON carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON carts(status);

CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (cart_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  cart_id uuid REFERENCES carts(id) ON DELETE SET NULL,
  order_number text UNIQUE NOT NULL,
  status order_status NOT NULL DEFAULT 'created',
  subtotal_cents bigint NOT NULL DEFAULT 0, discount_cents bigint NOT NULL DEFAULT 0,
  tax_cents bigint NOT NULL DEFAULT 0, total_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  razorpay_order_id text UNIQUE, idempotency_key text UNIQUE,
  items_count integer NOT NULL DEFAULT 0, failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  razorpay_payment_id text, razorpay_order_id text, razorpay_signature text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status payment_status NOT NULL DEFAULT 'created',
  method text, provider text NOT NULL DEFAULT 'razorpay',
  verified boolean NOT NULL DEFAULT false, verified_at timestamptz,
  failure_reason text, failure_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_payment ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS growth_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type opportunity_type NOT NULL, title text NOT NULL,
  observation text NOT NULL, reason text NOT NULL,
  primary_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  related_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  current_value numeric(10,2) NOT NULL DEFAULT 0,
  target_value numeric(10,2) NOT NULL DEFAULT 0,
  estimated_monthly_revenue_cents bigint NOT NULL DEFAULT 0,
  confidence integer NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  recommended_action text NOT NULL,
  status opportunity_status NOT NULL DEFAULT 'discovered',
  approved_by text, approved_at timestamptz, executed_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opp_merchant ON growth_opportunities(merchant_id);
CREATE INDEX IF NOT EXISTS idx_opp_status ON growth_opportunities(status);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL, audience text NOT NULL,
  offer text NOT NULL, message text NOT NULL, timing text NOT NULL,
  expected_impact text NOT NULL,
  confidence integer NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  reason text NOT NULL, status campaign_status NOT NULL DEFAULT 'draft',
  approved_by text, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camps_merchant ON campaigns(merchant_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  run_code text UNIQUE NOT NULL, role agent_role NOT NULL, intent text NOT NULL,
  user_query text, final_decision text,
  final_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  tools_called_count integer NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0,
  errors text, status action_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_runs_merchant ON agent_runs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_runs_role ON agent_runs(role);
CREATE INDEX IF NOT EXISTS idx_runs_created ON agent_runs(created_at);

CREATE TABLE IF NOT EXISTS agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step integer NOT NULL DEFAULT 0, tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text, reasoning text,
  status action_status NOT NULL DEFAULT 'success', latency_ms integer NOT NULL DEFAULT 0,
  error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_run ON agent_actions(run_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  action audit_action NOT NULL, actor text NOT NULL DEFAULT 'system',
  target_type text, target_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text, request_id text, order_id uuid, payment_id uuid, amount_cents bigint,
  failure_reason text, recovery_action text, final_state text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_id text UNIQUE NOT NULL, event_type text NOT NULL,
  entity_type text, entity_id text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_verified boolean NOT NULL DEFAULT false, processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz, processing_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON webhook_events(event_type);

CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  source_product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  target_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type recommendation_type NOT NULL, score numeric(5,2) NOT NULL DEFAULT 0,
  reason text NOT NULL, evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_source ON recommendations(source_product_id);
CREATE INDEX IF NOT EXISTS idx_rec_target ON recommendations(target_product_id);

CREATE TABLE IF NOT EXISTS demo_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  simulate_payment_failure boolean NOT NULL DEFAULT false,
  simulate_api_timeout boolean NOT NULL DEFAULT false,
  simulate_inventory_failure boolean NOT NULL DEFAULT false,
  payment_provider text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id)
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DO $$ BEGIN CREATE TRIGGER merchants_updated AFTER INSERT OR UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER products_updated AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER carts_updated AFTER INSERT OR UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER orders_updated AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER payments_updated AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER opportunities_updated AFTER INSERT OR UPDATE ON growth_opportunities FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER campaigns_updated AFTER INSERT OR UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_controls ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'merchants','products','product_relationships','product_events',
    'customers','carts','cart_items','orders','order_items','payments',
    'growth_opportunities','campaigns','agent_runs','agent_actions',
    'audit_logs','webhook_events','recommendations','demo_controls'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true);', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO anon, authenticated USING (true);', t || '_delete', t);
  END LOOP;
END $$;
