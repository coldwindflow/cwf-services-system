# Server Services

Future home for pure service modules extracted from route handlers.

Services should not depend on the Express app instance. Pass dependencies explicitly, especially `pool`, date helpers, money helpers, and feature flags.

Do not create new service logic by copying behavior unless the old duplicate code is removed in the same tested patch.

