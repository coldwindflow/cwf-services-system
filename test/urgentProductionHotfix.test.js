const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function section(source, start, end) {
  const i = source.indexOf(start);
  assert.notEqual(i, -1, `missing start marker: ${start}`);
  const j = source.indexOf(end, i + start.length);
  assert.notEqual(j, -1, `missing end marker: ${end}`);
  return source.slice(i, j);
}

test("customer urgent zero-target commits job/items into admin review without changing Admin Add contract", () => {
  const index = read("index.js");
  const handler = section(index, "async function handleAdminBookV2", "function getBangkokTodayYMD");

  assert.match(handler, /createdBySource === "customer"/);
  assert.match(handler, /req\.cwfBookSource === "customer"/);
  assert.match(handler, /COUNT\(o\.offer_id\)::int AS offers_count/);
  assert.match(handler, /duplicatePayload[\s\S]*offers_count: Number\(dupRow\.offers_count \|\| 0\)/);

  const noTargets = section(handler, "if (!available.length)", "for (const u of available)");
  assert.match(noTargets, /createdBySource === "customer" && bm === "urgent" && mode === "offer"/);
  assert.match(noTargets, /SET job_status='ไม่พบช่างรับงาน'/);
  assert.match(noTargets, /dispatch_mode='offer'/);
  assert.match(noTargets, /throw err;/, "Admin Add zero-target path must still throw NO_URGENT_OFFER_TARGETS");

  const response = section(handler, "return res.json({", "} catch (e)");
  assert.match(response, /offers_count: urgentPushTargets\.length/);
  assert.match(response, /phase: "admin_review"/);
  assert.match(response, /admin_review: true/);
});

test("public urgent route remains adapter-only and public urgent status is read-only", () => {
  const index = read("index.js");
  const publicAdapter = section(index, "function handlePublicCustomerUrgentBook", "app.post(\"/public/book\"");
  assert.match(publicAdapter, /req\.cwfBookSource = "customer"/);
  assert.match(publicAdapter, /booking_mode: "urgent"/);
  assert.match(publicAdapter, /dispatch_mode: "offer"/);
  assert.match(publicAdapter, /return handleAdminBookV2\(req, res\)/);

  const statusRoute = section(index, "app.get(\"/public/urgent-status\"", "app.get(\"/public/track\"");
  assert.doesNotMatch(statusRoute, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
  assert.match(statusRoute, /phase[\s\S]*"admin_review"/);
  assert.match(statusRoute, /Cache-Control", "no-store/);
});

test("urgent finalizer is canonical, locked, periodic, and not driven by public status", () => {
  const index = read("index.js");
  const finalizer = read("server/services/urgent/finalizer.js");

  assert.match(index, /urgentFinalizer\.autoFinalizeUrgentJobs\(pool\)/);
  assert.match(finalizer, /pg_try_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(finalizer, /UPDATE public\.job_offers[\s\S]*status='expired'[\s\S]*expires_at < NOW\(\)/);
  assert.match(finalizer, /NOT EXISTS \([\s\S]*accepted_offer[\s\S]*status='accepted'/);
  assert.match(finalizer, /NOT EXISTS \([\s\S]*live_offer[\s\S]*status='pending'[\s\S]*expires_at >= NOW\(\)/);
  assert.match(finalizer, /NOT EXISTS \([\s\S]*job_offer_time_proposals[\s\S]*status='pending'/);
  assert.match(finalizer, /COALESCE\(j\.job_status,''\) <> \$2/);
  assert.match(finalizer, /LOWER\(COALESCE\(j\.job_status,''\)\) NOT IN \('cancel','canceled','cancelled','done','completed','closed','paid'\)/);

  assert.match(index, /let urgentFinalizerRunnerInFlight = false/);
  assert.match(index, /setInterval\(\(\) => \{[\s\S]*runUrgentFinalizerOnce\('interval'\)[\s\S]*\}, 45000\)/);
  assert.match(index, /urgentFinalizerRunnerTimer\.unref/);
  assert.match(index, /startUrgentFinalizerRunner\(\)/);
});

test("technician offer reads and actions are bound to session identity", () => {
  const index = read("index.js");
  const app = read("app.js");

  assert.match(index, /app\.get\("\/offers\/tech\/me", requireTechnicianSession/);
  assert.match(index, /app\.get\("\/offers\/tech\/:username", requireTechnicianSession/);
  assert.match(index, /const username = _authUsername\(req\)/);
  assert.match(index, /assertRequestedTechnicianMatchesSession\(req\.params\?\.username, username\)/);
  assert.match(index, /loadPendingOffersForSessionTechnician\(username\)/);
  assert.match(index, /o\.technician_username = ANY\(\$1::text\[\]\)/);
  assert.match(index, /assertOfferOwnedBySessionTechnician\(username, offer\.technician_username\)/);

  assert.match(app, /\/offers\/tech\/me/);
  assert.doesNotMatch(app, /offers\/tech\/\$\{username\}/);
  assert.doesNotMatch(app, /JSON\.stringify\(\{ username[,}]/);
});
