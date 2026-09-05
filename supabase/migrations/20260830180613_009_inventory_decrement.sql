/*
# RazorFlow AI — Inventory decrement function

Used by the payment verification flow (edge function) to atomically decrement
product inventory after a successful payment. Prevents overselling.
*/
CREATE OR REPLACE FUNCTION decrement_inventory(p_product_id uuid, p_qty int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  new_count int;
  success boolean;
BEGIN
  UPDATE products SET inventory_count = GREATEST(inventory_count - p_qty, 0)
    WHERE id = p_product_id
    RETURNING inventory_count INTO new_count;
  success := FOUND;
  RETURN jsonb_build_object('success', success, 'product_id', p_product_id, 'new_inventory_count', new_count);
END; $$;
