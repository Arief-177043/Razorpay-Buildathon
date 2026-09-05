-- Revoke all public access to decrement_inventory (only service role should call it)
REVOKE EXECUTE ON FUNCTION public.decrement_inventory(uuid, int) FROM PUBLIC;
