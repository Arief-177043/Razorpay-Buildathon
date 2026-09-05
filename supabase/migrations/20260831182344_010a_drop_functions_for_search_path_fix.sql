-- Drop all functions that need search_path fix so we can recreate them
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.get_merchant_metrics(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_product_metrics(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_recommendations_for_product(uuid, int) CASCADE;
DROP FUNCTION IF EXISTS public.discover_growth_opportunities(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_abandoned_carts(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_customer_segments(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_order_total(uuid, bigint, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.generate_run_code() CASCADE;
DROP FUNCTION IF EXISTS public.generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS public.decrement_inventory(uuid, int) CASCADE;
