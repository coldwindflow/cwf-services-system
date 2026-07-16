(function (factory) {
  "use strict";

  const registry = factory();
  if (typeof module === "object" && module.exports) module.exports = registry;
  if (typeof window !== "undefined") window.CWFIconRegistry = registry;
})(function () {
  "use strict";

  const MAX_NAV_LABEL_LENGTH = 18;
  const LIBRARY_PATHS = Object.freeze({
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
    store: '<path d="M3 9l1.2-5h15.6L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 21v-6h6v6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M9 15l2 2 4-4"/>',
    pin: '<path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/>',
    phone: '<path d="M4 5c0-1 1-2 2-2h2l2 5-2 1.5a11 11 0 0 0 5 5L17 12l5 2v2c0 1-1 2-2 2A16 16 0 0 1 4 5z"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    tag: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    sparkle: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"/>',
    star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
    wrench: '<path d="M21 4a5 5 0 0 1-6.5 6.5L6 19l-3-3 8.5-8.5A5 5 0 0 1 18 1l-3 3 2 2 3-3z"/>',
    play: '<path d="M8 5l11 7-11 7V5z" fill="currentColor" stroke="none"/>',
    facebook: '<path d="M14 22v-8h3l1-4h-4V8c0-1.1.6-2 2-2h2V2h-3c-3 0-5 2-5 5v3H7v4h3v8h4z" fill="currentColor" stroke="none"/>',
    line: '<rect x="1" y="1" width="22" height="22" rx="6.5" fill="#06C755" stroke="none"/><path d="M12 5.4c-4.2 0-7.6 2.72-7.6 6.07 0 3 2.7 5.51 6.35 5.99.25.05.58.16.66.37.07.19.05.48.02.66 0 0-.09.53-.11.65-.03.19-.15.75.66.41.81-.34 4.35-2.56 5.94-4.39.98-1.08 1.68-2.32 1.68-3.69 0-3.35-3.4-6.07-7.6-6.07z" fill="#fff" stroke="none"/><text x="12" y="12.4" fill="#06C755" font-family="Arial,Helvetica,sans-serif" font-size="4.1" font-weight="700" text-anchor="middle" dominant-baseline="middle" stroke="none">LINE</text>',
  });

  const NAVIGATION = Object.freeze({
    home: Object.freeze({ route: "home", label: "หน้าแรก", icon: "home" }),
    store: Object.freeze({ route: "store", label: "ร้านค้า", icon: "store" }),
    booking: Object.freeze({ route: "booking", label: "จองบริการ", short_label: "จอง", icon: "calendar" }),
    tracking: Object.freeze({ route: "tracking", label: "ติดตามงาน", short_label: "ติดตาม", icon: "pin" }),
    profile: Object.freeze({ route: "profile", label: "บัญชี", icon: "user" }),
  });

  const SLOT_DEFINITIONS = Object.freeze([
    { key: "quick.1", category: "quick", label: "เมนูด่วน 1", defaultIcon: "sparkle" },
    { key: "quick.2", category: "quick", label: "เมนูด่วน 2", defaultIcon: "wrench" },
    { key: "quick.3", category: "quick", label: "เมนูด่วน 3", defaultIcon: "pin" },
    { key: "quick.4", category: "quick", label: "เมนูด่วน 4", defaultIcon: "line" },
    { key: "page.home.header", category: "page", label: "หัวหน้าหน้าแรก", defaultIcon: "home" },
    { key: "page.store.header", category: "page", label: "หัวหน้าร้านค้า", defaultIcon: "store" },
    { key: "page.booking.header", category: "page", label: "หัวหน้าจองบริการ", defaultIcon: "calendar" },
    { key: "page.tracking.header", category: "page", label: "หัวหน้าติดตามงาน", defaultIcon: "pin" },
    { key: "page.profile.header", category: "page", label: "หัวหน้าบัญชี", defaultIcon: "user" },
    { key: "profile.address", category: "profile", label: "ที่อยู่บริการ", defaultIcon: "pin" },
    { key: "profile.history", category: "profile", label: "ประวัติงาน", defaultIcon: "history" },
    { key: "action.call", category: "action", label: "โทรศัพท์", defaultIcon: "phone" },
    { key: "action.line", category: "action", label: "LINE", defaultIcon: "line" },
    { key: "action.map", category: "action", label: "แผนที่", defaultIcon: "map" },
    { key: "action.review", category: "action", label: "รีวิว", defaultIcon: "star" },
  ].map(Object.freeze));

  const SLOT_MAP = Object.freeze(SLOT_DEFINITIONS.reduce((out, slot) => {
    out[slot.key] = slot;
    return out;
  }, {}));

  function cleanString(value, maxLength) {
    const cleaned = String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return Array.from(cleaned).slice(0, maxLength).join("");
  }

  function normalizeLabel(value, fallback) {
    return cleanString(value, MAX_NAV_LABEL_LENGTH) || fallback;
  }

  function isLibraryIcon(value) {
    return Object.prototype.hasOwnProperty.call(LIBRARY_PATHS, String(value || ""));
  }

  function isSafeMediaPublicId(value) {
    const id = cleanString(value, 300);
    return /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(id) && !id.includes("..");
  }

  function isSafePublicImageUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:"
        && url.hostname === "res.cloudinary.com"
        && /\/image\/upload\//.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function libraryIcon(value, fallback) {
    const name = cleanString(value, 40);
    return isLibraryIcon(name) ? name : fallback;
  }

  function normalizeStoredIcon(input, fallback) {
    const icon = input && typeof input === "object" ? input : { type: "library", value: input };
    if (icon.type === "image" && isSafeMediaPublicId(icon.value)) {
      return {
        type: "image",
        value: cleanString(icon.value, 300),
        ...(isSafePublicImageUrl(icon.url) ? { url: String(icon.url) } : {}),
      };
    }
    return { type: "library", value: libraryIcon(icon.value, fallback) };
  }

  function normalizePublicIcon(input, fallback) {
    const icon = input && typeof input === "object" ? input : { type: "library", value: input };
    const publicUrl = isSafePublicImageUrl(icon.url) ? icon.url : icon.value;
    if (icon.type === "image" && isSafePublicImageUrl(publicUrl)) {
      return { type: "image", value: String(publicUrl) };
    }
    return { type: "library", value: libraryIcon(icon.value, fallback) };
  }

  function defaultNavigation() {
    return Object.keys(NAVIGATION).reduce((out, key) => {
      const item = NAVIGATION[key];
      out[key] = { label: item.label, icon: { type: "library", value: item.icon } };
      return out;
    }, {});
  }

  function defaultOverrides() {
    return SLOT_DEFINITIONS.reduce((out, slot) => {
      out[slot.key] = { type: "library", value: slot.defaultIcon };
      return out;
    }, {});
  }

  function normalizeNavigation(input, mode) {
    const source = input && typeof input === "object" ? input : {};
    return Object.keys(NAVIGATION).reduce((out, key) => {
      const defaults = NAVIGATION[key];
      const item = source[key] && typeof source[key] === "object" ? source[key] : {};
      out[key] = {
        label: normalizeLabel(item.label, defaults.label),
        icon: mode === "public"
          ? normalizePublicIcon(item.icon, defaults.icon)
          : normalizeStoredIcon(item.icon, defaults.icon),
      };
      return out;
    }, {});
  }

  function normalizeOverrides(input, mode) {
    const source = input && typeof input === "object" ? input : {};
    return SLOT_DEFINITIONS.reduce((out, slot) => {
      out[slot.key] = mode === "public"
        ? normalizePublicIcon(source[slot.key], slot.defaultIcon)
        : normalizeStoredIcon(source[slot.key], slot.defaultIcon);
      return out;
    }, {});
  }

  function normalizeConfig(input, mode) {
    const source = input && typeof input === "object" ? input : {};
    return {
      navigation: normalizeNavigation(source.navigation, mode),
      icon_overrides: normalizeOverrides(source.icon_overrides, mode),
    };
  }

  function defaultIconForSlot(slotKey) {
    if (String(slotKey).startsWith("nav.")) {
      const nav = NAVIGATION[String(slotKey).slice(4)];
      return nav ? nav.icon : "sparkle";
    }
    return SLOT_MAP[slotKey]?.defaultIcon || "sparkle";
  }

  function resolveSlot(config, slotKey) {
    const fallback = defaultIconForSlot(slotKey);
    const source = config && typeof config === "object" ? config : {};
    if (String(slotKey).startsWith("nav.")) {
      const key = String(slotKey).slice(4);
      return normalizePublicIcon(source.navigation?.[key]?.icon, fallback);
    }
    return normalizePublicIcon(source.icon_overrides?.[slotKey], fallback);
  }

  function navigationItem(config, key) {
    const defaults = NAVIGATION[key] || NAVIGATION.home;
    const source = config?.navigation?.[key] || {};
    return {
      route: defaults.route,
      label: normalizeLabel(source.label, defaults.label),
      icon: resolveSlot(config, "nav." + key),
    };
  }

  function iconSvg(name, size) {
    const safeName = libraryIcon(name, "sparkle");
    const safeSize = Math.max(12, Math.min(64, Number(size) || 24));
    return '<span class="cwf-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="' + safeSize
      + '" height="' + safeSize
      + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + LIBRARY_PATHS[safeName] + "</svg></span>";
  }

  return Object.freeze({
    MAX_NAV_LABEL_LENGTH,
    LIBRARY_PATHS,
    LIBRARY_NAMES: Object.freeze(Object.keys(LIBRARY_PATHS)),
    NAVIGATION,
    SLOT_DEFINITIONS,
    SLOT_MAP,
    cleanString,
    normalizeLabel,
    isLibraryIcon,
    isSafeMediaPublicId,
    isSafePublicImageUrl,
    normalizeStoredIcon,
    normalizePublicIcon,
    normalizeNavigation,
    normalizeOverrides,
    normalizeConfig,
    defaultNavigation,
    defaultOverrides,
    defaultIconForSlot,
    resolveSlot,
    navigationItem,
    iconSvg,
  });
});
