-- Optional minimum total machine quantity per Store service-package parent.
--
-- NULL means "no additional minimum" and is the value every existing row keeps,
-- so this migration cannot change the behaviour of any promotion already on sale.
-- A configured value is an integer from 2 through the existing public maximum 99
-- (see MAX_COMPOSITE_PACKAGE_QUANTITY); 1 is rejected because "minimum 1" is the
-- same as no minimum and would only be a confusing way to spell NULL.
--
-- The minimum is a parent-level rule. It is enforced against the SUM of
-- service_package_groups[].quantity across every BTU variant selected under the
-- same parent, never per variant, so a mixed 1+1 selection satisfies minimum 2.
--
-- Additive/expand-only: one nullable column plus one CHECK constraint. No data
-- is written, no existing column or constraint is altered or dropped, and there
-- is no transaction control or PL/pgSQL block, so the file stays inside the
-- deploy controller's expand-only lane exactly like 20260809.
--
-- Re-run behaviour matches 20260809: ADD COLUMN is guarded by IF NOT EXISTS, and
-- the ADD CONSTRAINT is applied once by the guarded runner/deploy controller. A
-- second application errors loudly on the constraint rather than silently
-- diverging, which is the intended fail-closed behaviour for a schema gate.

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS service_package_minimum_total_quantity INTEGER;

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_service_package_minimum_total_quantity_check
  CHECK (
    service_package_minimum_total_quantity IS NULL
    OR (service_package_minimum_total_quantity >= 2
        AND service_package_minimum_total_quantity <= 99)
  );
