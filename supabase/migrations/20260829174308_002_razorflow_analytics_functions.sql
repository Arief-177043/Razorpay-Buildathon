/*
# RazorFlow AI — Analytics & Recommendation Functions

Deterministic SQL functions computing metrics, recommendations, and growth
opportunity candidates from actual product/event/order data. The AI agent
calls these as tools and reasons over their OUTPUT — it never computes
prices, totals, or revenue figures itself.

Functions: get_merchant_metrics, get_product_metrics, get_recommendations_for_product,
discover_growth_opportunities, get_abandoned_carts, get_customer_segments,
calculate_order_total, generate_run_code, generate_order_number.
*/

CREATE OR REPLACE FUNCTION get_merchant_metrics(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  total_revenue bigint; total_orders int; paid_orders int;
  total_views int; total_cart_adds int; total_purchases int; total_abandonment int;
  repeat_customers int; total_customers int;
  aov numeric; conversion_rate numeric; abandonment_rate numeric; repeat_rate numeric;
BEGIN
  SELECT COALESCE(SUM(total_cents),0), COUNT(*), COUNT(*) FILTER (WHERE status='paid')
    INTO total_revenue, total_orders, paid_orders
    FROM orders WHERE merchant_id = p_merchant_id;
  SELECT COALESCE(SUM(views_count),0), COALESCE(SUM(add_to_cart_count),0),
         COALESCE(SUM(purchase_count),0), COALESCE(SUM(abandonment_count),0)
    INTO total_views, total_cart_adds, total_purchases, total_abandonment
    FROM products WHERE merchant_id = p_merchant_id;
  SELECT COUNT(*) FILTER (WHERE total_orders > 1), COUNT(*)
    INTO repeat_customers, total_customers
    FROM customers WHERE merchant_id = p_merchant_id;
  aov := CASE WHEN paid_orders > 0 THEN round(total_revenue::numeric / paid_orders, 0) ELSE 0 END;
  conversion_rate := CASE WHEN total_views > 0 THEN round((total_purchases::numeric / total_views) * 100, 2) ELSE 0 END;
  abandonment_rate := CASE WHEN total_cart_adds > 0 THEN round((total_abandonment::numeric / total_cart_adds) * 100, 2) ELSE 0 END;
  repeat_rate := CASE WHEN total_customers > 0 THEN round((repeat_customers::numeric / total_customers) * 100, 2) ELSE 0 END;
  RETURN jsonb_build_object(
    'total_revenue_cents', total_revenue, 'total_orders', total_orders, 'paid_orders', paid_orders,
    'total_views', total_views, 'total_cart_adds', total_cart_adds, 'total_purchases', total_purchases,
    'total_abandonment', total_abandonment, 'total_customers', total_customers, 'repeat_customers', repeat_customers,
    'avg_order_value_cents', aov, 'conversion_rate', conversion_rate,
    'abandonment_rate', abandonment_rate, 'repeat_customer_rate', repeat_rate
  );
END; $$;

CREATE OR REPLACE FUNCTION get_product_metrics(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE p record; conv numeric; abandon numeric;
BEGIN
  SELECT * INTO p FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','product not found'); END IF;
  conv := CASE WHEN p.views_count > 0 THEN round((p.purchase_count::numeric / p.views_count) * 100, 2) ELSE 0 END;
  abandon := CASE WHEN p.add_to_cart_count > 0 THEN round((p.abandonment_count::numeric / p.add_to_cart_count) * 100, 2) ELSE 0 END;
  RETURN jsonb_build_object(
    'product_id', p.id, 'name', p.name, 'category', p.category,
    'price_cents', p.price_cents, 'inventory_count', p.inventory_count,
    'views_count', p.views_count, 'add_to_cart_count', p.add_to_cart_count,
    'purchase_count', p.purchase_count, 'abandonment_count', p.abandonment_count,
    'repeat_purchase_count', p.repeat_purchase_count,
    'conversion_rate', conv, 'abandonment_rate', abandon,
    'rating', p.rating, 'rating_count', p.rating_count
  );
END; $$;

CREATE OR REPLACE FUNCTION get_recommendations_for_product(p_product_id uuid, p_limit int DEFAULT 4)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE p record; recs jsonb;
BEGIN
  SELECT * INTO p FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  WITH ranked AS (
    SELECT r.target_product_id AS product_id, (r.co_purchase_count * 3 + r.confidence * 10) AS score,
           r.relationship_type, r.evidence, tp.name, tp.category, tp.price_cents, tp.rating, tp.inventory_count, tp.image_url
      FROM product_relationships r JOIN products tp ON tp.id = r.target_product_id AND tp.is_active = true
      WHERE r.source_product_id = p_product_id
    UNION ALL
    SELECT s.id, 5.0, 'category_sibling', ('Same category: '||s.category)::text, s.name, s.category, s.price_cents, s.rating, s.inventory_count, s.image_url
      FROM products s WHERE s.merchant_id = p.merchant_id AND s.id <> p_product_id AND s.category = p.category AND s.is_active = true
    UNION ALL
    SELECT a.id, 3.0, 'price_ladder', 'Lower-priced accessory', a.name, a.category, a.price_cents, a.rating, a.inventory_count, a.image_url
      FROM products a WHERE a.merchant_id = p.merchant_id AND a.id <> p_product_id AND a.price_cents < p.price_cents
        AND a.price_cents <= (p.price_cents * 0.4) AND a.is_active = true
        AND a.category IN ('carrying_cases','usb_hubs','stands','gaming_accessories','laptop_accessories')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'score', round(score::numeric,2), 'relationship_type', relationship_type, 'evidence', evidence,
    'name', name, 'category', category, 'price_cents', price_cents, 'rating', rating, 'inventory_count', inventory_count, 'image_url', image_url
  ) ORDER BY score DESC), '[]'::jsonb)
  INTO recs
  FROM (SELECT DISTINCT ON (product_id) * FROM ranked ORDER BY product_id, score DESC) q
  LIMIT p_limit;
  RETURN recs;
END; $$;

CREATE OR REPLACE FUNCTION discover_growth_opportunities(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE opps jsonb;
BEGIN
  WITH cross_sell AS (
    SELECT jsonb_build_object(
      'type','cross_sell', 'title','Cross-sell: '||sp.name||' → '||tp.name,
      'observation','Customers who buy '||sp.name||' frequently also buy '||tp.name||'. Current attachment rate is '||
        CASE WHEN sp.purchase_count > 0 THEN round((r.co_purchase_count::numeric/sp.purchase_count)*100,1) ELSE 0 END || '%.',
      'reason','Strong purchase correlation ('||r.co_purchase_count||' co-purchases, confidence '||round(r.confidence*100,0)||
        '%) plus compatible product category. Raising attachment to 15% adds measurable monthly revenue.',
      'primary_product_id', sp.id, 'related_product_id', tp.id,
      'current_value', CASE WHEN sp.purchase_count > 0 THEN round((r.co_purchase_count::numeric/sp.purchase_count)*100,2) ELSE 0 END,
      'target_value', 15.0, 'estimated_monthly_revenue_cents', (r.co_purchase_count * tp.price_cents / 10)::bigint,
      'confidence', LEAST(95, (r.co_purchase_count * 5 + (r.confidence * 50))::int),
      'recommended_action','Show '||tp.name||' immediately after '||sp.name||' selection in the buyer flow.',
      'evidence', jsonb_build_object('co_purchase_count', r.co_purchase_count, 'confidence', r.confidence, 'relationship', r.relationship_type)
    ) AS opp FROM product_relationships r
      JOIN products sp ON sp.id = r.source_product_id AND sp.merchant_id = p_merchant_id
      JOIN products tp ON tp.id = r.target_product_id AND tp.merchant_id = p_merchant_id
      WHERE r.co_purchase_count >= 5 AND r.confidence >= 0.3 LIMIT 6
  ),
  traffic AS (
    SELECT jsonb_build_object(
      'type','traffic_conversion', 'title','Traffic conversion: '||p.name,
      'observation','High traffic ('||p.views_count||' views) but low conversion ('||
        CASE WHEN p.views_count > 0 THEN round((p.purchase_count::numeric/p.views_count)*100,2) ELSE 0 END || '%).',
      'reason','Product attracts attention but fails to convert. Likely price friction or weak listing. A targeted offer or bundle could lift conversion.',
      'primary_product_id', p.id, 'related_product_id', NULL,
      'current_value', CASE WHEN p.views_count > 0 THEN round((p.purchase_count::numeric/p.views_count)*100,2) ELSE 0 END,
      'target_value', 4.0, 'estimated_monthly_revenue_cents', (p.views_count / 100 * p.price_cents / 20)::bigint,
      'confidence', 70, 'recommended_action','Test a limited-time offer or improve listing clarity for '||p.name||'.',
      'evidence', jsonb_build_object('views', p.views_count, 'purchases', p.purchase_count, 'conversion_rate', CASE WHEN p.views_count > 0 THEN round((p.purchase_count::numeric/p.views_count)*100,2) ELSE 0 END)
    ) AS opp FROM products p WHERE p.merchant_id = p_merchant_id AND p.views_count >= 800 AND p.purchase_count <= 30 LIMIT 4
  ),
  abandon AS (
    SELECT jsonb_build_object(
      'type','abandoned_cart_recovery', 'title','Abandoned cart recovery: '||p.name,
      'observation','High abandonment rate ('||
        CASE WHEN p.add_to_cart_count > 0 THEN round((p.abandonment_count::numeric/p.add_to_cart_count)*100,1) ELSE 0 END || '%) with '||p.abandonment_count||' abandoned checkouts.',
      'reason','Customers show intent but do not complete. A reminder with the saved cart and frictionless retry can recover a meaningful share.',
      'primary_product_id', p.id, 'related_product_id', NULL,
      'current_value', CASE WHEN p.add_to_cart_count > 0 THEN round((p.abandonment_count::numeric/p.add_to_cart_count)*100,2) ELSE 0 END,
      'target_value', 20.0, 'estimated_monthly_revenue_cents', (p.abandonment_count * p.price_cents / 5)::bigint,
      'confidence', 78, 'recommended_action','Send a cart recovery reminder for '||p.name||' with one-click retry.',
      'evidence', jsonb_build_object('abandonment_count', p.abandonment_count, 'add_to_cart_count', p.add_to_cart_count)
    ) AS opp FROM products p WHERE p.merchant_id = p_merchant_id AND p.abandonment_count >= 40 LIMIT 4
  ),
  repeatp AS (
    SELECT jsonb_build_object(
      'type','repeat_purchase', 'title','Repeat purchase: '||p.name,
      'observation','Strong repeat purchase behavior ('||p.repeat_purchase_count||' repeat buyers).',
      'reason','Existing customers re-buy this product. A loyalty bundle or subscription-style refill can compound recurring revenue.',
      'primary_product_id', p.id, 'related_product_id', NULL,
      'current_value', p.repeat_purchase_count, 'target_value', (p.repeat_purchase_count * 1.5)::int,
      'estimated_monthly_revenue_cents', (p.repeat_purchase_count * p.price_cents / 4)::bigint,
      'confidence', 82, 'recommended_action','Offer a loyalty bundle or repeat-buyer discount for '||p.name||'.',
      'evidence', jsonb_build_object('repeat_purchase_count', p.repeat_purchase_count)
    ) AS opp FROM products p WHERE p.merchant_id = p_merchant_id AND p.repeat_purchase_count >= 15 LIMIT 3
  ),
  all_opps AS (
    SELECT opp FROM cross_sell UNION ALL SELECT opp FROM traffic UNION ALL SELECT opp FROM abandon UNION ALL SELECT opp FROM repeatp
  )
  SELECT COALESCE(jsonb_agg(opp), '[]'::jsonb) INTO opps FROM all_opps;
  RETURN opps;
END; $$;

CREATE OR REPLACE FUNCTION get_abandoned_carts(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb;
BEGIN
  WITH ac AS (
    SELECT c.id, c.customer_id, c.subtotal_cents, c.total_cents, c.currency, c.abandoned_at, c.created_at,
           coalesce(cu.name,'Guest') AS customer_name, coalesce(cu.email,'') AS customer_email,
           (SELECT jsonb_agg(jsonb_build_object('product_id',ci.product_id,'quantity',ci.quantity,'unit_price_cents',ci.unit_price_cents,'name',pr.name))
            FROM cart_items ci JOIN products pr ON pr.id = ci.product_id WHERE ci.cart_id = c.id) AS items
      FROM carts c LEFT JOIN customers cu ON cu.id = c.customer_id
      WHERE c.merchant_id = p_merchant_id AND c.status = 'abandoned'
      ORDER BY c.abandoned_at DESC LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ac)), '[]'::jsonb) INTO result FROM ac;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION get_customer_segments(p_merchant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb;
BEGIN
  WITH seg AS (
    SELECT segment, COUNT(*) AS count, COALESCE(SUM(total_spent_cents),0) AS total_spent_cents, COALESCE(SUM(total_orders),0) AS total_orders
      FROM customers WHERE merchant_id = p_merchant_id GROUP BY segment ORDER BY count DESC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(seg)), '[]'::jsonb) INTO result FROM seg;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION calculate_order_total(p_cart_id uuid, p_discount_cents bigint DEFAULT 0, p_tax_rate numeric DEFAULT 0.00)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE subtotal bigint; discount bigint; tax bigint; total bigint; items jsonb;
BEGIN
  SELECT COALESCE(SUM(unit_price_cents * quantity),0) INTO subtotal FROM cart_items WHERE cart_id = p_cart_id;
  discount := LEAST(p_discount_cents, subtotal);
  tax := round(((subtotal - discount) * p_tax_rate / 100.0))::bigint;
  total := subtotal - discount + tax;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price_cents',unit_price_cents,'line_total_cents',unit_price_cents*quantity)), '[]'::jsonb)
    INTO items FROM cart_items WHERE cart_id = p_cart_id;
  RETURN jsonb_build_object('subtotal_cents', subtotal, 'discount_cents', discount, 'tax_cents', tax, 'total_cents', total, 'currency','INR', 'items', items);
END; $$;

CREATE OR REPLACE FUNCTION generate_run_code() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT 'RUN-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,8));
$$;

CREATE OR REPLACE FUNCTION generate_order_number() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT 'NXG-' || to_char(now(),'YYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3),'hex'),1,6));
$$;
