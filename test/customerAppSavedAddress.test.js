const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const REPO_ROOT = path.resolve(__dirname, "..");

function readModule(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function makeBrowserContext({ fetchImpl, location } = {}) {
  const storage = new Map();
  const window = {
    CWFCustomerAppV2: {},
    location: {
      protocol: "https:",
      origin: "https://app.example.test",
      pathname: "/customer-app/",
      search: "",
      hash: "",
      ...(location || {}),
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    confirm() { return true; },
  };
  const context = {
    window,
    fetch: fetchImpl || (async () => ({ ok: true, text: async () => "{}" })),
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function loadCustomerModules(context, modules) {
  for (const modulePath of modules) {
    vm.runInContext(readModule(modulePath), context, { filename: modulePath });
  }
  return context.window.CWFCustomerAppV2;
}

test("Customer App API saves profile address with PATCH /public/profile/address", async () => {
  const calls = [];
  const context = makeBrowserContext({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        text: async () => JSON.stringify({
          ok: true,
          profile: { address: "Saved home", maps_url: "https://maps.example/saved" },
        }),
      };
    },
  });
  const root = loadCustomerModules(context, ["customer-app/modules/api.js"]);

  const result = await root.api.updateProfileAddress({
    address: "  Saved home  ",
    maps_url: "  https://maps.example/saved  ",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://app.example.test/public/profile/address");
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    address: "Saved home",
    maps_url: "https://maps.example/saved",
  });
  assert.equal(result.profile.address, "Saved home");
  assert.equal(result.profile.maps_url, "https://maps.example/saved");
});

function loadState() {
  const context = makeBrowserContext();
  const root = loadCustomerModules(context, ["customer-app/modules/state.js"]);
  return { context, root };
}

function setLoggedInProfile(root, profile = {}) {
  root.state.customer = {
    logged_in: true,
    user: { name: "Logged In Customer", provider: "google" },
    profile,
  };
  root.state.guestMode = false;
}

test("saved address prefill fills scheduled and urgent drafts only when fields are empty", () => {
  const { root } = loadState();
  setLoggedInProfile(root, {
    address: "Saved Condo 12A",
    maps_url: "https://maps.example/condo",
  });

  assert.equal(root.state.prefillSavedAddress("scheduled"), true);
  assert.equal(root.state.draft.scheduled.address_text, "Saved Condo 12A");
  assert.equal(root.state.draft.scheduled.maps_url, "https://maps.example/condo");

  assert.equal(root.state.prefillSavedAddress("urgent"), true);
  assert.equal(root.state.draft.urgent.address_text, "Saved Condo 12A");
  assert.equal(root.state.draft.urgent.maps_url, "https://maps.example/condo");
  assert.equal(root.state.addressPrefill.scopes.scheduled, true);
  assert.equal(root.state.addressPrefill.scopes.urgent, true);
});

test("saved address prefill never overwrites typed booking addresses", () => {
  const { root } = loadState();
  setLoggedInProfile(root, {
    address: "Saved Condo 12A",
    maps_url: "https://maps.example/condo",
  });

  root.state.updateDraft("scheduled", {
    address_text: "Typed scheduled address",
    maps_url: "https://maps.example/typed-scheduled",
  });
  root.state.updateDraft("urgent", {
    address_text: "Typed urgent address",
    maps_url: "https://maps.example/typed-urgent",
  });

  assert.equal(root.state.prefillSavedAddress("scheduled"), false);
  assert.equal(root.state.prefillSavedAddress("urgent"), false);
  assert.equal(root.state.draft.scheduled.address_text, "Typed scheduled address");
  assert.equal(root.state.draft.scheduled.maps_url, "https://maps.example/typed-scheduled");
  assert.equal(root.state.draft.urgent.address_text, "Typed urgent address");
  assert.equal(root.state.draft.urgent.maps_url, "https://maps.example/typed-urgent");
});

test("saved address prefill preserves a typed address while filling an empty maps field", () => {
  const { root } = loadState();
  setLoggedInProfile(root, {
    address: "Saved address must not replace typing",
    maps_url: "https://maps.example/saved-map",
  });
  root.state.updateDraft("scheduled", {
    address_text: "Typed one-time address",
    maps_url: "",
  });

  assert.equal(root.state.prefillSavedAddress("scheduled"), true);
  assert.equal(root.state.draft.scheduled.address_text, "Typed one-time address");
  assert.equal(root.state.draft.scheduled.maps_url, "https://maps.example/saved-map");
});

test("saved address prefill can load mocked profile state before filling a booking draft", async () => {
  const { root } = loadState();
  let onDoneCount = 0;
  root.api = {
    async getCurrentCustomer() {
      return {
        logged_in: true,
        user: { name: "Mock Customer", provider: "line" },
        profile: {
          address: "Loaded saved address",
          maps_url: "https://maps.example/loaded",
        },
      };
    },
  };

  const changed = await root.state.ensureSavedAddressPrefill("urgent", () => {
    onDoneCount += 1;
  });

  assert.equal(changed, true);
  assert.equal(onDoneCount, 1);
  assert.equal(root.state.guestMode, false);
  assert.equal(root.state.draft.urgent.address_text, "Loaded saved address");
  assert.equal(root.state.draft.urgent.maps_url, "https://maps.example/loaded");
});

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
    this.disabled = false;
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async click() {
    const listener = this.listeners.get("click");
    if (listener) await listener({ preventDefault() {} });
  }
}

class FakeForm extends FakeElement {
  constructor() {
    super();
    this.elements = {
      address: { value: "" },
      maps_url: { value: "" },
    };
  }

  async submit() {
    const listener = this.listeners.get("submit");
    if (listener) await listener({ preventDefault() {} });
  }
}

class FakeMount extends FakeElement {
  constructor(container) {
    super();
    this.container = container;
    this._innerHTML = "";
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.container.refreshProfileControls();
  }
}

class FakeContainer {
  constructor(root) {
    this.root = root;
    this.mount = new FakeMount(this);
    this.latestEdit = null;
    this.latestCancel = null;
    this.latestForm = null;
    this._innerHTML = "";
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.refreshProfileControls();
  }

  get combinedHtml() {
    return `${this._innerHTML}\n${this.mount.innerHTML}`;
  }

  refreshProfileControls() {
    const html = this.combinedHtml;
    if (html.includes("data-profile-address-edit")) {
      this.latestEdit = new FakeElement();
    }
    if (html.includes("data-profile-address-cancel")) {
      this.latestCancel = new FakeElement();
    }
    if (html.includes("data-profile-address-form")) {
      const form = new FakeForm();
      const profile = this.root.state.customer.profile || {};
      form.elements.address.value = profile.address || "";
      form.elements.maps_url.value = profile.maps_url || "";
      this.latestForm = form;
    }
  }

  querySelector(selector) {
    if (selector === "[data-profile-address]") return this.mount;
    if (selector === "[data-profile-address-edit]") return this.combinedHtml.includes("data-profile-address-edit") ? this.latestEdit : null;
    if (selector === "[data-profile-address-cancel]") return this.combinedHtml.includes("data-profile-address-cancel") ? this.latestCancel : null;
    if (selector === "[data-profile-address-form]") return this.combinedHtml.includes("data-profile-address-form") ? this.latestForm : null;
    return null;
  }
}

test("profile saved-address submit updates local profile state immediately after PATCH", async () => {
  const context = makeBrowserContext();
  const root = loadCustomerModules(context, [
    "customer-app/modules/utils.js",
    "customer-app/modules/state.js",
    "customer-app/modules/profile.js",
  ]);
  setLoggedInProfile(root, {
    address: "Old saved address",
    maps_url: "https://maps.app.goo.gl/old",
  });
  root.state.authStatus = "success";
  const apiCalls = [];
  root.api = {
    async updateProfileAddress(payload) {
      apiCalls.push(payload);
      return {
        ok: true,
        profile: {
          address: payload.address,
          maps_url: payload.maps_url,
        },
      };
    },
  };
  root.auth = {
    displayName() { return "Logged In Customer"; },
    renderLoginPanel() { return ""; },
    async loadCustomer() { return root.state.customer; },
  };
  root.ui = {
    supportButtons() { return ""; },
  };

  const container = new FakeContainer(root);
  root.profile.render(container);
  await container.latestEdit.click();
  container.latestForm.elements.address.value = "New saved address";
  container.latestForm.elements.maps_url.value = "https://maps.app.goo.gl/new";
  await container.latestForm.submit();

  assert.equal(apiCalls.length, 1);
  assert.equal(apiCalls[0].address, "New saved address");
  assert.equal(apiCalls[0].maps_url, "https://maps.app.goo.gl/new");
  assert.equal(root.state.customer.profile.address, "New saved address");
  assert.equal(root.state.customer.profile.maps_url, "https://maps.app.goo.gl/new");
  assert.equal(root.state.profileAddressForm.editing, false);
  assert.equal(root.state.profileAddressForm.status, "success");
});
