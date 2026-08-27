"use strict";

// Issue 320 - the repository root is served to the public.
//
// index.js mounts `express.static(ROOT_DIR)`, so every file tracked at the repo
// root is reachable over HTTP. That makes a stray file a production artifact,
// not just clutter.
//
// This suite found a real one: /bookingScheduled.js was a June copy of the
// customer app shell (HTML) uploaded with a .js extension. Nothing referenced
// it — every import points at customer-app/modules/bookingScheduled.js — yet it
// was publicly served as application/javascript, advertising a stale build id
// (20260621_dual_booking_production_v4) months after that release.
//
// These checks are cheap and catch the whole class before it ships.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

function trackedFiles(pattern) {
  return execFileSync("git", ["ls-files", pattern], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("node_modules/"));
}

test("Issue 320: no tracked .js file actually contains an HTML document", () => {
  const offenders = [];
  for (const file of trackedFiles("*.js")) {
    const head = fs.readFileSync(path.join(ROOT, file), "utf8").slice(0, 200).trimStart().toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `these are served as application/javascript but contain HTML: ${offenders.join(", ")}`);
});

test("Issue 320: every tracked .js file parses", () => {
  // The CI workflow runs the same check; asserting it here means a developer
  // sees the failure before pushing, and the guard survives if CI is ever
  // reconfigured.
  const broken = [];
  for (const file of trackedFiles("*.js")) {
    try {
      execFileSync(process.execPath, ["--check", file], { cwd: ROOT, stdio: "pipe" });
    } catch (error) {
      broken.push(file);
    }
  }
  assert.deepEqual(broken, [], `these do not parse: ${broken.join(", ")}`);
});

// The customer app used to live at the repository root and was moved into
// customer-app/modules/. Nine root copies were left behind by "Add files via
// upload" commits and stayed publicly served, months stale. No page ever loaded
// them — every <script src> resolves to customer-app/modules/.
const RETIRED_ROOT_COPIES = Object.freeze([
  "auth.js", "bookingScheduled.js", "profile.js", "router.js",
  "services.js", "state.js", "tracking.js", "ui.js", "utils.js",
]);

test("Issue 320: the retired root copies of customer-app modules are gone", () => {
  const survivors = RETIRED_ROOT_COPIES.filter((file) => fs.existsSync(path.join(ROOT, file)));
  assert.deepEqual(survivors, [], `these root copies are publicly served stale duplicates: ${survivors.join(", ")}`);
});

test("Issue 320: the real customer-app modules are intact", () => {
  for (const file of RETIRED_ROOT_COPIES) {
    const real = path.join(ROOT, "customer-app", "modules", file);
    assert.equal(fs.existsSync(real), true, `customer-app/modules/${file} must still exist`);
  }
  // spot-check that the live module really is the one carrying current work
  assert.match(fs.readFileSync(path.join(ROOT, "customer-app", "modules", "bookingScheduled.js"), "utf8"),
    /ปักหมุดตำแหน่งบ้าน/, "the real scheduled module must still carry its Thai UI");
});

test("Issue 320: every page loads its scripts from customer-app/modules, never from the root", () => {
  const htmlFiles = trackedFiles("*.html");
  assert.ok(htmlFiles.length > 0);
  const offenders = [];
  for (const page of htmlFiles) {
    const source = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const match of source.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
      const base = page.includes("/") ? page.slice(0, page.lastIndexOf("/")) : "";
      let resolved = match[1].split("?")[0].replace(/^\.\//, "");
      if (resolved.startsWith("/")) resolved = resolved.slice(1);
      else if (base) resolved = `${base}/${resolved}`;
      const name = resolved.split("/").pop();
      if (RETIRED_ROOT_COPIES.includes(name) && !resolved.includes("/")) offenders.push(`${page} -> ${resolved}`);
    }
  }
  assert.deepEqual(offenders, [], `pages must not load a root copy: ${offenders.join(", ")}`);
});

test("Issue 320: nothing requires a retired root copy on the server", () => {
  const offenders = [];
  for (const file of trackedFiles("*.js")) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const name of RETIRED_ROOT_COPIES) {
      const bare = name.replace(/\.js$/, "");
      if (new RegExp(`require\\((['"])\\./(?:${bare}|${name.replace(".", "\\.")})\\1\\)`).test(source)) {
        offenders.push(`${file} requires ./${bare}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join(", "));
});

test("Issue 320: no publicly served root asset advertises a retired build id", () => {
  // A root-served file pinned to an old release means a customer can be handed
  // asset URLs from a build that no longer exists.
  const current = /BUILD_ID = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "customer-app", "sw.js"), "utf8"))?.[1];
  assert.ok(current, "customer-app/sw.js must declare a BUILD_ID");
  const retired = "20260621_dual_booking_production_v4";
  assert.notEqual(current, retired);
  const offenders = trackedFiles("*.js")
    .filter((file) => !file.includes("/"))
    .filter((file) => fs.readFileSync(path.join(ROOT, file), "utf8").includes(retired));
  assert.deepEqual(offenders, [], `root-served files still pinned to the retired build ${retired}: ${offenders.join(", ")}`);
});

test("Issue 320: CI runs the suite on pull requests into every deploy branch", () => {
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "cwf-ci-tests.yml"), "utf8");
  assert.match(workflow, /pull_request:/);
  for (const branch of ["main", "staging/home-server-test", "production/home-server"]) {
    assert.ok(workflow.includes(`      - ${branch}`), `CI must gate pull requests into ${branch}`);
  }
  assert.match(workflow, /run: npm ci --no-audit --no-fund/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /fetch-depth: 0/, "the diff gate needs both compared commits");
  assert.match(workflow, /git diff --check \"\$PR_BASE_SHA\.\.\.\$PR_HEAD_SHA\"/,
    "pull requests must check only head changes since the merge-base, including promotion PRs");
  assert.doesNotMatch(workflow, /git diff --check \"\$PR_BASE_SHA\" \"\$PR_HEAD_SHA\"/,
    "a two-dot PR diff incorrectly includes base-only branch changes");
  assert.match(workflow, /git diff --check \"\$PUSH_BEFORE_SHA\" \"\$PUSH_HEAD_SHA\"/);
  assert.doesNotMatch(workflow, /git diff --check[^\n]*(?:\|\|\s*true|;\s*true)/,
    "the whitespace/conflict-marker gate must fail the workflow, never swallow errors");
  // read-only: a test workflow must never be able to write to the repository
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|packages: write/);
  // and it must never reach a deploy target or a real database. Checked against
  // executable lines only, so the explanatory comments can still say "deploy".
  const executable = workflow.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(executable, /self-hosted/i, "CI must run on a GitHub-hosted runner, never a deploy box");
  assert.doesNotMatch(executable, /DATABASE_URL|PGPASSWORD|PGHOST/i, "CI must never be handed database credentials");
  assert.doesNotMatch(executable, /\bssh\b|scp |rsync /i, "CI must not reach any remote host");
  assert.doesNotMatch(executable, /secrets\./, "CI must not consume repository secrets");
});
