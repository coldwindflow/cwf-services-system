"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseCloudinaryEnv,
  parseCloudinaryUrl,
  cloudinaryEnabled,
  sanitizeCatalogItemIdForFolder,
  uploadCatalogImage,
  deleteCatalogImage,
} = require("../server/lib/cloudinaryImageUpload");

const SECRET = "s3cr3t-value-should-never-leak";

test("CLOUDINARY_URL is parsed into cloudName/apiKey/apiSecret", () => {
  const parsed = parseCloudinaryUrl(`cloudinary://123456789:${SECRET}@demo-cloud`);
  assert.deepEqual(parsed, { cloudName: "demo-cloud", apiKey: "123456789", apiSecret: SECRET });
});

test("parseCloudinaryEnv prefers CLOUDINARY_URL when present and valid", () => {
  const env = { CLOUDINARY_URL: `cloudinary://key1:${SECRET}@cloud1`, CLOUDINARY_CLOUD_NAME: "ignored" };
  assert.deepEqual(parseCloudinaryEnv(env), { cloudName: "cloud1", apiKey: "key1", apiSecret: SECRET });
});

test("discrete CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET env vars still work", () => {
  const env = { CLOUDINARY_CLOUD_NAME: "cloud2", CLOUDINARY_API_KEY: "key2", CLOUDINARY_API_SECRET: SECRET };
  assert.deepEqual(parseCloudinaryEnv(env), { cloudName: "cloud2", apiKey: "key2", apiSecret: SECRET });
  assert.equal(cloudinaryEnabled(env), true);
});

test("CLOUDINARY_NAME (the legacy technician-photo env var) is accepted as cloudName when CLOUDINARY_CLOUD_NAME is absent", () => {
  const env = { CLOUDINARY_NAME: "legacy-cloud", CLOUDINARY_API_KEY: "key9", CLOUDINARY_API_SECRET: SECRET };
  assert.deepEqual(parseCloudinaryEnv(env), { cloudName: "legacy-cloud", apiKey: "key9", apiSecret: SECRET });
  assert.equal(cloudinaryEnabled(env), true);
});

test("when both CLOUDINARY_CLOUD_NAME and CLOUDINARY_NAME are set, CLOUDINARY_CLOUD_NAME wins", () => {
  const env = {
    CLOUDINARY_CLOUD_NAME: "preferred-cloud",
    CLOUDINARY_NAME: "legacy-cloud",
    CLOUDINARY_API_KEY: "key10",
    CLOUDINARY_API_SECRET: SECRET,
  };
  assert.deepEqual(parseCloudinaryEnv(env), { cloudName: "preferred-cloud", apiKey: "key10", apiSecret: SECRET });
});

test("a valid CLOUDINARY_URL still wins over both CLOUDINARY_CLOUD_NAME and CLOUDINARY_NAME", () => {
  const env = {
    CLOUDINARY_URL: `cloudinary://urlkey:${SECRET}@url-cloud`,
    CLOUDINARY_CLOUD_NAME: "ignored-cloud-name",
    CLOUDINARY_NAME: "ignored-legacy-name",
  };
  assert.deepEqual(parseCloudinaryEnv(env), { cloudName: "url-cloud", apiKey: "urlkey", apiSecret: SECRET });
});

test("CLOUDINARY_NAME fallback never logs the configured secret to the console", () => {
  const env = { CLOUDINARY_NAME: "legacy-cloud", CLOUDINARY_API_KEY: "key11", CLOUDINARY_API_SECRET: SECRET };
  const originalLog = console.log;
  const originalError = console.error;
  const logged = [];
  console.log = (...args) => logged.push(args.join(" "));
  console.error = (...args) => logged.push(args.join(" "));
  try {
    parseCloudinaryEnv(env);
    cloudinaryEnabled(env);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(logged.some((line) => line.includes(SECRET)), false);
});

test("an incomplete CLOUDINARY_URL is rejected and falls back to (incomplete) discrete env, never partially configured", () => {
  const env = { CLOUDINARY_URL: "cloudinary://onlykey@cloud3" };
  const parsed = parseCloudinaryEnv(env);
  assert.equal(cloudinaryEnabled({ ...env, ...parsed }), false);
});

test("an invalid (non-cloudinary://) CLOUDINARY_URL is rejected", () => {
  assert.equal(parseCloudinaryUrl("https://not-cloudinary.example/"), null);
  assert.equal(parseCloudinaryUrl("not a url at all"), null);
});

test("incomplete discrete env vars are rejected by cloudinaryEnabled", () => {
  assert.equal(cloudinaryEnabled({ CLOUDINARY_CLOUD_NAME: "x" }), false);
  assert.equal(cloudinaryEnabled({}), false);
});

test("no CLOUDINARY_URL or discrete env configured: cloudinaryEnabled is false and upload/delete reject without crashing", async () => {
  const env = {};
  assert.equal(cloudinaryEnabled(env), false);
  await assert.rejects(
    uploadCatalogImage({ buffer: Buffer.from([1, 2, 3]), mimetype: "image/jpeg", itemId: "1", env }),
    /CLOUDINARY_NOT_CONFIGURED/
  );
  await assert.rejects(
    deleteCatalogImage("some/public_id", { env }),
    /CLOUDINARY_NOT_CONFIGURED/
  );
});

test("a failed upload's thrown error never contains the configured secret", async () => {
  const env = { CLOUDINARY_CLOUD_NAME: "cloud4", CLOUDINARY_API_KEY: "key4", CLOUDINARY_API_SECRET: SECRET };
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "upload broke" } }),
  });
  try {
    await uploadCatalogImage({ buffer: Buffer.from([1, 2, 3]), mimetype: "image/jpeg", itemId: "7", env, fetchImpl });
    assert.fail("expected uploadCatalogImage to throw");
  } catch (e) {
    assert.doesNotMatch(String(e.message), new RegExp(SECRET));
    assert.doesNotMatch(JSON.stringify(e._cloudinary || {}), new RegExp(SECRET));
  }
});

test("a failed delete's thrown error never contains the configured secret", async () => {
  const env = { CLOUDINARY_CLOUD_NAME: "cloud5", CLOUDINARY_API_KEY: "key5", CLOUDINARY_API_SECRET: SECRET };
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "delete broke" } }),
  });
  try {
    await deleteCatalogImage("some/public_id", { env, fetchImpl });
    assert.fail("expected deleteCatalogImage to throw");
  } catch (e) {
    assert.doesNotMatch(String(e.message), new RegExp(SECRET));
  }
});

test("uploadCatalogImage uses the cwf/catalog/services/{itemId} folder structure and never sends a folder containing path traversal", async () => {
  const env = { CLOUDINARY_CLOUD_NAME: "cloud6", CLOUDINARY_API_KEY: "key6", CLOUDINARY_API_SECRET: SECRET };
  let capturedBody = null;
  const fetchImpl = async (url, opts) => {
    capturedBody = opts.body;
    return { ok: true, status: 200, json: async () => ({ secure_url: "https://res.cloudinary.com/x.jpg", public_id: "cwf/catalog/services/42/img-1" }) };
  };
  await uploadCatalogImage({ buffer: Buffer.from([1, 2, 3]), mimetype: "image/jpeg", itemId: "42", env, fetchImpl });
  const params = new URLSearchParams(capturedBody.toString());
  assert.equal(params.get("folder"), "cwf/catalog/services/42");
});

test("sanitizeCatalogItemIdForFolder accepts only positive integers", () => {
  assert.equal(sanitizeCatalogItemIdForFolder("42"), "42");
  assert.equal(sanitizeCatalogItemIdForFolder(42), "42");
  assert.throws(() => sanitizeCatalogItemIdForFolder("../../etc/passwd"));
  assert.throws(() => sanitizeCatalogItemIdForFolder("0"));
  assert.throws(() => sanitizeCatalogItemIdForFolder("-1"));
  assert.throws(() => sanitizeCatalogItemIdForFolder(""));
  assert.throws(() => sanitizeCatalogItemIdForFolder(undefined));
  assert.throws(() => sanitizeCatalogItemIdForFolder("1; DROP TABLE x"));
});

test("uploadCatalogImage rejects a non-numeric itemId before ever calling fetch", async () => {
  const env = { CLOUDINARY_CLOUD_NAME: "cloud7", CLOUDINARY_API_KEY: "key7", CLOUDINARY_API_SECRET: SECRET };
  let fetchCalled = false;
  const fetchImpl = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(
    uploadCatalogImage({ buffer: Buffer.from([1, 2, 3]), mimetype: "image/jpeg", itemId: "../traversal", env, fetchImpl })
  );
  assert.equal(fetchCalled, false);
});
