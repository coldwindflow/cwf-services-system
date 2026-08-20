-- PRE-DATA ROLLBACK ONLY. Never run once any promotion has a configured
-- minimum, because dropping the column silently turns every configured
-- minimum back into "no minimum" and lets under-quantity bookings through.
--
-- Safe to run only while every catalog_items row still has
-- service_package_minimum_total_quantity IS NULL. Verify first:
--   SELECT COUNT(*) FROM public.catalog_items
--    WHERE service_package_minimum_total_quantity IS NOT NULL;

ALTER TABLE public.catalog_items
  DROP CONSTRAINT IF EXISTS catalog_items_service_package_minimum_total_quantity_check;
ALTER TABLE public.catalog_items
  DROP COLUMN IF EXISTS service_package_minimum_total_quantity;
