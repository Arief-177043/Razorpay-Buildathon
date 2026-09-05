/*
# RazorFlow AI — Seed Orders, Payments, Abandoned Carts

Creates ~90 paid orders with deterministic totals + Razorpay-style payment
records, plus abandoned carts for recovery demonstrations. Uses a loop that
picks real products and computes totals via calculate_order_total.
*/
DO $$
DECLARE
  m_id uuid := 'a1b2c3d4-0000-0000-0000-000000000001';
  i int;
  prod uuid; pname text; pprice bigint;
  cust uuid;
  subtotal bigint; tax bigint; total bigint;
  ord_id uuid; pay_id uuid; cart_id uuid;
  onum text;
  pids uuid[];
BEGIN
  -- Array of product IDs to cycle through
  SELECT array_agg(id) INTO pids FROM products WHERE merchant_id=m_id AND is_active=true;

  FOR i IN 1..90 LOOP
    -- pick product
    prod := pids[((i-1) % array_length(pids,1)) + 1];
    SELECT name, price_cents INTO pname, pprice FROM products WHERE id=prod;
    -- pick a customer (cycle through segments)
    SELECT id INTO cust FROM customers WHERE merchant_id=m_id ORDER BY created_at OFFSET ((i-1) % 30) LIMIT 1;

    -- deterministic totals
    subtotal := pprice;
    tax := round(subtotal * 0.18)::bigint;
    total := subtotal + tax;
    onum := 'NXG-' || lpad(to_char(now(),'YYMMDD'),6,'0') || '-' || lpad(i::text,4,'0');

    -- create cart (converted)
    INSERT INTO carts (id, merchant_id, customer_id, status, subtotal_cents, tax_cents, total_cents, currency)
    VALUES (gen_random_uuid(), m_id, cust, 'converted', subtotal, tax, total, 'INR')
    RETURNING id INTO cart_id;
    INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents)
    VALUES (cart_id, prod, 1, pprice);

    -- create order (paid)
    INSERT INTO orders (id, merchant_id, customer_id, cart_id, order_number, status, subtotal_cents, tax_cents, total_cents, currency, items_count, razorpay_order_id, idempotency_key, created_at)
    VALUES (gen_random_uuid(), m_id, cust, cart_id, onum, 'paid', subtotal, tax, total, 'INR', 1,
      'order_'||lpad(i::text,6,'0'), 'idem-'||onum, now() - ((i%30) || ' days')::interval)
    RETURNING id INTO ord_id;

    -- link cart to order
    UPDATE carts SET converted_order_id = ord_id WHERE id = cart_id;

    -- mark order items
    INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents, total_cents)
    VALUES (ord_id, prod, pname, 1, pprice, pprice);

    -- payment record (captured)
    INSERT INTO payments (id, merchant_id, order_id, razorpay_payment_id, razorpay_order_id, amount_cents, currency, status, method, provider, verified, verified_at, created_at)
    VALUES (gen_random_uuid(), m_id, ord_id, 'pay_'||lpad(i::text,8,'0'), 'order_'||lpad(i::text,6,'0'), total, 'INR', 'captured', CASE (i%3) WHEN 0 THEN 'upi' WHEN 1 THEN 'card' ELSE 'netbanking' END, 'razorpay', true, now() - ((i%30) || ' days')::interval, now() - ((i%30) || ' days')::interval);
  END LOOP;

  -- ABANDONED CARTS (8) for recovery demo
  FOR i IN 1..8 LOOP
    prod := pids[((i+4) % array_length(pids,1)) + 1];
    SELECT name, price_cents INTO pname, pprice FROM products WHERE id=prod;
    SELECT id INTO cust FROM customers WHERE merchant_id=m_id ORDER BY created_at OFFSET ((i+9) % 30) LIMIT 1;
    subtotal := pprice;
    tax := round(subtotal * 0.18)::bigint;
    total := subtotal + tax;
    INSERT INTO carts (id, merchant_id, customer_id, status, subtotal_cents, tax_cents, total_cents, currency, abandoned_at, created_at)
    VALUES (gen_random_uuid(), m_id, cust, 'abandoned', subtotal, tax, total, 'INR', now() - (i || ' hours')::interval, now() - ((i*3) || ' hours')::interval)
    RETURNING id INTO cart_id;
    INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents)
    VALUES (cart_id, prod, 1, pprice);
  END LOOP;

  -- 2 FAILED PAYMENTS (for failure recovery demo)
  FOR i IN 1..2 LOOP
    prod := pids[((i+10) % array_length(pids,1)) + 1];
    SELECT name, price_cents INTO pname, pprice FROM products WHERE id=prod;
    SELECT id INTO cust FROM customers WHERE merchant_id=m_id ORDER BY created_at OFFSET ((i+20) % 30) LIMIT 1;
    subtotal := pprice; tax := round(subtotal*0.18)::bigint; total := subtotal+tax;
    onum := 'NXG-FAIL-'||lpad(i::text,4,'0');
    INSERT INTO carts (id, merchant_id, customer_id, status, subtotal_cents, tax_cents, total_cents, currency)
    VALUES (gen_random_uuid(), m_id, cust, 'active', subtotal, tax, total, 'INR')
    RETURNING id INTO cart_id;
    INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents) VALUES (cart_id, prod, 1, pprice);
    INSERT INTO orders (id, merchant_id, customer_id, cart_id, order_number, status, subtotal_cents, tax_cents, total_cents, currency, items_count, failure_reason, created_at)
    VALUES (gen_random_uuid(), m_id, cust, cart_id, onum, 'failed', subtotal, tax, total, 'INR', 1, 'Payment declined by bank', now() - (i || ' hours')::interval)
    RETURNING id INTO ord_id;
    INSERT INTO payments (id, merchant_id, order_id, razorpay_order_id, amount_cents, currency, status, method, provider, verified, failure_reason, failure_code, created_at)
    VALUES (gen_random_uuid(), m_id, ord_id, 'order_fail_'||i, total, 'INR', 'failed', 'card', 'razorpay', false, 'Payment declined by bank', 'BAD_REQUEST_ERROR', now() - (i || ' hours')::interval);
  END LOOP;
END $$;
