-- Allow booking_mode = 'purchase' on catalog_items (buy flow).
--
-- The original marketplace migration added a CHECK constraint limiting
-- booking_mode to ('bookable','contact_admin'). The buy flow introduced a third
-- mode, 'purchase', for physical products — without this the INSERT/UPDATE of a
-- product item fails the constraint. This only WIDENS the allowed set, so every
-- existing row (all bookable/contact_admin) stays valid; nothing is deleted or
-- altered destructively. Idempotent: the constraint is dropped-if-exists then
-- recreated with the full set.

ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_booking_mode_check;

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_booking_mode_check
  CHECK (booking_mode IN ('bookable', 'contact_admin', 'purchase'));
