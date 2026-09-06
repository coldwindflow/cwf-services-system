"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const seed = fs.readFileSync("migrations/20260906_air_reset_60_book_now_seed.sql", "utf8");

test("AIR RESET seed persists canonical Thai booking taxonomy", () => {
  assert.match(seed, /'ล้าง', 'ผนัง'/);
  assert.match(seed, /'ล้างธรรมดา'/);
  assert.match(seed, /'ล้างพรีเมียม'/);
  assert.doesNotMatch(seed, /job_type='wash'|ac_type='wall'|wash_variant='normal'|wash_variant='premium'/);
});

test("AIR RESET slot duration never undercuts the existing one-machine timing policy", () => {
  assert.match(seed, /'air-reset-60-standard-small'[\s\S]*'ล้างธรรมดา'[\s\S]*12000::integer,60,0/);
  assert.match(seed, /'air-reset-60-standard-large'[\s\S]*'ล้างธรรมดา'[\s\S]*NULL::integer,60,1/);
  assert.match(seed, /'air-reset-60-premium-small'[\s\S]*'ล้างพรีเมียม'[\s\S]*12000::integer,80,0/);
  assert.match(seed, /'air-reset-60-premium-large'[\s\S]*'ล้างพรีเมียม'[\s\S]*NULL::integer,80,1/);
});
