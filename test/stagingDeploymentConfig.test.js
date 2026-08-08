const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Staging app enables scheduled customer booking for runtime verification", () => {
  const compose = fs.readFileSync(
    path.resolve(__dirname, "..", "compose.staging.yml"),
    "utf8"
  );
  const appService = compose.split(/^  app:\s*$/m)[1]?.split(/^volumes:\s*$/m)[0] || "";

  assert.match(
    appService,
    /^      ENABLE_CUSTOMER_SCHEDULED_BOOKING: "true"$/m,
    "the Staging app container must opt in to scheduled customer booking"
  );
});
