/*
# RazorFlow AI — Seed NexaGear: Merchant + Gaming/Wireless Headphones
*/
DO $$
DECLARE m_id uuid;
BEGIN
  DELETE FROM merchants WHERE slug = 'nexagear';
  INSERT INTO merchants (id, name, slug, email, phone, description, website, currency, default_tax_rate)
  VALUES ('a1b2c3d4-0000-0000-0000-000000000001','NexaGear','nexagear','founder@nexagear.in','+919876543210',
          'NexaGear sells premium consumer electronics and gaming gear — headsets, keyboards, mice, monitors, webcams, microphones and accessories — engineered for performance and value.',
          'https://nexagear.in','INR',18.00)
  RETURNING id INTO m_id;
  INSERT INTO demo_controls (merchant_id, payment_provider) VALUES (m_id,'auto');

  INSERT INTO products (merchant_id, name, slug, description, category, price_cents, compare_at_price_cents, inventory_count, attributes, rating, rating_count, views_count, add_to_cart_count, purchase_count, abandonment_count, repeat_purchase_count, image_url) VALUES
  (m_id,'NexaGear X200 Gaming Headset','x200-gaming-headset','7.1 surround gaming headset with detachable noise-cancelling mic, memory foam earcups, and RGB lighting. Built for long sessions.','gaming_headphones',499900,599900,84,'{"connectivity":"wired","driver_mm":50,"microphone":"detachable","surround":"7.1","weight_g":320,"rgb":true,"warranty_years":2}',4.5,1280,4200,820,68,210,18,'https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg'),
  (m_id,'NexaGear ProWireless Gaming Headset','prowireless-gaming-headset','2.4GHz wireless gaming headset with 40h battery, low-latency dongle, and dual-mode Bluetooth.','gaming_headphones',899900,999900,52,'{"connectivity":"wireless","battery_hours":40,"driver_mm":50,"microphone":"detachable","surround":"7.1","weight_g":340,"rgb":true}',4.7,640,980,180,32,58,9,'https://images.pexels.com/photos/3394651/pexels-photo-3394651.jpeg'),
  (m_id,'NexaGear LiteGrip Gaming Headset','litegrip-gaming-headset','Budget gaming headset with stereo sound, inline mic, and lightweight build. Great entry-level pick.','gaming_headphones',179900,229900,210,'{"connectivity":"wired","driver_mm":40,"microphone":"inline","surround":"stereo","weight_g":250}',4.1,420,6800,540,95,180,24,'https://images.pexels.com/photos/3394652/pexels-photo-3394652.jpeg'),
  (m_id,'NexaGear EsportsX Pro Headset','esportsx-pro-headset','Tournament-grade esports headset with closed-back design, tuned drivers, and broadcast-quality mic.','gaming_headphones',749900,849900,38,'{"connectivity":"wired","driver_mm":53,"microphone":"broadcast","surround":"7.1","weight_g":360}',4.6,380,1450,220,48,72,7,'https://images.pexels.com/photos/3394653/pexels-photo-3394653.jpeg'),
  (m_id,'NexaGear AirBeats Wireless','airbeats-wireless','Active noise-cancelling wireless headphones with 30h battery, fast charge, and plush earcups.','wireless_headphones',699900,799900,96,'{"connectivity":"bluetooth","battery_hours":30,"anc":true,"driver_mm":40,"weight_g":250}',4.4,890,3200,420,72,140,14,'https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg'),
  (m_id,'NexaGear StudioWave Wireless','studiowave-wireless','Studio-quality wireless headphones with Hi-Res certification and balanced sound signature.','wireless_headphones',549900,629900,64,'{"connectivity":"bluetooth","battery_hours":28,"anc":true,"driver_mm":45,"weight_g":280,"hi_res":true}',4.5,510,2100,280,46,90,8,'https://images.pexels.com/photos/3394651/pexels-photo-3394651.jpeg'),
  (m_id,'NexaGear BassPulse Wireless','basspulse-wireless','Bass-forward wireless headphones with deep punch and customizable EQ via app.','wireless_headphones',399900,479900,130,'{"connectivity":"bluetooth","battery_hours":26,"anc":false,"driver_mm":40,"weight_g":240}',4.2,680,3600,300,40,120,6,'https://images.pexels.com/photos/3394652/pexels-photo-3394652.jpeg'),
  (m_id,'NexaGear GoBuds Wireless','gobuds-wireless','Compact on-ear wireless headphones, foldable, 22h battery, ideal for commute.','wireless_headphones',249900,299900,180,'{"connectivity":"bluetooth","battery_hours":22,"anc":false,"driver_mm":36,"weight_g":180,"foldable":true}',4.0,320,5200,260,38,160,4,'https://images.pexels.com/photos/3394653/pexels-photo-3394653.jpeg');
END $$;
