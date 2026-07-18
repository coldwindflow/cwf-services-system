"use strict";

// Temporary compatibility boundary for existing public booking/catalog callers.
// Shared availability calculation lives only in booking/availabilityEngine.
module.exports = require("../booking/availabilityEngine");
