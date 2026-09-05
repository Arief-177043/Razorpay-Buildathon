/*
# RazorFlow AI — Seed Product Relationships + Customers

Patterns the AI agent will discover:
- X200 headset ↔ CaseC12: strong co-purchase (cross-sell, 38 co-purchases)
- MechPro K1 ↔ WristRest Pro: frequently bought together (24)
- PowerBank ↔ CablePro: pairing (11)
- VisionPro 27 ↔ Hub7: compatible (14)
30 customers across vip/regular/new segments.
*/
DO $$
DECLARE
  m_id uuid := 'a1b2c3d4-0000-0000-0000-000000000001';
  p_x200 uuid; p_casec12 uuid; p_litegrip uuid; p_powerbank uuid; p_cablepro uuid;
  p_mechk1 uuid; p_wristrest uuid; p_ghostmice uuid; p_deskmat uuid; p_hub7 uuid;
  p_airbeats uuid; p_voicepro uuid; p_clearview4k uuid; p_visionpro27 uuid;
  i int;
BEGIN
  SELECT id INTO p_x200 FROM products WHERE merchant_id=m_id AND slug='x200-gaming-headset';
  SELECT id INTO p_casec12 FROM products WHERE merchant_id=m_id AND slug='casec12-headset-case';
  SELECT id INTO p_litegrip FROM products WHERE merchant_id=m_id AND slug='litegrip-gaming-headset';
  SELECT id INTO p_powerbank FROM products WHERE merchant_id=m_id AND slug='powerbank-20k';
  SELECT id INTO p_cablepro FROM products WHERE merchant_id=m_id AND slug='cablepro-braided-usb-c';
  SELECT id INTO p_mechk1 FROM products WHERE merchant_id=m_id AND slug='mechpro-k1-keyboard';
  SELECT id INTO p_wristrest FROM products WHERE merchant_id=m_id AND slug='wristrest-pro';
  SELECT id INTO p_ghostmice FROM products WHERE merchant_id=m_id AND slug='ghostmice-pro';
  SELECT id INTO p_deskmat FROM products WHERE merchant_id=m_id AND slug='deskmat-xl';
  SELECT id INTO p_hub7 FROM products WHERE merchant_id=m_id AND slug='hub7-usb-c-7in1';
  SELECT id INTO p_airbeats FROM products WHERE merchant_id=m_id AND slug='airbeats-wireless';
  SELECT id INTO p_voicepro FROM products WHERE merchant_id=m_id AND slug='voicepro-usb-mic';
  SELECT id INTO p_clearview4k FROM products WHERE merchant_id=m_id AND slug='clearview-4k-webcam';
  SELECT id INTO p_visionpro27 FROM products WHERE merchant_id=m_id AND slug='visionpro-27-165hz';

  INSERT INTO product_relationships (merchant_id, source_product_id, target_product_id, relationship_type, co_purchase_count, confidence, evidence) VALUES
  (m_id, p_x200, p_casec12, 'frequently_bought_together', 38, 0.62, '38 of 68 X200 purchasers also bought CaseC12 in the same order'),
  (m_id, p_x200, p_ghostmice, 'compatible', 18, 0.41, 'Gaming peripheral pairing — headset + mouse combo'),
  (m_id, p_mechk1, p_wristrest, 'frequently_bought_together', 24, 0.58, '24 of 58 K1 purchasers also bought WristRest Pro'),
  (m_id, p_mechk1, p_deskmat, 'frequently_bought_together', 16, 0.39, 'Keyboard + desk mat pairing'),
  (m_id, p_visionpro27, p_hub7, 'compatible', 14, 0.44, 'Monitor often paired with USB-C hub for laptop users'),
  (m_id, p_voicepro, p_clearview4k, 'complementary', 12, 0.38, 'Mic + webcam pairing for creator setups'),
  (m_id, p_airbeats, p_casec12, 'compatible', 9, 0.33, 'Wireless headphones fit in CaseC12'),
  (m_id, p_powerbank, p_cablepro, 'frequently_bought_together', 11, 0.35, 'Power bank + USB-C cable pairing'),
  (m_id, p_x200, p_deskmat, 'compatible', 8, 0.31, 'Gaming setup pairing'),
  (m_id, p_ghostmice, p_deskmat, 'frequently_bought_together', 13, 0.37, 'Mouse + desk mat pairing')
  ON CONFLICT DO NOTHING;

  FOR i IN 1..8 LOOP
    INSERT INTO customers (merchant_id, name, email, phone, segment, total_orders, total_spent_cents, lifetime_value_cents, last_order_at, created_at)
    VALUES (m_id, 'VIP Customer '||i, 'vip'||i||'@email.com', '+9198'||lpad(i::text,8,'0'),
      'vip', (i+3), ((i+3)*650000), ((i+3)*650000),
      now() - (i || ' days')::interval, now() - ((i+60) || ' days')::interval)
    ON CONFLICT (merchant_id, email) DO NOTHING;
  END LOOP;
  FOR i IN 1..12 LOOP
    INSERT INTO customers (merchant_id, name, email, phone, segment, total_orders, total_spent_cents, lifetime_value_cents, last_order_at, created_at)
    VALUES (m_id, 'Regular Customer '||i, 'reg'||i||'@email.com', '+9197'||lpad(i::text,8,'0'),
      'regular', (i%3)+1, (((i%3)+1)*420000), (((i%3)+1)*420000),
      now() - ((i+10) || ' days')::interval, now() - ((i+90) || ' days')::interval)
    ON CONFLICT (merchant_id, email) DO NOTHING;
  END LOOP;
  FOR i IN 1..10 LOOP
    INSERT INTO customers (merchant_id, name, email, phone, segment, total_orders, total_spent_cents, lifetime_value_cents, last_order_at, created_at)
    VALUES (m_id, 'New Customer '||i, 'new'||i||'@email.com', '+9196'||lpad(i::text,8,'0'),
      'new', 1, 380000, 380000, now() - (i || ' days')::interval, now() - ((i+5) || ' days')::interval)
    ON CONFLICT (merchant_id, email) DO NOTHING;
  END LOOP;
END $$;
