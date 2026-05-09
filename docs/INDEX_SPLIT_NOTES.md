# Index Split Notes

`index.js` is still the production entrypoint for Express setup, middleware, routes, startup checks, and schema ensure logic. The split is intentionally gradual so bug fixes do not require moving unrelated routes or changing public contracts.

## Module Boundaries

- `server/normalizers.js`: pure string/key normalization shared by pricing, technician income, and lookup. This is the home for canonical wash labels, wash keys, service/ac type normalization, BTU buckets, and phone digit normalization.
- `server/pricing.js`: customer-facing standard price and duration helpers, plus standard service line item creation from payloads.
- `server/technicianIncome.js`: pure technician income classification helpers such as job/ac/wash keys, BTU tier parsing, canonical wash labels, service grouping keys, and partner single-rate bracket selection.
- `server/customerLookup.js`: phone candidate construction and old-customer lookup with injected `db`/`pool` dependency.

## Canonical Wash Label

New stored and displayed wash variant data must use only:

`ล้างแขวนคอยล์`

The old typo:

`ล้างแขวนคอยน์`

is accepted only as legacy input compatibility and must be normalized before pricing, item creation, income grouping, or promotion matching. Do not let both spellings become active system standards.

## Warning

Do not add new pricing, technician income, wash normalization, or customer lookup logic directly into `index.js`. Add it to the relevant module and keep `index.js` as a compatibility wrapper or route caller.
