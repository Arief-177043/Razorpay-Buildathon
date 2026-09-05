-- Fix SECURITY DEFINER warnings:
-- 1. Functions the client calls directly -> SECURITY INVOKER (RLS still applies)
-- 2. Functions only the edge function calls -> revoke EXECUTE from anon/authenticated

-- calculate_order_total: client calls this directly, only reads cart_items (RLS allows)
CREATE OR REPLACE FUNCTION public.calculate_order_total(p_cart_id uuid, p_discount_cents bigint DEFAULT 0, p_tax_rate numeric DEFAULT 0.00)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  subtotal bigint;
  tax_cents bigint;
  total bigint;
  items_json json;
BEGIN
  SELECT COALESCE(SUM(ci.unit_price_cents * ci.quantity), 0) INTO subtotal
  FROM cart_items ci WHERE ci.cart_id = p_cart_id;

  tax_cents := ROUND((subtotal - p_discount_cents) * p_tax_rate / 100);
  total := subtotal - p_discount_cents + tax_cents;

  SELECT COALESCE(json_agg(json_build_object(
    'product_id', ci.product_id,
    'quantity', ci.quantity,
    'unit_price_cents', ci.unit_price_cents,
    'line_total_cents', ci.unit_price_cents * ci.quantity
  )), '[]'::json) INTO items_json
  FROM cart_items ci WHERE ci.cart_id = p_cart_id;

  RETURN json_build_object(
    'subtotal_cents', subtotal,
    'discount_cents', p_discount_cents,
    'tax_cents', tax_cents,
    'total_cents', total,
    'items', items_json
  );
END;
$$;

-- get_merchant_metrics: client calls this, reads via RLS
CREATE OR REPLACE FUNCTION public.get_merchant_metrics(p_merchant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_revenue_cents', COALESCE(SUM(o.total_cents), 0),
    'total_orders', COUNT(DISTINCT o.id),
    'paid_orders', COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'paid'),
    'total_views', COALESCE(SUM(p.views_count), 0),
    'total_cart_adds', COALESCE(SUM(p.add_to_cart_count), 0),
    'total_purchases', COALESCE(SUM(p.purchase_count), 0),
    'total_abandonment', COALESCE(SUM(p.abandonment_count), 0),
    'total_customers', COUNT(DISTINCT c.id),
    'repeat_customers', COUNT(DISTINCT c.id) FILTER (WHERE c.total_orders > 1),
    'avg_order_value_cents', COALESCE(ROUND(AVG(o.total_cents) FILTER (WHERE o.status = 'paid')), 0),
    'conversion_rate', CASE WHEN COALESCE(SUM(p.views_count), 0) > 0 THEN ROUND((COALESCE(SUM(p.purchase_count), 0)::numeric / SUM(p.views_count)) * 100, 2) ELSE 0 END,
    'abandonment_rate', CASE WHEN COALESCE(SUM(p.add_to_cart_count), 0) > 0 THEN ROUND((COALESCE(SUM(p.abandonment_count), 0)::numeric / SUM(p.add_to_cart_count)) * 100, 2) ELSE 0 END,
    'repeat_customer_rate', CASE WHEN COUNT(DISTINCT c.id) > 0 THEN ROUND(COUNT(DISTINCT c.id) FILTER (WHERE c.total_orders > 1)::numeric / COUNT(DISTINCT c.id) * 100, 2) ELSE 0 END
  ) INTO result
  FROM products p
  LEFT JOIN orders o ON o.merchant_id = p.merchant_id
  LEFT JOIN customers c ON c.merchant_id = p.merchant_id
  WHERE p.merchant_id = p_merchant_id;
  RETURN result;
END;
$$;

-- get_product_metrics: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_product_metrics(p_product_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'views_count', p.views_count,
    'add_to_cart_count', p.add_to_cart_count,
    'purchase_count', p.purchase_count,
    'abandonment_count', p.abandonment_count,
    'conversion_rate', CASE WHEN p.views_count > 0 THEN ROUND((p.purchase_count::numeric / p.views_count) * 100, 2) ELSE 0 END,
    'abandonment_rate', CASE WHEN p.add_to_cart_count > 0 THEN ROUND((p.abandonment_count::numeric / p.add_to_cart_count) * 100, 2) ELSE 0 END,
    'repeat_purchase_count', p.repeat_purchase_count
  ) INTO result
  FROM products p
  WHERE p.id = p_product_id;
  RETURN result;
END;
$$;

-- get_recommendations_for_product: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_recommendations_for_product(p_product_id uuid, p_limit int DEFAULT 4)
RETURNS TABLE (
  product_id uuid,
  score numeric,
  relationship_type text,
  evidence text,
  name text,
  category text,
  price_cents bigint,
  rating numeric,
  inventory_count int,
  image_url text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    pr.score,
    pr.relationship_type,
    pr.evidence,
    p.name,
    p.category::text,
    p.price_cents,
    p.rating,
    p.inventory_count,
    p.image_url
  FROM product_relationships pr
  JOIN products p ON p.id = pr.target_product_id
  WHERE pr.source_product_id = p_product_id
    AND p.is_active = true
  ORDER BY pr.score DESC
  LIMIT p_limit;
END;
$$;

-- discover_growth_opportunities: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.discover_growth_opportunities(p_merchant_id uuid)
RETURNS TABLE (
  type text,
  title text,
  observation text,
  reason text,
  primary_product_id uuid,
  related_product_id uuid,
  current_value numeric,
  target_value numeric,
  estimated_monthly_revenue_cents bigint,
  confidence int,
  recommended_action text,
  evidence json
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    'cross_sell'::text,
    'Cross-sell: ' || p1.name || ' + ' || p2.name,
    'Co-purchase score of ' || pr.score || ' between ' || p1.name || ' and ' || p2.name,
    'Bundle these products on product pages to increase average order value.',
    pr.source_product_id,
    pr.target_product_id,
    0::numeric,
    15::numeric,
    (p1.price_cents + p2.price_cents) / 10,
    LEAST(95, 60 + (pr.score::int * 5)),
    'Show ' || p2.name || ' as a recommended add-on on ' || p1.name || ' product page.',
    json_build_object('co_purchase_score', pr.score, 'source_product', p1.name, 'target_product', p2.name)
  FROM product_relationships pr
  JOIN products p1 ON p1.id = pr.source_product_id
  JOIN products p2 ON p2.id = pr.target_product_id
  WHERE pr.merchant_id = p_merchant_id AND pr.relationship_type = 'cross_sell' AND pr.score > 5;

  RETURN QUERY
  SELECT
    'abandoned_cart_recovery'::text,
    'Recover abandoned carts for ' || p.name,
    p.abandonment_count || ' abandoned carts for ' || p.name || ' (rate: ' ||
      CASE WHEN p.add_to_cart_count > 0 THEN ROUND((p.abandonment_count::numeric / p.add_to_cart_count) * 100, 1) ELSE 0 END || '%)',
    'Targeted reminder campaign for customers who added ' || p.name || ' but did not purchase.',
    p.id,
    NULL::uuid,
    CASE WHEN p.add_to_cart_count > 0 THEN ROUND((p.abandonment_count::numeric / p.add_to_cart_count) * 100, 2) ELSE 0 END,
    5::numeric,
    (p.abandonment_count * p.price_cents) / 20,
    LEAST(90, 50 + (p.abandonment_count / 10)),
    'Send a reminder email to customers who abandoned ' || p.name || ' with a 5% discount code.',
    json_build_object('abandonment_count', p.abandonment_count, 'abandonment_rate', CASE WHEN p.add_to_cart_count > 0 THEN ROUND((p.abandonment_count::numeric / p.add_to_cart_count) * 100, 2) ELSE 0 END)
  FROM products p
  WHERE p.merchant_id = p_merchant_id AND p.abandonment_count > 20;

  RETURN QUERY
  SELECT
    'traffic_conversion'::text,
    'Improve conversion for ' || p.name,
    p.views_count || ' views but only ' || p.purchase_count || ' purchases (' ||
      CASE WHEN p.views_count > 0 THEN ROUND((p.purchase_count::numeric / p.views_count) * 100, 2) ELSE 0 END || '% conversion)',
    'High traffic but low conversion — review pricing, product images, or description.',
    p.id,
    NULL::uuid,
    CASE WHEN p.views_count > 0 THEN ROUND((p.purchase_count::numeric / p.views_count) * 100, 2) ELSE 0 END,
    5::numeric,
    (p.views_count * p.price_cents) / 500,
    LEAST(85, 55 + (p.views_count / 100)),
    'A/B test product page improvements for ' || p.name || '. Consider price optimization or enhanced images.',
    json_build_object('views_count', p.views_count, 'purchase_count', p.purchase_count, 'conversion_rate', CASE WHEN p.views_count > 0 THEN ROUND((p.purchase_count::numeric / p.views_count) * 100, 2) ELSE 0 END)
  FROM products p
  WHERE p.merchant_id = p_merchant_id AND p.views_count > 500 AND (p.views_count = 0 OR (p.purchase_count::numeric / p.views_count) < 0.02);

  RETURN QUERY
  SELECT
    'repeat_purchase'::text,
    'Re-engage buyers of ' || p.name,
    p.repeat_purchase_count || ' repeat purchases for ' || p.name,
    'Customers who bought ' || p.name || ' are likely to buy again — re-engage them.',
    p.id,
    NULL::uuid,
    0::numeric,
    10::numeric,
    (p.repeat_purchase_count * p.price_cents) / 10,
    LEAST(88, 60 + (p.repeat_purchase_count / 5)),
    'Send a repurchase reminder to customers who bought ' || p.name || ' 30+ days ago.',
    json_build_object('repeat_purchase_count', p.repeat_purchase_count)
  FROM products p
  WHERE p.merchant_id = p_merchant_id AND p.repeat_purchase_count > 5;
END;
$$;

-- get_abandoned_carts: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_abandoned_carts(p_merchant_id uuid)
RETURNS TABLE (
  cart_id uuid,
  status text,
  created_at timestamptz,
  customer_id uuid,
  item_count bigint,
  cart_value bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.status::text,
    c.created_at,
    c.customer_id,
    COUNT(ci.id),
    COALESCE(SUM(ci.unit_price_cents * ci.quantity), 0)
  FROM carts c
  LEFT JOIN cart_items ci ON ci.cart_id = c.id
  WHERE c.merchant_id = p_merchant_id AND c.status = 'abandoned'
  GROUP BY c.id, c.status, c.created_at, c.customer_id
  ORDER BY c.created_at DESC;
END;
$$;

-- get_customer_segments: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_customer_segments(p_merchant_id uuid)
RETURNS TABLE (
  segment text,
  customer_count bigint,
  total_spent bigint,
  avg_spent numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.segment::text,
    COUNT(*),
    COALESCE(SUM(c.total_spent_cents), 0),
    COALESCE(ROUND(AVG(c.total_spent_cents)), 0)
  FROM customers c
  WHERE c.merchant_id = p_merchant_id
  GROUP BY c.segment
  ORDER BY total_spent DESC;
END;
$$;

-- generate_run_code: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.generate_run_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 'RUN-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || LPAD((random() * 9999)::int::text, 4, '0');
$$;

-- generate_order_number: SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 'ORD-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || LPAD((random() * 9999)::int::text, 4, '0');
$$;

-- decrement_inventory: keep SECURITY DEFINER (updates products) but revoke EXECUTE from anon/authenticated
-- Only the edge function (service role) should call this
REVOKE EXECUTE ON FUNCTION public.decrement_inventory(uuid, int) FROM anon, authenticated;
