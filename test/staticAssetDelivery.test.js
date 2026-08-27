"use strict";

// Issue 314 - static asset delivery policy.
//
// Two defects this locks down:
//   1. Nothing was compressed. A Customer App cold load shipped ~962 KB of raw
//      text, and because customer-app/sw.js fetches network-first with
//      cache:"no-store", that payload was re-downloaded on every app open.
//   2. express.static ran with no options, so every asset came back
//      `public, max-age=0` even though every asset URL already carries
//      ?v=BUILD_ID and is safe to cache immutably.
//
// The dangerous direction of a caching change is caching TOO much, so most of
// what follows asserts what must NOT be cached: service workers, documents and
// anything without a version marker.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const {
  cacheControlFor,
  isVersionedRequest,
  staticOptions,
  uploadStaticOptions,
  UPLOAD_CACHE_CONTROL,
  createCompressionMiddleware,
  ONE_YEAR_SECONDS,
} = require("../server/middleware/staticAssetDelivery");

const ROOT = path.join(__dirname, "..");
const IMMUTABLE = `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
const versioned = (v = "20260820_issue310_package_minimum_quantity_v1") => ({ query: { v }, url: `/x?v=${v}` });
const bare = { query: {}, url: "/x" };

// ---------------------------------------------------------------------------
// policy
// ---------------------------------------------------------------------------

test("Issue 314: a versioned asset URL may be cached immutably", () => {
  assert.equal(cacheControlFor("/app/modules/store.js", versioned()), IMMUTABLE);
  assert.equal(cacheControlFor("/app/assets/customer-app.css", versioned()), IMMUTABLE);
  assert.equal(cacheControlFor("/assets/icons/cwf-customer-192.png", versioned()), IMMUTABLE);
  assert.equal(ONE_YEAR_SECONDS, 31536000);
});

test("Issue 314: a service worker is NEVER cached, version marker or not", () => {
  // A stale service worker does not make a page slow - it pins the client to an
  // old release with no way out. This is the single most important assertion here.
  for (const req of [bare, versioned()]) {
    assert.equal(cacheControlFor("/sw.js", req), "no-cache");
    assert.equal(cacheControlFor("/customer-app/sw.js", req), "no-cache");
    assert.equal(cacheControlFor("C:\\repo\\customer-app\\sw.js", req), "no-cache");
    assert.equal(cacheControlFor("/service-worker.js", req), "no-cache");
  }
});

test("Issue 314: documents and manifests keep revalidating", () => {
  // The document carries the ?v= references that bust every other asset, so
  // caching it would disable the whole cache-busting scheme.
  for (const req of [bare, versioned()]) {
    assert.equal(cacheControlFor("/customer-app/index.html", req), "no-cache");
    assert.equal(cacheControlFor("/admin-add-v2.html", req), "no-cache");
    assert.equal(cacheControlFor("/customer-app/manifest.webmanifest", req), "no-cache");
    assert.equal(cacheControlFor("/manifest.json", req), "no-cache");
  }
});

test("Issue 314: an unversioned asset is never cached long, because nothing can bust it", () => {
  const short = "public, max-age=300, must-revalidate";
  assert.equal(cacheControlFor("/style.css", bare), short);
  assert.equal(cacheControlFor("/app.js", bare), short);
  assert.equal(cacheControlFor("/logo.png", bare), short);
  // an empty or whitespace ?v= is not a version marker
  assert.equal(cacheControlFor("/style.css", { query: { v: "" }, url: "/style.css?v=" }), short);
  assert.equal(cacheControlFor("/style.css", { query: { v: "   " }, url: "/style.css?v=%20%20" }), short);
});

test("Issue 322: uploads stay private and no-store even when a caller appends a version marker", () => {
  const headers = {};
  const options = uploadStaticOptions();
  options.setHeaders({ setHeader(name, value) { headers[name] = value; }, req: versioned("attacker-value") });
  assert.equal(headers["Cache-Control"], UPLOAD_CACHE_CONTROL);
  assert.equal(UPLOAD_CACHE_CONTROL, "private, no-store");
});

test("Issue 314: version detection survives a missing query parser and array values", () => {
  assert.equal(isVersionedRequest({ url: "/style.css?v=abc123" }), true);
  assert.equal(isVersionedRequest({ url: "/style.css?foo=1&v=abc123" }), true);
  assert.equal(isVersionedRequest({ query: { v: ["abc", "def"] }, url: "/x" }), true);
  assert.equal(isVersionedRequest({ url: "/style.css" }), false);
  assert.equal(isVersionedRequest({ url: "/style.css?version=abc" }), false);
  assert.equal(isVersionedRequest(null), false);
  assert.equal(isVersionedRequest(undefined), false);
});

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

test("Issue 314: index.js mounts compression first and passes the policy to every static mount", () => {
  const source = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");
  assert.match(source, /require\("\.\/server\/middleware\/staticAssetDelivery"\)/);
  // compression must sit ahead of the routes so API JSON is covered too
  const appInit = source.indexOf("const app = express();");
  const compressionAt = source.indexOf("app.use(createCompressionMiddleware());");
  const corsAt = source.indexOf("app.use(cors());");
  assert.ok(compressionAt > appInit && compressionAt < corsAt, "compression must be the first mounted middleware");
  // No static mount may be left on the old default options. Uploaded files use
  // their dedicated privacy policy; application assets use the version policy.
  const staticMounts = source.split("\n").filter((line) => line.includes("express.static(") && !line.trim().startsWith("//"));
  assert.ok(staticMounts.length >= 3, `expected every static mount, found ${staticMounts.length}`);
  const uploadMount = staticMounts.find((line) => line.includes('app.use("/uploads"'));
  assert.match(uploadMount || "", /uploadStaticOptions\(\)/);
  assert.doesNotMatch(uploadMount || "", /, staticOptions\(\)\)/);
  for (const mount of staticMounts.filter((line) => line !== uploadMount)) {
    assert.match(mount, /staticOptions\(\)/, `static mount without the delivery policy: ${mount.trim()}`);
  }
});

test("Issue 314: compression is a real production dependency, not a dev-only one", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.dependencies.compression, "compression must be in dependencies so npm ci --omit=dev still installs it");
  assert.equal(pkg.devDependencies === undefined || !pkg.devDependencies.compression, true);
});

// ---------------------------------------------------------------------------
// end-to-end against the real files
// ---------------------------------------------------------------------------

function withServer(run) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(createCompressionMiddleware());
    app.use(express.static(ROOT, staticOptions()));
    const server = app.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      const get = (p, headers = {}) => new Promise((r) => http.get({ host: "127.0.0.1", port, path: p, headers }, (res) => {
        let bytes = 0;
        res.on("data", (c) => { bytes += c.length; });
        res.on("end", () => r({ status: res.statusCode, bytes, headers: res.headers }));
      }));
      try { resolve(await run(get)); } catch (error) { reject(error); } finally { server.close(); }
    });
  });
}

test("Issue 314: real customer assets are served compressed with the right Cache-Control", async () => {
  await withServer(async (get) => {
    const V = "?v=20260820_issue310_package_minimum_quantity_v1";

    const js = await get(`/customer-app/modules/store.js${V}`, { "Accept-Encoding": "gzip" });
    assert.equal(js.status, 200);
    assert.equal(js.headers["content-encoding"], "gzip");
    assert.equal(js.headers["cache-control"], IMMUTABLE);

    const css = await get(`/customer-app/assets/customer-app.css${V}`, { "Accept-Encoding": "gzip" });
    assert.equal(css.headers["content-encoding"], "gzip");
    assert.equal(css.headers["cache-control"], IMMUTABLE);

    // the two that must stay revalidating
    const sw = await get("/customer-app/sw.js", { "Accept-Encoding": "gzip" });
    assert.equal(sw.headers["cache-control"], "no-cache");
    const html = await get("/customer-app/index.html", { "Accept-Encoding": "gzip" });
    assert.equal(html.headers["cache-control"], "no-cache");

    // a client that cannot decompress still gets a correct, uncompressed response
    const plain = await get(`/customer-app/modules/store.js${V}`);
    assert.equal(plain.status, 200);
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.ok(plain.bytes > js.bytes * 2, "compression must actually shrink the payload");
  });
});

test("Issue 314: the whole Customer App cold load shrinks by more than 60%", async () => {
  await withServer(async (get) => {
    const html = fs.readFileSync(path.join(ROOT, "customer-app/index.html"), "utf8");
    const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1].replace("./", "/customer-app/"));
    const files = [...new Set(["/customer-app/index.html", ...assets])];
    assert.ok(files.length >= 20, `expected the full module list, got ${files.length}`);

    let raw = 0;
    let gzip = 0;
    for (const file of files) {
      raw += (await get(file)).bytes;
      gzip += (await get(file, { "Accept-Encoding": "gzip" })).bytes;
    }
    // Measured at the time of writing: 962 KB -> 265 KB (72% smaller). The
    // threshold is deliberately loose so ordinary content growth does not fail
    // the build, but a regression that disables compression will.
    assert.ok(raw > 500 * 1024, `sanity: cold load should be large, got ${Math.round(raw / 1024)} KB`);
    assert.ok(gzip < raw * 0.4, `compression must cut the cold load by >60%: ${Math.round(raw / 1024)} KB -> ${Math.round(gzip / 1024)} KB`);
  });
});

test("Issue 314: streaming responses can opt out of compression", () => {
  const middleware = createCompressionMiddleware();
  assert.equal(typeof middleware, "function");
  const source = fs.readFileSync(path.join(ROOT, "server/middleware/staticAssetDelivery.js"), "utf8");
  assert.match(source, /x-no-compression/);
  assert.match(source, /text\/event-stream/);
  assert.match(source, /threshold: 1024/);
});
