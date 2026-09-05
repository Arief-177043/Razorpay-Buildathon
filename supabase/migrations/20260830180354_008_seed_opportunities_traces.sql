/*
# RazorFlow AI — Seed Growth Opportunities + Agent Traces + Audit Logs

Persists the deterministic opportunity candidates discovered by
discover_growth_opportunities() into growth_opportunities (status=discovered),
so the merchant dashboard can display pending AI recommendations for approval.

Also seeds example agent runs + actions (buyer + growth traces) and audit logs
to populate the Agent Trace and Audit pages out of the box.
*/
DO $$
DECLARE
  m_id uuid := 'a1b2c3d4-0000-0000-0000-000000000001';
  p_x200 uuid; p_casec12 uuid; p_litegrip uuid; p_powerbank uuid; p_cablepro uuid;
  p_mechk1 uuid; p_wristrest uuid;
  opp jsonb; opp_obj jsonb; run_id uuid;
BEGIN
  SELECT id INTO p_x200 FROM products WHERE merchant_id=m_id AND slug='x200-gaming-headset';
  SELECT id INTO p_casec12 FROM products WHERE merchant_id=m_id AND slug='casec12-headset-case';
  SELECT id INTO p_litegrip FROM products WHERE merchant_id=m_id AND slug='litegrip-gaming-headset';
  SELECT id INTO p_powerbank FROM products WHERE merchant_id=m_id AND slug='powerbank-20k';
  SELECT id INTO p_cablepro FROM products WHERE merchant_id=m_id AND slug='cablepro-braided-usb-c';
  SELECT id INTO p_mechk1 FROM products WHERE merchant_id=m_id AND slug='mechpro-k1-keyboard';
  SELECT id INTO p_wristrest FROM products WHERE merchant_id=m_id AND slug='wristrest-pro';

  -- Persist discovered opportunities (discovered = pending approval)
  INSERT INTO growth_opportunities (merchant_id, type, title, observation, reason, primary_product_id, related_product_id, current_value, target_value, estimated_monthly_revenue_cents, confidence, recommended_action, status, evidence)
  VALUES
  (m_id,'cross_sell','Cross-sell: X200 Gaming Headset → CaseC12 Headset Case',
   'Customers who buy NexaGear X200 Gaming Headset frequently also buy CaseC12 Headset Case. Current attachment rate is 55.9%.',
   'Strong purchase correlation (38 co-purchases, confidence 62%) plus compatible hard-shell case category. Raising attachment to 70% adds measurable monthly revenue.',
   p_x200, p_casec12, 55.88, 70.0, 420000, 87,
   'Show CaseC12 Headset Case immediately after X200 selection in the buyer flow.',
   'discovered',
   jsonb_build_object('co_purchase_count',38,'confidence',0.62,'relationship','frequently_bought_together')),
  (m_id,'cross_sell','Cross-sell: MechPro K1 Keyboard → WristRest Pro',
   'Customers who buy MechPro K1 Keyboard frequently also buy WristRest Pro. Current attachment rate is 41.4%.',
   'Strong purchase correlation (24 co-purchases, confidence 58%). Raising attachment to 60% adds monthly revenue.',
   p_mechk1, p_wristrest, 41.38, 60.0, 180000, 82,
   'Offer WristRest Pro as a bundle add-on during MechPro K1 checkout.',
   'discovered',
   jsonb_build_object('co_purchase_count',24,'confidence',0.58,'relationship','frequently_bought_together')),
  (m_id,'traffic_conversion','Traffic conversion: LiteGrip Gaming Headset',
   'High traffic (6800 views) but low conversion (1.40%).',
   'Product attracts attention but fails to convert. Likely price friction or weak listing. A targeted offer or bundle could lift conversion.',
   p_litegrip, NULL, 1.40, 4.0, 95000, 70,
   'Test a limited-time offer or improve listing clarity for LiteGrip Gaming Headset.',
   'discovered',
   jsonb_build_object('views',6800,'purchases',95,'conversion_rate',1.40)),
  (m_id,'abandoned_cart_recovery','Abandoned cart recovery: PowerBank 20K',
   'High abandonment rate (26.2%) with 110 abandoned checkouts.',
   'Customers show intent but do not complete. A reminder with the saved cart and frictionless retry can recover a meaningful share.',
   p_powerbank, NULL, 26.19, 20.0, 660000, 78,
   'Send a cart recovery reminder for PowerBank 20K with one-click retry.',
   'discovered',
   jsonb_build_object('abandonment_count',110,'add_to_cart_count',420)),
  (m_id,'repeat_purchase','Repeat purchase: CablePro Braided USB-C',
   'Strong repeat purchase behavior (20 repeat buyers).',
   'Existing customers re-buy this product. A loyalty bundle or subscription-style refill can compound recurring revenue.',
   p_cablepro, NULL, 20, 30, 250000, 82,
   'Offer a loyalty bundle or repeat-buyer discount for CablePro Braided USB-C.',
   'discovered',
   jsonb_build_object('repeat_purchase_count',20))
  ON CONFLICT DO NOTHING;

  -- ============================
  -- AGENT RUNS + ACTIONS (trace examples)
  -- ============================
  -- Run 1: Buyer agent — "Find me gaming headphones under ₹5,000"
  INSERT INTO agent_runs (id, merchant_id, run_code, role, intent, user_query, final_decision, final_result, tools_called_count, latency_ms, status, created_at, completed_at)
  VALUES (gen_random_uuid(), m_id, 'RUN-8F21A4CD', 'buyer',
    'Find gaming headphones under ₹5,000',
    'I need good wireless headphones for gaming under ₹5,000.',
    'Recommended NexaGear X200 Gaming Headset (₹4,999) and offered CaseC12 as cross-sell.',
    jsonb_build_object('recommended_product','X200 Gaming Headset','price_cents',499900,'cross_sell','CaseC12 Headset Case'),
    3, 1420, 'success', now() - interval '2 hours', now() - interval '2 hours')
  RETURNING id INTO run_id;
  INSERT INTO agent_actions (run_id, step, tool_name, arguments, result, decision, reasoning, status, latency_ms) VALUES
  (run_id, 1, 'search_catalog', jsonb_build_object('category','gaming_headphones','max_price_cents',500000), jsonb_build_object('count',3,'products',jsonb_build_array('X200','LiteGrip','EsportsX')), 'Found 3 candidates within budget.', 'Filtered active gaming headsets under ₹5,000 from catalog.', 'success', 320),
  (run_id, 2, 'get_product_recommendations', jsonb_build_object('product_id','x200'), jsonb_build_object('count',2,'items',jsonb_build_array('CaseC12','GhostMice Pro')), 'Selected X200 as primary; pulled cross-sell candidates.', 'X200 has best mic quality and rating within budget. Cross-sell via co-purchase data.', 'success', 280),
  (run_id, 3, 'add_to_cart', jsonb_build_object('product_id','x200','quantity',1), jsonb_build_object('cart_id','sess-001','success',true), 'Added X200 to cart and presented CaseC12 as optional accessory.', 'Customer asked for one headset; cross-sell is grounded in 38 co-purchases.', 'success', 410);

  -- Run 2: Growth agent — "Find revenue opportunities"
  INSERT INTO agent_runs (id, merchant_id, run_code, role, intent, final_decision, final_result, tools_called_count, latency_ms, status, created_at, completed_at)
  VALUES (gen_random_uuid(), m_id, 'RUN-3B77E0F1', 'growth',
    'Discover revenue opportunities',
    'Identified 5 opportunities: 2 cross-sell, 1 traffic conversion, 1 cart recovery, 1 repeat purchase.',
    jsonb_build_object('opportunities_found',5,'total_estimated_revenue_cents',1605000),
    4, 2100, 'success', now() - interval '3 hours', now() - interval '3 hours')
  RETURNING id INTO run_id;
  INSERT INTO agent_actions (run_id, step, tool_name, arguments, result, decision, reasoning, status, latency_ms) VALUES
  (run_id, 1, 'get_merchant_profile', jsonb_build_object('merchant_id', m_id), jsonb_build_object('name','NexaGear','currency','INR'), 'Loaded merchant context.', 'Need merchant scope before querying analytics.', 'success', 180),
  (run_id, 2, 'get_sales_metrics', jsonb_build_object('merchant_id', m_id), jsonb_build_object('total_revenue_cents',58000000,'paid_orders',92), 'Established baseline revenue and order volume.', 'Baseline metrics ground opportunity estimates.', 'success', 450),
  (run_id, 3, 'get_product_relationships', jsonb_build_object('merchant_id', m_id), jsonb_build_object('relationships',10), 'Found 10 co-purchase relationships; 2 strong enough for cross-sell.', 'Co-purchase count ≥24 with confidence ≥0.5 indicates actionable cross-sell.', 'success', 390),
  (run_id, 4, 'get_revenue_opportunities', jsonb_build_object('merchant_id', m_id), jsonb_build_object('opportunities',5), 'Persisted 5 opportunities for merchant approval.', 'Each opportunity is grounded in deterministic metrics — AI explains, merchant approves.', 'success', 560);

  -- Run 3: Buyer agent — failure recovery (payment failed)
  INSERT INTO agent_runs (id, merchant_id, run_code, role, intent, user_query, final_decision, final_result, tools_called_count, latency_ms, errors, status, created_at, completed_at)
  VALUES (gen_random_uuid(), m_id, 'RUN-5C90A2E8', 'buyer',
    'Checkout with PowerBank 20K (payment failed)',
    'Buy the PowerBank 20K.',
    'Payment failed — cart preserved, no duplicate order. Customer can safely retry.',
    jsonb_build_object('order_status','failed','cart_preserved',true,'duplicate_order',false),
    4, 1850, 'Payment declined by bank', 'failed', now() - interval '1 hour', now() - interval '1 hour')
  RETURNING id INTO run_id;
  INSERT INTO agent_actions (run_id, step, tool_name, arguments, result, decision, reasoning, status, latency_ms, error) VALUES
  (run_id, 1, 'search_catalog', jsonb_build_object('query','powerbank'), jsonb_build_object('count',1), 'Found PowerBank 20K.', 'Direct product lookup.', 'success', 200, NULL),
  (run_id, 2, 'calculate_order_total', jsonb_build_object('cart_id','sess-003'), jsonb_build_object('total_cents',353880,'tax_cents',53980), 'Total computed deterministically: ₹2,999 + 18% GST = ₹3,538.80.', 'AI never sets price; total computed server-side from cart.', 'success', 150, NULL),
  (run_id, 3, 'create_payment_order', jsonb_build_object('order_id','NXG-FAIL-0001'), jsonb_build_object('status','failed','reason','Payment declined by bank'), 'Payment failed — preserved cart, recorded failure.', 'Bank declined; cart kept active for retry. No duplicate order created.', 'failed', 900, 'Payment declined by bank'),
  (run_id, 4, 'create_audit_log', jsonb_build_object('action','payment_verify','status','failed'), jsonb_build_object('logged',true), 'Recorded failure in audit trail with recovery action.', 'Every money failure must be auditable and recoverable.', 'success', 120, NULL);

  -- ============================
  -- AUDIT LOGS
  -- ============================
  INSERT INTO audit_logs (merchant_id, action, actor, target_type, details, reason, request_id, amount_cents, created_at) VALUES
  (m_id, 'order_create', 'buyer-agent', 'order', jsonb_build_object('order_number','NXG-200101-0001','items',1), 'Buyer agent created order after deterministic total calculation.', 'req-0001', 589880, now() - interval '2 hours'),
  (m_id, 'payment_create', 'buyer-agent', 'payment', jsonb_build_object('razorpay_order_id','order_000001','provider','razorpay'), 'Created Razorpay test order for checkout.', 'req-0002', 589880, now() - interval '2 hours'),
  (m_id, 'payment_verify', 'buyer-agent', 'payment', jsonb_build_object('verified',true,'razorpay_payment_id','pay_000001'), 'Cryptographic signature verification succeeded.', 'req-0003', 589880, now() - interval '2 hours'),
  (m_id, 'failure_simulate', 'demo-control', 'payment', jsonb_build_object('order_number','NXG-FAIL-0001','reason','Payment declined by bank'), 'Demo: simulated payment failure to show recovery.', 'req-0004', 353880, now() - interval '1 hour');
  INSERT INTO audit_logs (merchant_id, action, actor, target_type, details, reason, failure_reason, recovery_action, final_state, created_at) VALUES
  (m_id, 'payment_verify', 'buyer-agent', 'payment', jsonb_build_object('order_number','NXG-FAIL-0001'), 'Payment verification failed.', 'Payment declined by bank', 'Cart preserved; order marked failed; no duplicate created.', 'cart_active', now() - interval '1 hour');
END $$;
