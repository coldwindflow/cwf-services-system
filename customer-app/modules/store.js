(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  let filterState = { search: "", category: "", acType: "", washVariant: "", btu: "", queueToday: false, sort: "recommended" };
  // Advanced filters (everything except the always-visible search box) collapse
  // into a togglable panel so the store list is not buried under filter rows.
  let filtersOpen = false;
  let detailLoadSeq = 0;
  let reviewsRequestSeq = 0;
  let eligibilityRequestSeq = 0;
  let reviewSubmitSeq = 0;

  console.info("[customer-store] payment-security 20260705 loaded");

  const FILTER_AC_TYPES = [
    { value: "wall", label: "แอร์ผนัง" },
    { value: "fourway", label: "แอร์สี่ทิศทาง" },
    { value: "hanging", label: "แอร์แขวน" },
    { value: "ceiling", label: "แอร์เปลือยใต้ฝ้า" },
  ];
  const FILTER_WASH_VARIANTS = [
    { value: "normal", label: "ล้างปกติ" },
    { value: "premium", label: "ล้างพรีเมียม" },
    { value: "coil", label: "แขวนคอยล์" },
    { value: "overhaul", label: "ตัดล้างใหญ่" },
  ];
  const FILTER_BTU_OPTIONS = [9000, 12000, 18000, 24000, 30000];
  const SORT_OPTIONS = [
    { value: "recommended", label: "แนะนำโดย CWF" },
    { value: "booking_count", label: "จองมากที่สุด" },
    { value: "price_low", label: "ราคา: ต่ำไปสูง" },
    { value: "price_high", label: "ราคา: สูงไปต่ำ" },
  ];

  function categoriesFromItems(items) {
    const set = new Set();
    items.forEach((item) => {
      const cat = String(item.item_category || "").trim();
      if (cat) set.add(cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }

  function effectiveSalePrice(item) {
    const display = Number(item.display_price);
    if (Number.isFinite(display) && display > 0) return display;
    const base = Number(item.base_price);
    if (Number.isFinite(base) && base > 0) return base;
    return null;
  }

  function priceIsAsk(item) {
    return effectiveSalePrice(item) === null;
  }

  function priceLabel(item) {
    const sale = effectiveSalePrice(item);
    if (sale === null) return "สอบถามราคา";
    return root.utils.formatBaht(sale);
  }

  function hasPromo(item) {
    if (!item.has_active_promotion) return false;
    const normal = Number(item.normal_price);
    const sale = Number(item.active_price);
    return Number.isFinite(normal) && Number.isFinite(sale) && sale < normal;
  }

  // The legacy catalog table constrains item_category to "service"/"product"
  // in storage; that generic token carries no useful information for the
  // customer, so it is hidden entirely rather than shown as a translated tag.
  function categoryLabel(cat) {
    const trimmed = String(cat || "").trim();
    if (trimmed.toLowerCase() === "service") return "";
    if (trimmed.toLowerCase() === "product") return "";
    return trimmed;
  }

  function isBookable(item) {
    return item.booking_mode === "bookable";
  }

  // Physical product the customer can buy (e.g. an AC unit) — gets a "ซื้อ"
  // button that opens the purchase sheet (quantity + delivery/install options).
  function isPurchase(item) {
    return item.booking_mode === "purchase";
  }

  function btuRangeLabel(item) {
    const min = Number(item.btu_min);
    const max = Number(item.btu_max);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;
    if (hasMin && hasMax && min !== max) return `${min.toLocaleString("th-TH")}–${max.toLocaleString("th-TH")} BTU`;
    if (hasMin && hasMax) return `${min.toLocaleString("th-TH")} BTU`;
    if (hasMin) return `ตั้งแต่ ${min.toLocaleString("th-TH")} BTU`;
    if (hasMax) return `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`;
    return "";
  }

  // Shopee/Lazada-style variant-option wording ("18,000 BTU ขึ้นไป"), distinct
  // from btuRangeLabel()'s wording used elsewhere on the card/detail page.
  function variantBtuLabel(item) {
    const min = Number(item.btu_min);
    const max = Number(item.btu_max);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = Number.isFinite(max) && max > 0;
    if (hasMin && hasMax && min !== max) return `${min.toLocaleString("th-TH")}–${max.toLocaleString("th-TH")} BTU`;
    if (hasMin && hasMax) return `${min.toLocaleString("th-TH")} BTU`;
    if (hasMin) return `${min.toLocaleString("th-TH")} BTU ขึ้นไป`;
    if (hasMax) return `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`;
    return "ไม่ระบุ BTU";
  }

  // ---------- Canonical product-family resolver ----------
  // Raw catalog rows are not guaranteed to use one consistent token for the
  // same real-world concept (e.g. ac_type might say "ผนัง" or "wall", a free-
  // text job_category might say "ล้างแอร์" or "wash"). Grouping logic must
  // never compare those raw strings directly -- it must resolve them to one
  // of a small, fixed set of canonical tokens first. Resolution order always
  // prefers the most authoritative, already-constrained field first
  // (booking_ac_type / booking_wash_variant, validated server-side against a
  // fixed enum -- see ALLOWED_BOOKING_AC_TYPES/ALLOWED_BOOKING_WASH_VARIANTS
  // in server/routes/catalog/items.js) before falling back to the free-text
  // display field, and only as a last resort to a deterministic keyword match
  // against the item name. Returns null when nothing recognizable is found --
  // never a guessed/fuzzy cross-category match.
  function normalizeForMatch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function canonicalAcType(item) {
    const candidates = [item.booking_ac_type, item.ac_type, item.item_name];
    for (const raw of candidates) {
      const norm = normalizeForMatch(raw);
      if (!norm) continue;
      if (/ผนัง|wall/.test(norm)) return "wall";
      if (/สี่ทิศทาง|four.?way|cassette/.test(norm)) return "fourway";
      if (/แขวน(?!คอยล์)|hanging/.test(norm)) return "hanging";
      if (/เปลือย|ใต้ฝ้า|ceiling/.test(norm)) return "ceiling";
    }
    return null;
  }

  function canonicalJobCategory(item) {
    const candidates = [item.job_category, item.item_category, item.item_name];
    for (const raw of candidates) {
      const norm = normalizeForMatch(raw);
      if (!norm) continue;
      if (/ล้าง|wash|clean/.test(norm)) return "wash";
      if (/ซ่อม|repair/.test(norm)) return "repair";
      if (/ติดตั้ง|install/.test(norm)) return "install";
      if (/ตรวจเช็ค|ตรวจสอบ|inspect/.test(norm)) return "inspection";
    }
    return null;
  }

  // booking_wash_variant is the authoritative, server-validated field (see
  // ALLOWED_BOOKING_WASH_VARIANTS); older catalog rows predating that field
  // often have it null/missing entirely but still encode the real wash
  // method in their item_name (e.g. "ล้างแอร์ผนัง ล้างปกติ"), so item_name is
  // checked as the last-resort deterministic fallback -- never fuzzy, and
  // only ever returns one of the 4 fixed canonical wash-method tokens.
  function canonicalWashVariant(item) {
    const candidates = [item.booking_wash_variant, item.item_name];
    for (const raw of candidates) {
      const norm = normalizeForMatch(raw);
      if (!norm) continue;
      if (/ตัดล้าง|overhaul|ใหญ่/.test(norm)) return "overhaul";
      if (/แขวนคอยล์|coil/.test(norm)) return "coil";
      if (/พรีเมียม|premium/.test(norm)) return "premium";
      if (/ปกติ|ธรรมดา|normal/.test(norm)) return "normal";
    }
    return null;
  }

  // Only canonical wall + wash items are split into 4 distinct wash-method
  // variant groups (ล้างปกติ/ล้างพรีเมียม/แขวนคอยล์/ตัดล้างใหญ่). Other AC
  // types/job categories never need a wash-method axis at all, so an
  // unresolved wash variant there is not an error -- both sides of a BTU
  // comparison simply share the same (empty) wash-variant token.
  function requiresWashVariant(item) {
    return canonicalAcType(item) === "wall" && canonicalJobCategory(item) === "wash";
  }

  // Best real BTU figure available for an item, preferring the bookable
  // booking_btu (a single supported value), then the display btu_min/btu_max
  // range. Returns null when no real BTU figure exists at all.
  function itemBtuValue(item) {
    const btu = Number(item.booking_btu);
    if (Number.isFinite(btu) && btu > 0) return btu;
    const min = Number(item.btu_min);
    if (Number.isFinite(min) && min > 0) return min;
    const max = Number(item.btu_max);
    if (Number.isFinite(max) && max > 0) return max;
    return null;
  }

  // "Family" = same canonical job category + canonical AC type, spanning
  // different wash methods (ล้างปกติ/ล้างพรีเมียม/แขวนคอยล์/ตัดล้างใหญ่) --
  // used for related-products. "Variant group" = family + the specific
  // canonical wash method, spanning different BTU bands of that one method --
  // used for the BTU/spec selector. Returns null when the item's job category
  // or AC type cannot be resolved at all, so unrelated/unrecognized items
  // never get fuzzily grouped together.
  function familyKey(item) {
    const job = canonicalJobCategory(item);
    const ac = canonicalAcType(item);
    if (!job || !ac) return null;
    return `${job}|${ac}`;
  }

  function variantGroupKey(item) {
    const fam = familyKey(item);
    if (!fam) return null;
    const wash = canonicalWashVariant(item);
    // A wall-wash item whose wash method cannot be resolved at all must never
    // be grouped under the shared empty-token bucket -- that would silently
    // merge it with siblings of a real, different wash method instead of
    // standing alone (it always stands alone until its method is known).
    if (!wash && requiresWashVariant(item)) return null;
    return `${fam}|${wash || ""}`;
  }

  // Siblings sharing this item's exact variant group (same canonical job
  // category + AC type + wash method, differing only by BTU/price/item_id).
  // Bookable items whose AC type doesn't require a wash method (e.g.
  // สี่ทิศทาง/แขวน/เปลือยใต้ฝ้า) still group correctly since both sides of the
  // comparison share the same (empty) wash-variant token. Only meaningful for
  // bookable items with a resolvable canonical group; otherwise there is
  // nothing real to group, so the item is its own only "sibling".
  function variantSiblings(item, allItems) {
    if (!item || item.booking_mode !== "bookable") return [item];
    const key = variantGroupKey(item);
    if (!key) return [item];
    const list = (allItems || []).filter((it) => it.booking_mode === "bookable" && variantGroupKey(it) === key);
    if (!list.some((it) => String(it.item_id) === String(item.item_id))) list.push(item);
    return list.slice().sort((a, b) => {
      const aBtu = itemBtuValue(a) || 0;
      const bBtu = itemBtuValue(b) || 0;
      return aBtu - bBtu;
    });
  }

  // Selecting a BTU/spec sibling navigates to that item's own detail route
  // (see the [data-store-variant-option] handler below). This makes the
  // current `item` the single source of truth for the *entire* detail page --
  // gallery, badges, name, rating, descriptions, related products, reviews --
  // never a partial "display item" computed separately from what was loaded.

  // Picks the one item to represent a wash-method group in the related
  // slider: prefer the candidate whose real BTU is closest to the item
  // currently being viewed (so the slider naturally suggests a comparable
  // size), and among customer-visible/active candidates first. Falls back to
  // the first candidate at all when nothing carries a real BTU value or an
  // is_active/is_customer_visible flag -- never fabricates a choice.
  function pickRepresentative(candidates, currentBtu) {
    const visible = candidates.filter((it) => it.is_active !== false && it.is_customer_visible !== false);
    const pool = visible.length ? visible : candidates;
    if (currentBtu != null) {
      let best = null;
      let bestDiff = Infinity;
      for (const it of pool) {
        const btu = itemBtuValue(it);
        if (btu == null) continue;
        const diff = Math.abs(btu - currentBtu);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = it;
        }
      }
      if (best) return best;
    }
    return pool[0] || candidates[0];
  }

  // Up to 4 same-family items, one representative per distinct canonical wash
  // method (BTU siblings within one method are never repeated -- those are
  // shown in the BTU selector instead). Includes the item currently being
  // viewed as the first card (marked is_current) so all real wash-method
  // variants in the family are visible, not just the other three. Real
  // catalog data only -- never a fabricated/placeholder card.
  function relatedFamilyItems(item, allItems) {
    const fam = familyKey(item);
    if (!fam) return [];
    const currentBtu = itemBtuValue(item);
    const currentVariant = canonicalWashVariant(item) || "";
    const groups = new Map();
    for (const it of allItems || []) {
      if (String(it.item_id) === String(item.item_id)) continue;
      if (familyKey(it) !== fam) continue;
      const wv = canonicalWashVariant(it);
      // An item whose wash method can't be resolved at all (wall-wash with no
      // matching field or item-name keyword) never counts as a representative
      // "method" card -- we don't actually know which of the 4 methods it is.
      if (!wv && requiresWashVariant(it)) continue;
      const key = wv || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const others = [];
    for (const [wv, candidates] of groups) {
      if (wv === currentVariant) continue;
      const rep = pickRepresentative(candidates, currentBtu);
      if (rep) others.push(rep);
      if (others.length >= 3) break;
    }
    if (!others.length) return [];
    return [{ ...item, is_current: true }, ...others];
  }

  function track(eventName, fields) {
    if (root.analytics && typeof root.analytics.track === "function") {
      root.analytics.track(eventName, fields);
    }
  }

  function trackFilter(filterName, filterValue) {
    track("cwf_store_filter", { filter_name: filterName, filter_value: filterValue });
  }

  function trackItemEvent(eventName, item, extra) {
    if (!item) return;
    track(eventName, Object.assign({
      item_id: item.item_id,
      category: canonicalJobCategory(item) || undefined,
      ac_type: canonicalAcType(item) || undefined,
      btu: itemBtuValue(item) || undefined,
      price: effectiveSalePrice(item) ?? undefined,
    }, extra || {}));
  }

  function applyFilters(items) {
    const search = filterState.search.trim().toLowerCase();
    const category = filterState.category;
    const filtered = (items || []).filter((item) => {
      if (category && String(item.item_category || "") !== category) return false;
      if (search && !String(item.item_name || "").toLowerCase().includes(search)) return false;
      if (filterState.acType && canonicalAcType(item) !== filterState.acType) return false;
      if (filterState.washVariant && canonicalWashVariant(item) !== filterState.washVariant) return false;
      if (filterState.btu && itemBtuValue(item) !== Number(filterState.btu)) return false;
      if (filterState.queueToday && item.has_queue_today !== true) return false;
      return true;
    });
    return sortItems(filtered);
  }

  function sortItems(items) {
    const list = items.slice();
    if (filterState.sort === "booking_count") {
      list.sort((a, b) => Number(b.booking_count || 0) - Number(a.booking_count || 0));
    } else if (filterState.sort === "price_low" || filterState.sort === "price_high") {
      const dir = filterState.sort === "price_low" ? 1 : -1;
      list.sort((a, b) => {
        const aPrice = effectiveSalePrice(a);
        const bPrice = effectiveSalePrice(b);
        if (aPrice === null && bPrice === null) return 0;
        if (aPrice === null) return 1;
        if (bPrice === null) return -1;
        return (aPrice - bPrice) * dir;
      });
    }
    // "recommended" keeps the server-provided order (already prioritized by
    // is_featured/priority) -- no client resort needed.
    return list;
  }

  function itemGalleryImages(item) {
    if (Array.isArray(item.images) && item.images.length) return item.images;
    if (item.image_url) return [{ image_id: null, image_url: item.image_url, alt_text: null }];
    return [];
  }

  function renderGallerySlides(images, name, slideClass) {
    const altText = root.utils.escapeHtml(name);
    return images.map((img) => `
      <img class="${slideClass}" src="${root.utils.escapeHtml(img.image_url)}" alt="${root.utils.escapeHtml(img.alt_text || name)}" loading="lazy" onerror="this.style.visibility='hidden';">
    `).join("");
  }

  function renderFeaturedRibbon(item) {
    if (!item.is_featured) return "";
    return `<span class="store-featured-ribbon">CWF แนะนำ</span>`;
  }

  function renderHotBadge(item) {
    if (!item.is_hot) return "";
    return `<span class="store-hot-badge" aria-label="สินค้า HOT">HOT</span>`;
  }

  function salePercentOff(item) {
    const normal = Number(item.normal_price);
    const sale = Number(item.active_price);
    if (!Number.isFinite(normal) || normal <= 0 || !Number.isFinite(sale) || sale >= normal) return null;
    const pct = Math.round(((normal - sale) / normal) * 100);
    return pct > 0 ? pct : null;
  }

  function renderSaleBadge(item) {
    if (!hasPromo(item)) return "";
    const pct = salePercentOff(item);
    const text = pct ? `SALE -${pct}%` : "SALE";
    return `<span class="store-sale-badge" aria-label="ลดราคา">${root.utils.escapeHtml(text)}</span>`;
  }

  function promoEndDateLabel(item) {
    if (!item.effective_to) return "";
    const dt = new Date(item.effective_to);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("th-TH", { dateStyle: "medium" });
  }

  // Only ever rendered when hasPromo(item) is true (a real, currently-active
  // promotion rule) -- campaign_name/savings/end date all come straight from
  // the priced promotion rule, never a guessed/static label.
  function renderPromoInfo(item) {
    if (!hasPromo(item)) return "";
    const name = String(item.campaign_name || item.price_label || "").trim();
    const normal = Number(item.normal_price);
    const sale = Number(item.active_price);
    const savings = Number.isFinite(normal) && Number.isFinite(sale) && sale < normal ? normal - sale : null;
    const endLabel = promoEndDateLabel(item);
    const parts = [];
    if (name) parts.push(`<span class="store-promo-name">${root.utils.escapeHtml(name)}</span>`);
    if (savings) parts.push(`<span class="store-promo-savings">ประหยัด ${root.utils.escapeHtml(root.utils.formatBaht(savings))}</span>`);
    if (endLabel) parts.push(`<span class="store-promo-end">หมดเขต ${root.utils.escapeHtml(endLabel)}</span>`);
    if (!parts.length) return "";
    return `<div class="store-promo-info">${parts.join("")}</div>`;
  }

  // Real review aggregates only. item.rating_average/review_count come straight
  // from the backend's catalog_item_reviews aggregation (approved reviews only —
  // see attachCatalogRatings() in server/routes/catalog/items.js). There is no
  // fallback/legacy rating field read here: until a real approved review exists,
  // this must render an honest "no reviews yet" state (empty stars, count 0) —
  // never a fabricated full-star score.
  function realRatingInfo(item) {
    const avg = Number(item && item.rating_average);
    const count = Number(item && item.review_count);
    if (Number.isFinite(avg) && avg >= 1 && avg <= 5 && Number.isFinite(count) && count > 0) {
      return { value: avg, count, hasReviews: true };
    }
    return { value: 0, count: 0, hasReviews: false };
  }

  function formatRatingAverage(value) {
    const rounded = Math.round(value * 10) / 10;
    return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  }

  // No approved reviews yet: render an honest empty state — five outline
  // (unfilled) stars plus a "ยังไม่มีรีวิว" label, never a fabricated full-star
  // score or average. Once a real approved review exists, this switches to the
  // real average/count below.
  function renderRatingBadge(item) {
    const { value, count, hasReviews } = realRatingInfo(item);
    const full = hasReviews ? Math.floor(value) : 0;
    const hasHalf = hasReviews && full < 5 && value - full >= 0.5;
    const stars = Array.from({ length: 5 }, (_, i) => {
      const filled = i < full;
      const half = i === full && hasHalf;
      const cls = filled ? " is-filled" : half ? " is-half" : "";
      return `<span class="store-rating-star${cls}" aria-hidden="true">${filled || half ? "★" : "☆"}</span>`;
    }).join("");
    const id = String(item.item_id || "");
    const valueLabel = hasReviews ? `<span class="store-rating-value">${formatRatingAverage(value)}</span>` : "";
    const countLabel = hasReviews
      ? `<span class="store-rating-count">(${count})</span>`
      : `<span class="store-rating-empty">ยังไม่มีรีวิว</span>`;
    const title = hasReviews ? "ดูรีวิวจากลูกค้า" : "ยังไม่มีรีวิว — เป็นคนแรกที่รีวิว";
    return `
      <button type="button" class="store-rating-badge" data-store-rating="${root.utils.escapeHtml(id)}" title="${title}">
        <span class="store-rating-label">รีวิว</span>
        <span class="store-rating-stars">${stars}</span>
        ${valueLabel}${countLabel}
      </button>
    `;
  }

  // item.booking_count comes straight from the backend's real
  // COUNT(DISTINCT job_id) aggregation (attachBookingCounts() in
  // server/routes/catalog/items.js) — never hardcoded, never client-computed.
  function renderBookingCountLabel(item) {
    const count = Number(item && item.booking_count);
    if (!Number.isFinite(count) || count <= 0) return "";
    return `<div class="store-booking-count">จองแล้ว ${count.toLocaleString("th-TH")} งาน</div>`;
  }

  function renderCardGallery(item, name) {
    const images = itemGalleryImages(item);
    if (!images.length) {
      return `
        <div class="store-card-gallery">
          ${renderHotBadge(item)}
          ${renderFeaturedRibbon(item)}
          <div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div>
          ${renderSaleBadge(item)}
        </div>
      `;
    }
    const autoplay = images.length > 1 && item.is_autoplay_enabled === true;
    const dots = images.length > 1
      ? `<div class="store-card-dots" data-store-dots>${images.map((_, i) => `<span class="store-card-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`
      : "";
    return `
      <div class="store-card-gallery"${autoplay ? ' data-store-autoplay="1"' : ""}>
        ${renderHotBadge(item)}
        ${renderFeaturedRibbon(item)}
        <div class="store-card-slides" data-store-slides>${renderGallerySlides(images, name, "store-card-slide")}</div>
        ${renderSaleBadge(item)}
        ${dots}
      </div>
    `;
  }

  // "มีคิววันนี้" only ever reflects item.has_queue_today, a real
  // technician-eligibility check computed server-side (attachTodayQueueAvailability
  // in server/routes/catalog/items.js) -- never guessed/hardcoded true for all
  // items. Items without a queue today keep the existing "จองได้" wording.
  function renderBadges(item) {
    const badges = [];
    if (isBookable(item)) {
      if (item.has_queue_today === true) badges.push(`<span class="store-badge store-badge-queue-today">มีคิววันนี้</span>`);
      else badges.push(`<span class="store-badge store-badge-bookable">จองได้</span>`);
    } else if (isPurchase(item)) {
      badges.push(`<span class="store-badge store-badge-buy">สินค้าพร้อมส่ง</span>`);
    } else badges.push(`<span class="store-badge store-badge-contact">ติดต่อแอดมิน</span>`);
    return badges.length ? `<div class="store-card-badges">${badges.join("")}</div>` : "";
  }

  function renderCard(item) {
    const id = String(item.item_id || "");
    const name = item.item_name || "-";
    const category = categoryLabel(item.item_category);
    const unit = item.unit_label || "";
    const btu = btuRangeLabel(item);
    const meta = [item.job_category, item.ac_type, btu].filter(Boolean);
    const promo = hasPromo(item);
    const bookable = isBookable(item);
    return `
      <article class="store-card" data-store-item="${root.utils.escapeHtml(id)}" tabindex="0" role="button" aria-label="ดูรายละเอียด ${root.utils.escapeHtml(name)}">
        ${renderCardGallery(item, name)}
        ${renderBadges(item)}
        <div class="store-card-head">
          ${category ? `<span class="tag">${root.utils.escapeHtml(category)}</span>` : ""}
          <strong>${root.utils.escapeHtml(name)}</strong>
          ${meta.length ? `<div class="store-card-meta">${meta.map((m) => `<span>${root.utils.escapeHtml(m)}</span>`).join("")}</div>` : ""}
        </div>
        ${renderRatingBadge(item)}
        ${renderBookingCountLabel(item)}
        <div class="store-card-price">
          <span class="price-text${priceIsAsk(item) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(item))}</span>
          ${promo ? `<span class="price-strike">${root.utils.escapeHtml(root.utils.formatBaht(item.normal_price))}</span>` : ""}
          ${unit && !priceIsAsk(item) ? `<span class="muted price-unit">/ ${root.utils.escapeHtml(unit)}</span>` : ""}
        </div>
        ${renderPromoInfo(item)}
        <div class="store-card-actions">
          ${bookable
            ? `<button class="primary-btn" type="button" data-store-book="${root.utils.escapeHtml(id)}">จองคิว</button>`
            : isPurchase(item)
              ? `<button class="primary-btn" type="button" data-store-buy="${root.utils.escapeHtml(id)}">ซื้อ</button>`
              : `<button class="secondary-btn" type="button" data-store-contact="${root.utils.escapeHtml(id)}" data-store-contact-name="${root.utils.escapeHtml(name)}">สอบถามแอดมิน</button>`}
        </div>
      </article>
    `;
  }

  function renderGrid(items) {
    const filtered = applyFilters(items);
    if (!filtered.length) return root.utils.stateBox("", "ไม่พบรายการที่ตรงกับการค้นหา");
    return `<div class="store-grid" data-store-grid>${filtered.map(renderCard).join("")}</div>`;
  }

  // How many advanced filters are currently narrowing the list (search box is
  // excluded — it stays visible). Drives the badge on the collapsed toggle so
  // customers can tell filters are active without expanding the panel.
  function activeFilterCount() {
    let n = 0;
    if (filterState.category) n += 1;
    if (filterState.acType) n += 1;
    if (filterState.washVariant) n += 1;
    if (filterState.btu) n += 1;
    if (filterState.queueToday) n += 1;
    if (filterState.sort && filterState.sort !== "recommended") n += 1;
    return n;
  }

  function refreshFilterCount(container) {
    const badge = container.querySelector("[data-store-filter-count]");
    if (!badge) return;
    const n = activeFilterCount();
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }

  function renderBody() {
    const bucket = root.state.catalog || { status: "idle", items: [], error: "" };
    if (bucket.status === "idle" || bucket.status === "loading") {
      return `<div class="content-skeleton" aria-label="กำลังโหลดรายการ"><span></span><span></span></div>`;
    }
    if (bucket.status === "error") {
      return `
        ${root.utils.stateBox("error", bucket.error || "โหลดข้อมูลไม่สำเร็จ")}
        <button class="secondary-btn" type="button" data-store-retry>ลองใหม่</button>
      `;
    }
    const items = bucket.items || [];
    if (!items.length) {
      return root.utils.stateBox("", "ยังไม่มีรายการที่เปิดให้ลูกค้าดูในขณะนี้ กรุณาติดต่อแอดมินเพื่อสอบถามบริการ");
    }
    const categories = categoriesFromItems(items);
    const activeCount = activeFilterCount();
    return `
      <div class="store-filters">
        <div class="store-filter-head">
          <input type="search" class="store-search-input" data-store-search placeholder="ค้นหาชื่อสินค้า/บริการ" aria-label="ค้นหาสินค้า" value="${root.utils.escapeHtml(filterState.search)}">
          <button type="button" class="store-filter-toggle${filtersOpen ? " is-open" : ""}" data-store-filter-toggle aria-expanded="${filtersOpen ? "true" : "false"}" aria-controls="store-filter-panel">
            <span class="store-filter-toggle-icon" aria-hidden="true"></span>
            <span>ตัวกรอง</span>
            <span class="store-filter-count" data-store-filter-count${activeCount ? "" : " hidden"}>${activeCount}</span>
            <span class="store-filter-caret" aria-hidden="true"></span>
          </button>
        </div>
        <div class="store-filter-panel" id="store-filter-panel" data-store-filter-panel${filtersOpen ? "" : " hidden"}>
          <select class="store-category-select" data-store-category aria-label="หมวดหมู่">
            <option value="">ทั้งหมด</option>
            ${categories.map((cat) => `<option value="${root.utils.escapeHtml(cat)}"${filterState.category === cat ? " selected" : ""}>${root.utils.escapeHtml(cat)}</option>`).join("")}
          </select>
          <select class="store-actype-select" data-store-actype aria-label="ชนิดแอร์">
            <option value="">ชนิดแอร์ทั้งหมด</option>
            ${FILTER_AC_TYPES.map((opt) => `<option value="${opt.value}"${filterState.acType === opt.value ? " selected" : ""}>${root.utils.escapeHtml(opt.label)}</option>`).join("")}
          </select>
          <select class="store-wash-select" data-store-wash aria-label="วิธีล้าง">
            <option value="">วิธีล้างทั้งหมด</option>
            ${FILTER_WASH_VARIANTS.map((opt) => `<option value="${opt.value}"${filterState.washVariant === opt.value ? " selected" : ""}>${root.utils.escapeHtml(opt.label)}</option>`).join("")}
          </select>
          <select class="store-btu-select" data-store-btu aria-label="ขนาด BTU">
            <option value="">BTU ทั้งหมด</option>
            ${FILTER_BTU_OPTIONS.map((btu) => `<option value="${btu}"${String(filterState.btu) === String(btu) ? " selected" : ""}>${btu.toLocaleString("th-TH")} BTU</option>`).join("")}
          </select>
          <label class="store-queue-today-chip">
            <input type="checkbox" data-store-queue-today${filterState.queueToday ? " checked" : ""}>
            <span>มีคิววันนี้</span>
          </label>
          <select class="store-sort-select" data-store-sort aria-label="เรียงตาม">
            ${SORT_OPTIONS.map((opt) => `<option value="${opt.value}"${filterState.sort === opt.value ? " selected" : ""}>${root.utils.escapeHtml(opt.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div data-store-grid-mount>${renderGrid(items)}</div>
    `;
  }

  const AUTOPLAY_INTERVAL_MS = 3500;
  const AUTOPLAY_RESUME_DELAY_MS = 5000;
  const AUTOPLAY_JITTER_MS = 1200;

  function prefersReducedMotion() {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_error) {
      return false;
    }
  }

  // Returns a cleanup function, or null if autoplay could not be attached
  // (reduced-motion preference, or the slides element lacks scrollTo support
  // in this environment).
  function attachAutoplay(slides, dots) {
    if (prefersReducedMotion() || typeof slides.scrollTo !== "function") return null;
    const count = dots.length;
    if (count < 2) return null;
    let timer = null;
    let paused = false;
    let visible = false;
    let resumeTimer = null;

    function stop() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    // Uses a setTimeout chain (not setInterval) so a random jitter can be
    // applied to the very first tick only; this keeps multiple visible
    // cards from advancing in visual lock-step while still settling into
    // the configured interval after the first transition.
    function start() {
      if (timer || paused || !visible) return;
      function tick() {
        const width = Math.max(1, slides.clientWidth);
        const current = Math.round(slides.scrollLeft / width);
        const next = current >= count - 1 ? 0 : current + 1;
        slides.scrollTo({ left: next * width, behavior: "smooth" });
        timer = setTimeout(tick, AUTOPLAY_INTERVAL_MS);
      }
      const jitter = Math.floor(Math.random() * AUTOPLAY_JITTER_MS);
      timer = setTimeout(tick, AUTOPLAY_INTERVAL_MS + jitter);
    }
    function pauseForInteraction() {
      paused = true;
      stop();
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; start(); }, AUTOPLAY_RESUME_DELAY_MS);
    }
    slides.addEventListener("touchstart", pauseForInteraction, { passive: true });
    slides.addEventListener("pointerdown", pauseForInteraction, { passive: true });

    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    let observer = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        });
      }, { threshold: 0.5 });
      observer.observe(slides);
    } else {
      visible = true;
      start();
    }

    return function cleanup() {
      stop();
      if (resumeTimer) clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (observer) observer.disconnect();
      slides.removeEventListener("touchstart", pauseForInteraction);
      slides.removeEventListener("pointerdown", pauseForInteraction);
    };
  }

  let cardAutoplayCleanups = [];

  function clearCardAutoplay() {
    cardAutoplayCleanups.forEach((cleanup) => cleanup());
    cardAutoplayCleanups = [];
  }

  function bindGallerySliders(scope) {
    clearCardAutoplay();
    scope.querySelectorAll("[data-store-slides]").forEach((slides) => {
      const gallery = slides.closest(".store-card-gallery");
      const dots = gallery ? gallery.querySelectorAll(".store-card-dot") : [];
      if (dots.length) {
        slides.addEventListener("scroll", () => {
          const index = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
          dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
        }, { passive: true });
      }
      if (gallery && gallery.getAttribute("data-store-autoplay") === "1") {
        const cleanup = attachAutoplay(slides, dots);
        if (cleanup) cardAutoplayCleanups.push(cleanup);
      }
    });
  }

  function goToDetail(itemId) {
    root.state.setStoreScrollY(window.scrollY || window.pageYOffset || 0);
    root.utils.routeTo(`storeItem-${itemId}`);
  }

  function bindGridActions(container) {
    container.querySelectorAll("[data-store-item]").forEach((card) => {
      const id = card.getAttribute("data-store-item");
      card.addEventListener("click", (event) => {
        if (event.target.closest("[data-store-book], [data-store-contact], [data-store-buy]")) return;
        goToDetail(id);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("[data-store-book], [data-store-contact], [data-store-buy]")) return;
        event.preventDefault();
        goToDetail(id);
      });
    });
    container.querySelectorAll("[data-store-book]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const id = button.getAttribute("data-store-book");
        const item = (root.state.catalog.items || []).find((it) => String(it.item_id) === String(id));
        const draftItem = root.services.catalogItemToCommerceDraft(item);
        if (!draftItem || !root.services.applyCommerceDraft("scheduled", draftItem)) {
          trackItemEvent("cwf_store_contact_admin", item, { source: "store_list" });
          root.ui.openContactSheet(container, { title: item?.item_name || "รายการนี้" });
          return;
        }
        trackItemEvent("cwf_store_begin_booking", item, { source: "store_list" });
        root.utils.routeTo("scheduled");
      });
    });
    container.querySelectorAll("[data-store-buy]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const id = button.getAttribute("data-store-buy");
        const item = (root.state.catalog.items || []).find((it) => String(it.item_id) === String(id));
        if (item) openPurchaseSheet(container, item);
      });
    });
    container.querySelectorAll("[data-store-contact]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const id = button.getAttribute("data-store-contact");
        const item = (root.state.catalog.items || []).find((it) => String(it.item_id) === String(id));
        const name = button.getAttribute("data-store-contact-name") || "รายการนี้";
        trackItemEvent("cwf_store_contact_admin", item, { source: "store_list" });
        root.ui.openContactSheet(container, { title: name });
      });
    });
    container.querySelectorAll("[data-store-rating]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation && event.stopPropagation();
        const id = button.getAttribute("data-store-rating");
        goToDetail(id);
      });
    });
    bindGallerySliders(container);
  }

  function patchGrid(container) {
    const mount = container.querySelector("[data-store-grid-mount]");
    if (!mount) return;
    mount.innerHTML = renderGrid(root.state.catalog.items || []);
    bindGridActions(container);
    refreshFilterCount(container);
  }

  function bindBody(container) {
    const filterToggle = container.querySelector("[data-store-filter-toggle]");
    const filterPanel = container.querySelector("[data-store-filter-panel]");
    if (filterToggle && filterPanel) {
      filterToggle.addEventListener("click", () => {
        filtersOpen = !filtersOpen;
        filterPanel.hidden = !filtersOpen;
        filterToggle.classList.toggle("is-open", filtersOpen);
        filterToggle.setAttribute("aria-expanded", filtersOpen ? "true" : "false");
      });
    }
    const search = container.querySelector("[data-store-search]");
    if (search) {
      search.addEventListener("input", () => {
        filterState.search = search.value || "";
        patchGrid(container);
      });
    }
    const category = container.querySelector("[data-store-category]");
    if (category) {
      category.addEventListener("change", () => {
        filterState.category = category.value || "";
        trackFilter("category", filterState.category);
        patchGrid(container);
      });
    }
    const acType = container.querySelector("[data-store-actype]");
    if (acType) {
      acType.addEventListener("change", () => {
        filterState.acType = acType.value || "";
        trackFilter("ac_type", filterState.acType);
        patchGrid(container);
      });
    }
    const wash = container.querySelector("[data-store-wash]");
    if (wash) {
      wash.addEventListener("change", () => {
        filterState.washVariant = wash.value || "";
        trackFilter("wash_variant", filterState.washVariant);
        patchGrid(container);
      });
    }
    const btu = container.querySelector("[data-store-btu]");
    if (btu) {
      btu.addEventListener("change", () => {
        filterState.btu = btu.value || "";
        trackFilter("btu", filterState.btu);
        patchGrid(container);
      });
    }
    const queueToday = container.querySelector("[data-store-queue-today]");
    if (queueToday) {
      queueToday.addEventListener("change", () => {
        filterState.queueToday = !!queueToday.checked;
        trackFilter("queue_today", filterState.queueToday);
        patchGrid(container);
      });
    }
    const sort = container.querySelector("[data-store-sort]");
    if (sort) {
      sort.addEventListener("change", () => {
        filterState.sort = sort.value || "recommended";
        trackFilter("sort", filterState.sort);
        patchGrid(container);
      });
    }
    const retry = container.querySelector("[data-store-retry]");
    if (retry) {
      retry.addEventListener("click", () => loadCatalog(container));
    }
    bindGridActions(container);
  }

  function patchBody(container) {
    const mount = container.querySelector("[data-store-body]");
    if (!mount) return;
    mount.innerHTML = renderBody();
    bindBody(container);
    restoreScrollIfNeeded();
  }

  function restoreScrollIfNeeded() {
    const y = root.state.storeScrollY || 0;
    if (y <= 0) return;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  async function loadCatalog(container) {
    root.state.setCollection("catalog", { status: "loading", items: [], error: "" });
    patchBody(container);
    try {
      const data = await root.api.loadCatalogItems();
      const items = root.utils.normalizeList(data, "items");
      root.state.setCollection("catalog", { status: "success", items, error: "" });
    } catch (error) {
      root.state.setCollection("catalog", { status: "error", items: [], error: error?.message || "โหลดข้อมูลไม่สำเร็จ" });
    }
    patchBody(container);
  }

  function ensureLoaded(container) {
    if (root.state.catalog.status !== "idle") {
      restoreScrollIfNeeded();
      return;
    }
    loadCatalog(container);
  }

  // ---------- Product Detail ----------

  function detailItemId() {
    return root.router && typeof root.router.routeParam === "function"
      ? root.router.routeParam(root.state.currentRoute)
      : "";
  }

  function renderDetailGallery(item, name) {
    const images = itemGalleryImages(item);
    if (!images.length) {
      return `
        <div class="store-detail-gallery">
          ${renderHotBadge(item)}
          ${renderFeaturedRibbon(item)}
          <div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div>
          ${renderSaleBadge(item)}
        </div>
      `;
    }
    const autoplay = images.length > 1 && item.is_autoplay_enabled === true;
    const dots = images.length > 1
      ? `<div class="store-detail-dots" data-store-detail-dots>${images.map((_, i) => `<span class="store-detail-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`
      : "";
    return `
      <div class="store-detail-gallery"${autoplay ? ' data-store-autoplay="1"' : ""}>
        ${renderHotBadge(item)}
        ${renderFeaturedRibbon(item)}
        <div class="store-detail-slides" data-store-detail-slides>${renderGallerySlides(images, name, "store-detail-slide")}</div>
        ${renderSaleBadge(item)}
        ${dots}
      </div>
    `;
  }

  // Icon shown to the left of each accordion header -- a fixed, deterministic
  // mapping by section title (presentation only, not derived from any
  // per-item data) so every card is instantly recognizable as a tappable row.
  const ACCORDION_ICONS = {
    "จุดเด่นของบริการ": "sparkle",
    "รายละเอียดบริการ": "chat",
    "เหมาะกับแอร์แบบไหน": "wrench",
    "เงื่อนไขบริการ": "shield",
    "เปรียบเทียบวิธีล้าง": "clock",
  };

  // Premium white-card accordion row (iOS/Shopee style): icon, title + a
  // small "แตะเพื่อดูรายละเอียด" affordance hint, and a chevron that rotates
  // open -- never the old bare "+"/"-" text marker, so it reads as an
  // obviously tappable row rather than plain text.
  function renderAccordionSection(title, bodyHtml, { open } = {}) {
    if (!bodyHtml) return "";
    const icon = ACCORDION_ICONS[title] || "sparkle";
    return `
      <details class="store-detail-accordion"${open ? " open" : ""}>
        <summary>
          <span class="store-detail-accordion-icon">${root.utils.icon(icon, 18)}</span>
          <span class="store-detail-accordion-text">
            <span class="store-detail-accordion-title">${root.utils.escapeHtml(title)}</span>
            <span class="store-detail-accordion-hint">แตะเพื่อดูรายละเอียด</span>
          </span>
          <span class="store-detail-accordion-chevron" aria-hidden="true">›</span>
        </summary>
        <div class="store-detail-accordion-body">${bodyHtml}</div>
      </details>
    `;
  }

  function renderVariantSelector(item, siblings) {
    if (!siblings || siblings.length < 2) return "";
    const selectedId = item.item_id;
    return `
      <div class="store-detail-variant-selector" data-store-variant-selector>
        <span class="store-detail-variant-label">เลือกขนาด BTU</span>
        <div class="store-detail-variant-options">
          ${siblings.map((s) => {
            const selected = String(s.item_id) === String(selectedId);
            return `
              <button type="button" class="store-detail-variant-option${selected ? " is-selected" : ""}" data-store-variant-option="${root.utils.escapeHtml(String(s.item_id))}">
                ${selected ? `<span class="store-detail-variant-check" aria-hidden="true">✓</span>` : ""}
                <span class="store-detail-variant-spec">${root.utils.escapeHtml(variantBtuLabel(s))}</span>
                <span class="store-detail-variant-price">${root.utils.escapeHtml(priceLabel(s))}</span>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderRelatedProducts(item, allItems) {
    const related = relatedFamilyItems(item, allItems);
    if (!related.length) return "";
    const isWallWash = canonicalAcType(item) === "wall" && canonicalJobCategory(item) === "wash";
    const heading = isWallWash ? "เลือกวิธีล้างที่เหมาะกับคุณ" : "บริการที่เกี่ยวข้อง";
    return `
      <div class="store-detail-related" data-store-related>
        <h3>${root.utils.escapeHtml(heading)}</h3>
        <div class="store-related-slider">
          ${related.map((r) => {
            const images = itemGalleryImages(r);
            const thumb = images.length
              ? `<img class="store-related-card-image" src="${root.utils.escapeHtml(images[0].image_url)}" alt="${root.utils.escapeHtml(images[0].alt_text || r.item_name || "")}" loading="lazy" onerror="this.style.visibility='hidden';">`
              : `<div class="store-card-image-placeholder" aria-hidden="true">ไม่มีรูปภาพ</div>`;
            if (r.is_current) {
              return `
                <div class="store-related-card is-current" aria-current="true">
                  <span class="store-related-card-badge">กำลังดู</span>
                  <div class="store-related-card-image-wrap">${thumb}</div>
                  <strong>${root.utils.escapeHtml(r.item_name || "-")}</strong>
                  <span class="price-text${priceIsAsk(r) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(r))}</span>
                </div>
              `;
            }
            return `
              <button type="button" class="store-related-card" data-store-related-item="${root.utils.escapeHtml(String(r.item_id))}" aria-label="ดูรายละเอียด ${root.utils.escapeHtml(r.item_name || "")}">
                <div class="store-related-card-image-wrap">${thumb}</div>
                <strong>${root.utils.escapeHtml(r.item_name || "-")}</strong>
                <span class="price-text${priceIsAsk(r) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(r))}</span>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // Static, factual comparison content (not derived from per-item DB fields --
  // these four wash methods are fixed domain concepts shared by every wall-AC
  // wash item, not a guess about any specific catalog row's price/availability).
  // Wording is limited strictly to CWF-verified service steps -- no
  // disinfection/germ-kill claims, no guaranteed-leak-fix claims, and no
  // "removes the coil" claim (only แขวนคอยล์ removes panels/trays, not the coil).
  const WALL_AC_CLEANING_COMPARISON = [
    {
      title: "ล้างปกติ",
      steps: "ล้างฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และฉีดอัดท่อน้ำทิ้ง",
    },
    {
      title: "ล้างพรีเมียม",
      steps: "ล้างละเอียดคอยล์เย็น-คอยล์ร้อน ถอดรางน้ำทิ้ง ทำความสะอาดโพรงกระรอก และฉีดอัดท่อน้ำทิ้ง",
    },
    {
      title: "แขวนคอยล์",
      steps: "ถอดแผงไฟ ถอดถาดหลัง และทำความสะอาดภายในอย่างละเอียด",
    },
    {
      title: "ตัดล้างใหญ่",
      steps: "ถอดล้างทั้งตัว ทำความสะอาดครบระบบ ต้องประเมินสภาพเครื่องและหน้างานก่อน",
    },
  ];

  function renderCleaningComparison() {
    return `
      <div class="store-compare-grid">
        ${WALL_AC_CLEANING_COMPARISON.map((c) => `
          <div class="store-compare-card">
            <h4>${root.utils.escapeHtml(c.title)}</h4>
            <dl>
              <dt>ขั้นตอน</dt><dd>${root.utils.escapeHtml(c.steps)}</dd>
            </dl>
          </div>
        `).join("")}
      </div>
    `;
  }

  // ---------- Verified Customer Reviews (Product Detail) ----------

  const REVIEWS_PAGE_SIZE = 10;

  let reviewsState = { itemId: null, status: "idle", reviews: [], total: 0, ratingAverage: null, reviewCount: 0, offset: 0 };
  let writeReviewState = {
    open: false,
    eligibilityStatus: "idle", // idle | loading | success | error
    eligible: false,
    eligibleJobs: [],
    jobId: null,
    rating: 0,
    comment: "",
    step: "form", // form | preview
    submitting: false,
    error: "",
    success: false,
  };

  function resetReviewsState(itemId) {
    reviewsRequestSeq += 1;
    eligibilityRequestSeq += 1;
    reviewSubmitSeq += 1;
    reviewsState = { itemId, status: "idle", reviews: [], total: 0, ratingAverage: null, reviewCount: 0, offset: 0 };
    writeReviewState = {
      itemId, open: false, eligibilityStatus: "idle", eligible: false, eligibleJobs: [],
      jobId: null, rating: 0, comment: "", step: "form", submitting: false, error: "", success: false,
    };
  }

  function isCurrentDetailContext(itemId) {
    const bucket = root.state.storeDetail || {};
    return String(detailItemId()) === String(itemId)
      && String(bucket.itemId) === String(itemId)
      && bucket.status === "success"
      && bucket.data
      && String(bucket.data.item_id) === String(itemId);
  }

  function isCurrentReviewsRequest(itemId, requestSeq) {
    return requestSeq === reviewsRequestSeq && isCurrentDetailContext(itemId) && String(reviewsState.itemId) === String(itemId);
  }

  function isCurrentEligibilityRequest(itemId, requestSeq) {
    return requestSeq === eligibilityRequestSeq && isCurrentDetailContext(itemId) && String(writeReviewState.itemId || itemId) === String(itemId);
  }

  function isCurrentReviewSubmit(itemId, requestSeq) {
    return requestSeq === reviewSubmitSeq && isCurrentDetailContext(itemId) && String(writeReviewState.itemId || itemId) === String(itemId);
  }

  function patchReviewsSection(container, item) {
    if (!item || !isCurrentDetailContext(item.item_id)) return;
    const mount = container.querySelector("[data-store-reviews-section]");
    if (!mount) return;
    mount.innerHTML = renderReviewsSectionBody(item);
    bindReviewsSection(container, item);
  }

  async function loadReviewsList(container, item, { append } = {}) {
    const itemId = item.item_id;
    if (!isCurrentDetailContext(itemId)) return;
    if (append && reviewsState.status === "loading_more") return;
    const requestSeq = ++reviewsRequestSeq;
    reviewsState.itemId = itemId;
    reviewsState.status = append ? "loading_more" : "loading";
    patchReviewsSection(container, item);
    try {
      const offset = append ? reviewsState.offset : 0;
      const data = await root.api.loadCatalogItemReviews(itemId, { limit: REVIEWS_PAGE_SIZE, offset });
      if (!isCurrentReviewsRequest(itemId, requestSeq)) return;
      const incoming = root.utils.normalizeList(data, "reviews");
      reviewsState = {
        itemId,
        status: "success",
        reviews: append ? reviewsState.reviews.concat(incoming) : incoming,
        total: Number(data?.total || 0),
        ratingAverage: data?.rating_average == null ? null : Number(data.rating_average),
        reviewCount: Number(data?.review_count || 0),
        offset: offset + incoming.length,
      };
    } catch (error) {
      if (!isCurrentReviewsRequest(itemId, requestSeq)) return;
      reviewsState.status = "error";
      reviewsState.error = error?.message || "โหลดรีวิวไม่สำเร็จ";
    }
    patchReviewsSection(container, item);
  }

  async function loadEligibility(container, item) {
    if (!root.state.customer?.logged_in) return;
    const itemId = item.item_id;
    if (!isCurrentDetailContext(itemId)) return;
    const requestSeq = ++eligibilityRequestSeq;
    writeReviewState.itemId = itemId;
    writeReviewState.eligibilityStatus = "loading";
    writeReviewState.error = "";
    try {
      const data = await root.api.loadReviewEligibility(itemId);
      if (!isCurrentEligibilityRequest(itemId, requestSeq)) return;
      writeReviewState.eligibilityStatus = "success";
      writeReviewState.eligible = Boolean(data?.eligible);
      writeReviewState.eligibleJobs = root.utils.normalizeList(data, "eligible_jobs");
      writeReviewState.jobId = writeReviewState.eligibleJobs[0]?.job_id || null;
      writeReviewState.error = "";
    } catch (error) {
      if (!isCurrentEligibilityRequest(itemId, requestSeq)) return;
      writeReviewState.eligibilityStatus = "error";
      writeReviewState.eligible = false;
      writeReviewState.error = error?.message || "ตรวจสอบสิทธิ์รีวิวไม่สำเร็จ";
    }
    patchReviewsSection(container, item);
  }

  function renderReviewStars(currentRating, interactive) {
    return Array.from({ length: 5 }, (_, i) => {
      const n = i + 1;
      const filled = n <= currentRating;
      if (!interactive) return `<span class="store-review-star${filled ? " is-filled" : ""}" aria-hidden="true">${filled ? "★" : "☆"}</span>`;
      return `<button type="button" class="store-review-star-btn${filled ? " is-filled" : ""}" data-review-star="${n}" aria-label="${n} ดาว">${filled ? "★" : "☆"}</button>`;
    }).join("");
  }

  function renderWriteReviewPanel(item) {
    if (!root.state.customer?.logged_in) {
      return `
        <div class="store-review-write-gate">
          <p>เข้าสู่ระบบเพื่อเขียนรีวิวสำหรับงานที่คุณใช้บริการจริง</p>
          <button type="button" class="secondary-btn" data-store-review-login>เข้าสู่ระบบ</button>
        </div>
      `;
    }
    if (writeReviewState.eligibilityStatus === "loading" || writeReviewState.eligibilityStatus === "idle") {
      return `<div class="content-skeleton" aria-label="กำลังตรวจสอบสิทธิ์รีวิว"><span></span></div>`;
    }
    if (writeReviewState.eligibilityStatus === "error") {
      return `
        <div class="store-review-write-gate">
          <p class="store-review-ineligible">ตรวจสอบสิทธิ์รีวิวไม่สำเร็จ</p>
          <button type="button" class="secondary-btn" data-store-review-retry>ลองใหม่</button>
        </div>
      `;
    }
    if (!writeReviewState.eligible) {
      return `<p class="store-review-ineligible">เขียนรีวิวได้หลังงานบริการเสร็จสมบูรณ์</p>`;
    }
    if (writeReviewState.success) {
      return root.utils.stateBox("success", "ส่งรีวิวแล้ว รอแอดมินตรวจสอบ");
    }
    if (!writeReviewState.open) {
      return `<button type="button" class="secondary-btn" data-store-review-open>เขียนรีวิว</button>`;
    }

    const jobPicker = writeReviewState.eligibleJobs.length > 1 ? `
      <label class="store-review-field">
        <span>เลือกงานที่ต้องการรีวิว</span>
        <select data-store-review-job>
          ${writeReviewState.eligibleJobs.map((j) => `<option value="${root.utils.escapeHtml(j.job_id)}"${String(j.job_id) === String(writeReviewState.jobId) ? " selected" : ""}>${root.utils.escapeHtml(String(j.appointment_datetime || "").slice(0, 16).replace("T", " "))}</option>`).join("")}
        </select>
      </label>
    ` : "";

    if (writeReviewState.step === "preview") {
      return `
        <div class="store-review-form store-review-preview">
          <h4>ตรวจสอบรีวิวก่อนส่ง</h4>
          <div class="store-review-stars-display">${renderReviewStars(writeReviewState.rating, false)}</div>
          <p class="store-review-preview-comment">${root.utils.escapeHtml(writeReviewState.comment || "(ไม่มีความเห็นเพิ่มเติม)")}</p>
          ${writeReviewState.error ? root.utils.stateBox("error", writeReviewState.error) : ""}
          <div class="store-review-form-actions">
            <button type="button" class="secondary-btn" data-store-review-back ${writeReviewState.submitting ? "disabled" : ""}>กลับไปแก้ไข</button>
            <button type="button" class="primary-btn" data-store-review-confirm ${writeReviewState.submitting ? "disabled" : ""}>${writeReviewState.submitting ? "กำลังส่ง..." : "ยืนยันส่งรีวิว"}</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="store-review-form">
        <h4>เขียนรีวิว</h4>
        ${jobPicker}
        <label class="store-review-field">
          <span>ให้คะแนน</span>
          <div class="store-review-stars-input" data-store-review-stars>${renderReviewStars(writeReviewState.rating, true)}</div>
        </label>
        <label class="store-review-field">
          <span>ความเห็น (ไม่บังคับ)</span>
          <textarea data-store-review-comment maxlength="500" placeholder="บอกเล่าประสบการณ์ใช้บริการของคุณ">${root.utils.escapeHtml(writeReviewState.comment)}</textarea>
        </label>
        ${writeReviewState.error ? root.utils.stateBox("error", writeReviewState.error) : ""}
        <div class="store-review-form-actions">
          <button type="button" class="secondary-btn" data-store-review-cancel>ยกเลิก</button>
          <button type="button" class="primary-btn" data-store-review-next>ตรวจสอบรีวิว</button>
        </div>
      </div>
    `;
  }

  function renderReviewsList() {
    if (reviewsState.status === "loading" && !reviewsState.reviews.length) {
      return `<div class="content-skeleton" aria-label="กำลังโหลดรีวิว"><span></span><span></span></div>`;
    }
    if (reviewsState.status === "error") {
      return root.utils.stateBox("error", reviewsState.error || "โหลดรีวิวไม่สำเร็จ");
    }
    if (!reviewsState.reviews.length) {
      return `<p class="store-reviews-empty">ยังไม่มีรีวิวสำหรับสินค้า/บริการนี้</p>`;
    }
    const items = reviewsState.reviews.map((r) => `
      <div class="store-review-item">
        <div class="store-review-item-head">
          <span class="store-review-item-name">${root.utils.escapeHtml(r.display_name || "ลูกค้า")}</span>
          <span class="store-review-item-stars">${renderReviewStars(Number(r.rating || 0), false)}</span>
        </div>
        ${r.comment ? `<p class="store-review-item-comment">${root.utils.escapeHtml(r.comment)}</p>` : ""}
        <span class="store-review-item-date">${root.utils.escapeHtml(String(r.created_at || "").slice(0, 10))}</span>
      </div>
    `).join("");
    const hasMore = reviewsState.reviews.length < reviewsState.total;
    return `
      <div class="store-reviews-list">${items}</div>
      ${hasMore ? `<button type="button" class="secondary-btn store-reviews-load-more" data-store-reviews-more ${reviewsState.status === "loading_more" ? "disabled" : ""}>${reviewsState.status === "loading_more" ? "กำลังโหลด..." : "โหลดรีวิวเพิ่ม"}</button>` : ""}
    `;
  }

  function renderReviewsSectionBody(item) {
    const avg = reviewsState.ratingAverage;
    const count = reviewsState.reviewCount;
    const hasReviews = Number.isFinite(avg) && avg >= 1 && count > 0;
    return `
      <h3>รีวิวจากลูกค้า</h3>
      <div class="store-reviews-summary">
        ${hasReviews
          ? `<span class="store-rating-label">รีวิว</span><span class="store-rating-stars">${renderReviewStars(Math.round(avg), false)}</span><span class="store-rating-value">${formatRatingAverage(avg)}</span><span class="store-rating-count">(${count})</span>`
          : `<span class="store-rating-count store-rating-count-empty">ยังไม่มีรีวิวจากลูกค้าสำหรับบริการนี้</span>`}
      </div>
      <div class="store-reviews-list-mount">${renderReviewsList()}</div>
      <div class="store-review-write-mount">${renderWriteReviewPanel(item)}</div>
    `;
  }

  function bindReviewsSection(container, item) {
    const section = container.querySelector("[data-store-reviews-section]");
    if (!section) return;

    const moreButton = section.querySelector("[data-store-reviews-more]");
    if (moreButton) moreButton.addEventListener("click", () => loadReviewsList(container, item, { append: true }));

    const loginButton = section.querySelector("[data-store-review-login]");
    if (loginButton) loginButton.addEventListener("click", () => root.utils.routeTo("profile"));

    const openButton = section.querySelector("[data-store-review-open]");
    if (openButton) openButton.addEventListener("click", () => {
      if (!isCurrentDetailContext(item.item_id)) return;
      writeReviewState.open = true;
      patchReviewsSection(container, item);
    });

    const retryButton = section.querySelector("[data-store-review-retry]");
    if (retryButton) retryButton.addEventListener("click", () => loadEligibility(container, root.state.storeDetail?.data || item));

    const cancelButton = section.querySelector("[data-store-review-cancel]");
    if (cancelButton) cancelButton.addEventListener("click", () => {
      if (!isCurrentDetailContext(item.item_id)) return;
      writeReviewState.open = false;
      writeReviewState.rating = 0;
      writeReviewState.comment = "";
      writeReviewState.error = "";
      patchReviewsSection(container, item);
    });

    const jobSelect = section.querySelector("[data-store-review-job]");
    if (jobSelect) jobSelect.addEventListener("change", () => { writeReviewState.jobId = jobSelect.value; });

    section.querySelectorAll("[data-review-star]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!isCurrentDetailContext(item.item_id)) return;
        writeReviewState.rating = Number(button.getAttribute("data-review-star") || 0);
        patchReviewsSection(container, item);
      });
    });

    const commentInput = section.querySelector("[data-store-review-comment]");
    if (commentInput) commentInput.addEventListener("input", () => { writeReviewState.comment = commentInput.value; });

    const nextButton = section.querySelector("[data-store-review-next]");
    if (nextButton) nextButton.addEventListener("click", () => {
      if (!isCurrentDetailContext(item.item_id)) return;
      if (!writeReviewState.rating) {
        writeReviewState.error = "กรุณาให้คะแนน 1-5 ดาว";
        patchReviewsSection(container, item);
        return;
      }
      writeReviewState.error = "";
      writeReviewState.step = "preview";
      patchReviewsSection(container, item);
    });

    const backButton = section.querySelector("[data-store-review-back]");
    if (backButton) backButton.addEventListener("click", () => {
      if (!isCurrentDetailContext(item.item_id)) return;
      writeReviewState.step = "form";
      patchReviewsSection(container, item);
    });

    const confirmButton = section.querySelector("[data-store-review-confirm]");
    if (confirmButton) confirmButton.addEventListener("click", async () => {
      if (!isCurrentDetailContext(item.item_id)) return;
      if (writeReviewState.submitting) return;
      const itemId = item.item_id;
      const requestSeq = ++reviewSubmitSeq;
      writeReviewState.submitting = true;
      writeReviewState.error = "";
      patchReviewsSection(container, item);
      try {
        await root.api.submitCatalogItemReview(itemId, {
          job_id: writeReviewState.jobId,
          rating: writeReviewState.rating,
          comment: writeReviewState.comment,
        });
        if (!isCurrentReviewSubmit(itemId, requestSeq)) return;
        writeReviewState.submitting = false;
        writeReviewState.open = false;
        writeReviewState.success = true;
        patchReviewsSection(container, item);
      } catch (error) {
        if (!isCurrentReviewSubmit(itemId, requestSeq)) return;
        writeReviewState.submitting = false;
        writeReviewState.error = error?.message || "ส่งรีวิวไม่สำเร็จ";
        patchReviewsSection(container, item);
      }
    });
  }

  function renderDetailContent(item) {
    const name = item.item_name || "-";
    const category = categoryLabel(item.item_category);
    const highlights = Array.isArray(item.highlights) ? item.highlights : [];
    const allItems = (root.state.catalog && root.state.catalog.items) || [];
    const siblings = variantSiblings(item, allItems);
    const unit = item.unit_label || "";
    const promo = hasPromo(item);
    const bookable = isBookable(item);
    const showCompare = canonicalAcType(item) === "wall" && canonicalJobCategory(item) === "wash";
    const ctaButton = bookable
      ? `<button class="primary-btn" type="button" data-store-detail-book="1">จองคิว</button>`
      : isPurchase(item)
        ? `<button class="primary-btn" type="button" data-store-detail-buy="1">ซื้อสินค้า</button>`
        : `<button class="primary-btn" type="button" data-store-detail-contact="1">สอบถามแอดมิน</button>`;

    return `
      <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
      ${renderDetailGallery(item, name)}
      ${renderBadges(item)}
      <div class="store-detail-head">
        ${category ? `<span class="tag">${root.utils.escapeHtml(category)}</span>` : ""}
        <h2>${root.utils.escapeHtml(name)}</h2>
      </div>
      ${renderRatingBadge(item)}
      ${renderBookingCountLabel(item)}
      <div class="store-detail-price" data-store-detail-price>
        <span class="price-text${priceIsAsk(item) ? " is-estimate" : ""}">${root.utils.escapeHtml(priceLabel(item))}</span>
        ${promo ? `<span class="price-strike">${root.utils.escapeHtml(root.utils.formatBaht(item.normal_price))}</span>` : ""}
        ${unit && !priceIsAsk(item) ? `<span class="muted">/ ${root.utils.escapeHtml(unit)}</span>` : ""}
      </div>
      ${renderPromoInfo(item)}
      ${renderVariantSelector(item, siblings)}
      ${item.short_description ? `<div class="store-detail-section store-detail-summary"><p>${root.utils.escapeHtml(item.short_description)}</p></div>` : ""}
      <div class="store-detail-inline-cta">${ctaButton}</div>
      <div class="store-detail-accordion-group">
        ${renderAccordionSection("จุดเด่นของบริการ", highlights.length ? `
          <ul class="store-detail-highlights">
            ${highlights.map((h) => `<li>${root.utils.icon("sparkle", 16)}<span>${root.utils.escapeHtml(h)}</span></li>`).join("")}
          </ul>
        ` : "")}
        ${renderAccordionSection("รายละเอียดบริการ", item.long_description ? `<p>${root.utils.escapeHtml(item.long_description)}</p>` : "")}
        ${renderAccordionSection("เหมาะกับแอร์แบบไหน", item.ac_type ? `
          <ul class="store-detail-highlights">
            <li>${root.utils.icon("sparkle", 16)}<span>${root.utils.escapeHtml(item.ac_type)}</span></li>
          </ul>
        ` : "")}
        ${renderAccordionSection("เงื่อนไขบริการ", item.service_conditions ? `<p>${root.utils.escapeHtml(item.service_conditions)}</p>` : "")}
        ${showCompare ? renderAccordionSection("เปรียบเทียบวิธีล้าง", renderCleaningComparison()) : ""}
      </div>
      ${renderRelatedProducts(item, allItems)}
      <div class="store-detail-section store-reviews-section" data-store-reviews-section>
        ${renderReviewsSectionBody(item)}
      </div>
      <div class="store-detail-cta-bar">${ctaButton}</div>
    `;
  }

  function renderDetailBody() {
    const bucket = root.state.storeDetail || { status: "idle", data: null, error: "" };
    if (bucket.status === "idle" || bucket.status === "loading") {
      return `
        <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
        <div class="content-skeleton" aria-label="กำลังโหลดรายละเอียด"><span></span><span></span></div>
      `;
    }
    if (bucket.status === "error") {
      return `
        <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
        ${root.utils.stateBox("error", bucket.error || "ไม่พบรายการนี้")}
        <button class="secondary-btn" type="button" data-store-detail-retry>ลองใหม่</button>
      `;
    }
    if (!bucket.data) {
      return `
        <button class="store-detail-back" type="button" data-store-detail-back>${root.utils.icon("pin", 16)}กลับไปหน้าร้านค้า</button>
        ${root.utils.stateBox("", "ไม่พบรายการนี้")}
      `;
    }
    return renderDetailContent(bucket.data);
  }

  let detailAutoplayCleanup = null;

  function clearDetailAutoplay() {
    if (detailAutoplayCleanup) {
      detailAutoplayCleanup();
      detailAutoplayCleanup = null;
    }
  }

  function bindDetailGallery(container) {
    clearDetailAutoplay();
    const slides = container.querySelector("[data-store-detail-slides]");
    const dotsWrap = container.querySelector("[data-store-detail-dots]");
    if (!slides || !dotsWrap) return;
    const dots = dotsWrap.querySelectorAll(".store-detail-dot");
    slides.addEventListener("scroll", () => {
      const index = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    }, { passive: true });
    const gallery = slides.closest(".store-detail-gallery");
    if (gallery && gallery.getAttribute("data-store-autoplay") === "1") {
      detailAutoplayCleanup = attachAutoplay(slides, dots);
    }
  }

  function bindDetailBody(container) {
    container.querySelectorAll("[data-store-detail-back]").forEach((button) => {
      button.addEventListener("click", () => root.utils.routeTo("store"));
    });
    const retry = container.querySelector("[data-store-detail-retry]");
    if (retry) retry.addEventListener("click", () => loadDetail(container, detailItemId()));
    container.querySelectorAll("[data-store-detail-book]").forEach((bookButton) => {
      bookButton.addEventListener("click", () => {
        const item = root.state.storeDetail?.data;
        if (!item) return;
        const draftItem = root.services.catalogItemToCommerceDraft(item);
        if (!draftItem || !root.services.applyCommerceDraft("scheduled", draftItem)) {
          trackItemEvent("cwf_store_contact_admin", item, { source: "store_detail" });
          root.ui.openContactSheet(container, { title: item?.item_name || "รายการนี้" });
          return;
        }
        trackItemEvent("cwf_store_begin_booking", item, { source: "store_detail" });
        root.utils.routeTo("scheduled");
      });
    });
    container.querySelectorAll("[data-store-detail-contact]").forEach((contactButton) => {
      contactButton.addEventListener("click", () => {
        const item = root.state.storeDetail?.data;
        trackItemEvent("cwf_store_contact_admin", item, { source: "store_detail" });
        root.ui.openContactSheet(container, { title: item?.item_name || "รายการนี้" });
      });
    });
    container.querySelectorAll("[data-store-detail-buy]").forEach((buyButton) => {
      buyButton.addEventListener("click", () => {
        const item = root.state.storeDetail?.data;
        if (item) openPurchaseSheet(container, item);
      });
    });
    container.querySelectorAll("[data-store-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        const section = container.querySelector("[data-store-reviews-section]");
        if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    container.querySelectorAll("[data-store-variant-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-store-variant-option");
        if (String(id) === String(detailItemId())) return;
        track("cwf_store_variant_select", { item_id: id, source: "store_detail" });
        // Routes to the sibling's own detail URL rather than swapping a local
        // "display item" -- this makes the route param the single source of
        // truth for the whole page (gallery/badges/descriptions/reviews all
        // reload for the newly selected variant via loadDetail()), so there is
        // never a mismatch between the price shown and the rest of the page.
        root.utils.routeTo(`storeItem-${id}`);
      });
    });
    container.querySelectorAll("[data-store-related-item]").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-store-related-item");
        track("cwf_store_related_click", { item_id: id, source: "store_detail" });
        goToDetail(id);
      });
    });
    container.querySelectorAll(".store-detail-accordion").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        const title = details.querySelector(".store-detail-accordion-title");
        trackItemEvent("cwf_store_detail_expand", root.state.storeDetail?.data, {
          source: title ? title.textContent : "",
        });
      });
    });
    const item = root.state.storeDetail?.data;
    if (item) bindReviewsSection(container, item);
    bindDetailGallery(container);
  }

  function patchDetailBody(container) {
    const mount = container.querySelector("[data-store-detail-body]");
    if (!mount) return;
    mount.innerHTML = renderDetailBody();
    bindDetailBody(container);
  }

  // Lets the detail page show related-products/variant-selector data sourced
  // from the full catalog list even when the customer navigated straight to a
  // detail URL without first visiting the Store list page.
  async function ensureCatalogListLoaded() {
    const bucket = root.state.catalog || { status: "idle", items: [] };
    if (bucket.status === "success" && Array.isArray(bucket.items) && bucket.items.length) return bucket.items;
    try {
      const data = await root.api.loadCatalogItems();
      const items = root.utils.normalizeList(data, "items");
      root.state.setCollection("catalog", { status: "success", items, error: "" });
      return items;
    } catch (_error) {
      return bucket.items || [];
    }
  }

  async function loadDetail(container, itemId) {
    const requestSeq = ++detailLoadSeq;
    resetReviewsState(itemId);
    if (!itemId) {
      root.state.setStoreDetail({ status: "error", itemId: "", data: null, error: "ไม่พบรายการนี้" });
      patchDetailBody(container);
      return;
    }
    root.state.setStoreDetail({ status: "loading", itemId, data: null, error: "" });
    patchDetailBody(container);
    try {
      const data = await root.api.loadCatalogItem(itemId);
      if (requestSeq !== detailLoadSeq || String(detailItemId()) !== String(itemId)) return;
      root.state.setStoreDetail({ status: "success", itemId, data, error: "" });
      trackItemEvent("cwf_store_product_view", data, { source: "store_detail" });
      patchDetailBody(container);
      loadReviewsList(container, data);
      loadEligibility(container, data);
      ensureCatalogListLoaded().then((items) => {
        if (
          requestSeq === detailLoadSeq
          && items.length
          && String(root.state.storeDetail?.itemId) === String(itemId)
          && String(detailItemId()) === String(itemId)
        ) patchDetailBody(container);
      });
      return;
    } catch (error) {
      if (requestSeq !== detailLoadSeq || String(detailItemId()) !== String(itemId)) return;
      const message = error?.status === 404 ? "ไม่พบรายการนี้" : (error?.message || "โหลดข้อมูลไม่สำเร็จ");
      root.state.setStoreDetail({ status: "error", itemId, data: null, error: message });
    }
    patchDetailBody(container);
  }

  // ── Purchase (buy) flow for product-mode items ──────────────────────
  // Collects quantity + delivery/install options + contact, then shows an
  // order summary. Online payment (Omise) and persisted orders land in later
  // phases; for now the request is confirmed and handed to the admin.
  const esc = (value) => root.utils.escapeHtml(value == null ? "" : value);

  function purchaseSheetHtml(item) {
    const name = item.item_name || "สินค้า";
    const unitPrice = effectiveSalePrice(item);
    const priceStr = unitPrice === null ? "สอบถามราคา" : root.utils.formatBaht(unitPrice);
    return `
      <div class="contact-sheet-backdrop" data-purchase-close></div>
      <section class="contact-sheet purchase-sheet" role="dialog" aria-modal="true" aria-labelledby="purchase-sheet-title">
        <button class="contact-sheet-close" type="button" data-purchase-close aria-label="ปิด">×</button>
        <span class="section-kicker">สั่งซื้อสินค้า</span>
        <h2 id="purchase-sheet-title">${esc(name)}</h2>
        <div class="purchase-row"><span>ราคา/ชิ้น</span><strong>${esc(priceStr)}</strong></div>
        <div class="purchase-row purchase-qty">
          <span>จำนวน</span>
          <div class="qty-stepper">
            <button type="button" class="qty-btn" data-qty-dec aria-label="ลดจำนวน">−</button>
            <span class="qty-val" data-qty-val>1</span>
            <button type="button" class="qty-btn" data-qty-inc aria-label="เพิ่มจำนวน">+</button>
          </div>
        </div>
        <fieldset class="purchase-opt">
          <legend>การรับสินค้า</legend>
          <label class="purchase-choice"><input type="radio" name="cwf-delivery" value="pickup" checked><span>รับเองที่ร้าน</span></label>
          <label class="purchase-choice"><input type="radio" name="cwf-delivery" value="ship"><span>จัดส่งถึงบ้าน <small>(ค่าส่งแอดมินแจ้ง)</small></span></label>
        </fieldset>
        <fieldset class="purchase-opt">
          <legend>การติดตั้ง</legend>
          <label class="purchase-choice"><input type="radio" name="cwf-install" value="none" checked><span>ไม่ติดตั้ง (รับเครื่องอย่างเดียว)</span></label>
          <label class="purchase-choice"><input type="radio" name="cwf-install" value="cwf"><span>ติดตั้งโดยช่าง CWF <small>(ค่าติดตั้งแอดมินแจ้ง)</small></span></label>
        </fieldset>
        <div class="purchase-fields">
          <input class="purchase-input" type="text" data-buy-name placeholder="ชื่อผู้สั่งซื้อ *">
          <input class="purchase-input" type="tel" inputmode="tel" data-buy-phone placeholder="เบอร์โทร *">
          <textarea class="purchase-input" data-buy-address placeholder="ที่อยู่จัดส่ง (ถ้าเลือกจัดส่ง)"></textarea>
        </div>
        <p class="purchase-error" data-buy-error hidden>กรุณากรอกชื่อและเบอร์โทร</p>
        <div class="purchase-total"><span>ยอดสินค้า</span><strong data-buy-total>${esc(priceStr)}</strong></div>
        <p class="purchase-note">* ค่าติดตั้ง/ค่าจัดส่ง แอดมินจะยืนยันอีกครั้งหลังชำระค่าสินค้า</p>
        <button class="primary-btn" type="button" data-buy-submit>ไปหน้าชำระเงิน</button>
      </section>
    `;
  }

  // ---- Online payment (Omise: PromptPay + card) ----------------------------

  let paymentConfigCache = null;
  async function loadPaymentConfig() {
    if (paymentConfigCache) return paymentConfigCache;
    paymentConfigCache = await root.api.getPaymentConfig();
    return paymentConfigCache;
  }

  // Load Omise.js once, on demand (only when the customer picks the card tab).
  // The script is fetched from Omise's CDN by the browser, not our server.
  let omiseJsPromise = null;
  function ensureOmiseJs(publicKey) {
    if (window.Omise) { window.Omise.setPublicKey(publicKey); return Promise.resolve(window.Omise); }
    if (!omiseJsPromise) {
      omiseJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.omise.co/omise.js";
        s.async = true;
        s.onload = () => { if (window.Omise) resolve(window.Omise); else reject(new Error("omise.js unavailable")); };
        s.onerror = () => reject(new Error("omise.js failed to load"));
        document.head.appendChild(s);
      });
    }
    return omiseJsPromise.then((Omise) => { Omise.setPublicKey(publicKey); return Omise; });
  }

  function paymentStepHtml(item, o) {
    const totalStr = root.utils.formatBaht(o.amount);
    const methods = Array.isArray(o.methods) && o.methods.length ? o.methods : ["promptpay"];
    return `
      <button class="contact-sheet-close" type="button" data-purchase-close aria-label="ปิด">×</button>
      <span class="section-kicker">ชำระเงิน</span>
      <h2>ชำระค่าสินค้า</h2>
      <div class="purchase-total"><span>ยอดชำระ</span><strong>${esc(totalStr)}</strong></div>
      <div class="pay-methods" role="tablist">
        ${methods.includes("promptpay") ? `<button class="pay-method-btn is-active" type="button" data-pay-method="promptpay" role="tab">พร้อมเพย์ (PromptPay)</button>` : ""}
        ${methods.includes("card") ? `<button class="pay-method-btn${methods.includes("promptpay") ? "" : " is-active"}" type="button" data-pay-method="card" role="tab">บัตรเครดิต/เดบิต</button>` : ""}
      </div>
      <div class="pay-body" data-pay-body></div>
      <p class="purchase-error" data-pay-error hidden></p>
      <p class="purchase-note">ชำระเงินอย่างปลอดภัยผ่าน Omise · ข้อมูลบัตรไม่ถูกเก็บบนเซิร์ฟเวอร์ของเรา</p>
    `;
  }

  function processingPaymentHtml(item, o) {
    const orderCode = (o.order && o.order.order_code) || o.orderCode || "";
    return `
      <button class="contact-sheet-close" type="button" data-purchase-close aria-label="ปิด">×</button>
      <span class="section-kicker">กำลังตรวจสอบ</span>
      <h2>กำลังตรวจสอบการชำระเงิน</h2>
      <div class="purchase-summary">
        ${orderCode ? `<div><span>เลขคำสั่งซื้อ</span><strong>${esc(orderCode)}</strong></div>` : ""}
        <div><span>สินค้า</span><strong>${esc(item.item_name || "")} × ${o.qty}</strong></div>
        <div><span>ยอดชำระ</span><strong>${esc(root.utils.formatBaht(o.amount))}</strong></div>
      </div>
      <p>ระบบได้รับคำขอชำระเงินแล้วและกำลังรอตรวจสอบผล กรุณาอย่ากดจ่ายซ้ำ</p>
      <div class="contact-sheet-actions">
        ${orderCode ? `<button class="secondary-btn" type="button" data-route="tracking" data-track-order="${esc(orderCode)}">ติดตามคำสั่งซื้อ</button>` : ""}
        <a class="primary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">แจ้งแอดมินทาง LINE</a>
      </div>
    `;
  }

  function promptPayBodyHtml() {
    return `<button class="primary-btn" type="button" data-pp-start>สร้าง QR พร้อมเพย์</button>`;
  }

  function cardBodyHtml() {
    return `
      <div class="pay-card-form">
        <input class="purchase-input" data-card-number inputmode="numeric" autocomplete="cc-number" placeholder="หมายเลขบัตร">
        <div class="pay-card-row">
          <input class="purchase-input" data-card-exp inputmode="numeric" autocomplete="cc-exp" placeholder="เดือน/ปี (MM/YY)">
          <input class="purchase-input" data-card-cvc inputmode="numeric" autocomplete="cc-csc" placeholder="CVC">
        </div>
        <input class="purchase-input" data-card-name autocomplete="cc-name" placeholder="ชื่อบนบัตร">
      </div>
      <button class="primary-btn" type="button" data-card-pay>ชำระด้วยบัตร</button>
    `;
  }

  function paidConfirmHtml(item, o) {
    return `
      <button class="contact-sheet-close" type="button" data-purchase-close aria-label="ปิด">×</button>
      <span class="section-kicker">ชำระเงินสำเร็จ</span>
      <h2>ชำระเงินสำเร็จ 🎉</h2>
      <div class="purchase-summary">
        ${o.orderCode ? `<div><span>เลขคำสั่งซื้อ</span><strong>${esc(o.orderCode)}</strong></div>` : ""}
        <div><span>สินค้า</span><strong>${esc(item.item_name || "")} × ${o.qty}</strong></div>
        <div><span>ยอดชำระ</span><strong>${esc(root.utils.formatBaht(o.amount))}</strong></div>
      </div>
      <p>แอดมินจะติดต่อกลับเพื่อยืนยันการจัดส่ง/ติดตั้ง และค่าใช้จ่ายเพิ่มเติม (ถ้ามี)</p>
      ${o.orderCode ? `<p class="purchase-note">ติดตามสถานะคำสั่งซื้อได้ที่เมนู "ติดตาม" โดยใส่เลข ${esc(o.orderCode)}</p>` : ""}
      <div class="contact-sheet-actions">
        ${o.orderCode ? `<button class="secondary-btn" type="button" data-route="tracking" data-track-order="${esc(o.orderCode)}">ติดตามคำสั่งซื้อ</button>` : ""}
        <a class="primary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">แจ้งแอดมินทาง LINE</a>
      </div>
    `;
  }

  function purchaseConfirmHtml(item, o) {
    const deliveryLabel = o.delivery === "ship" ? "จัดส่งถึงบ้าน" : "รับเองที่ร้าน";
    const installLabel = o.install === "cwf" ? "ติดตั้งโดยช่าง CWF" : "ไม่ติดตั้ง";
    return `
      <button class="contact-sheet-close" type="button" data-purchase-close aria-label="ปิด">×</button>
      <span class="section-kicker">รับคำสั่งซื้อแล้ว</span>
      <h2>ขอบคุณสำหรับการสั่งซื้อ 🎉</h2>
      <div class="purchase-summary">
        ${o.orderCode ? `<div><span>เลขคำสั่งซื้อ</span><strong>${esc(o.orderCode)}</strong></div>` : ""}
        <div><span>สินค้า</span><strong>${esc(item.item_name || "")} × ${o.qty}</strong></div>
        <div><span>การรับสินค้า</span><strong>${deliveryLabel}</strong></div>
        <div><span>การติดตั้ง</span><strong>${installLabel}</strong></div>
        <div><span>ผู้สั่งซื้อ</span><strong>${esc(o.name)} · ${esc(o.phone)}</strong></div>
      </div>
      ${o.orderCode ? `<p class="purchase-note">บันทึกเลขคำสั่งซื้อไว้เพื่อสอบถามสถานะได้ที่แอดมิน</p>` : ""}
      <p>แอดมินจะติดต่อกลับเพื่อยืนยันค่าติดตั้ง/ค่าส่ง และแจ้งช่องทางชำระเงิน</p>
      <div class="contact-sheet-actions">
        <a class="primary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">แจ้งแอดมินทาง LINE</a>
      </div>
    `;
  }

  function openPurchaseSheet(container, item) {
    let mount = container.querySelector("[data-contact-sheet-mount]");
    if (!mount) { mount = document.createElement("div"); mount.setAttribute("data-contact-sheet-mount", ""); container.appendChild(mount); }
    mount.innerHTML = purchaseSheetHtml(item);
    document.body.classList.add("has-contact-sheet");
    trackItemEvent("cwf_store_purchase_open", item, { source: "store" });
    const unitPrice = effectiveSalePrice(item);
    let qty = 1;
    let pollTimer = null;
    const close = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      mount.innerHTML = "";
      document.body.classList.remove("has-contact-sheet");
    };
    const bindClose = () => mount.querySelectorAll("[data-purchase-close]").forEach((b) => b.addEventListener("click", close, { once: true }));

    // Poll an order until its payment resolves (PromptPay confirms via webhook,
    // so the QR screen watches the server). Stops on paid/failed or timeout.
    const startPolling = (code, onResolved) => {
      let attempts = 0;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        attempts += 1;
        if (attempts > 60) { clearInterval(pollTimer); pollTimer = null; return; } // ~3 min
        let status = "";
        try { const r = await root.api.getOrder(code); status = r?.order?.status || ""; } catch (_) { return; }
        if (status === "paid" || status === "payment_failed") {
          clearInterval(pollTimer); pollTimer = null; onResolved(status);
        }
      }, 3000);
    };

    // The payment step: choose PromptPay (QR + poll) or card (Omise.js token).
    const renderPaymentStep = (o, config) => {
      const sheet = mount.querySelector(".purchase-sheet");
      if (!sheet) return;
      o.methods = Array.isArray(config.methods) && config.methods.length ? config.methods : ["promptpay"];
      sheet.innerHTML = paymentStepHtml(item, o);
      bindClose();
      const body = sheet.querySelector("[data-pay-body]");
      const errEl = sheet.querySelector("[data-pay-error]");
      const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
      const clearError = () => { if (errEl) errEl.hidden = true; };
      const isProcessingResponse = (res) => {
        const status = res?.order?.status || res?.payment?.status || "";
        return status === "payment_processing" || res?.error === "PAYMENT_PROCESSING" || res?.error === "PAYMENT_RESULT_UNKNOWN";
      };
      const goProcessing = (res) => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        const orderCode = (res?.order && res.order.order_code) || (o.order && o.order.order_code) || "";
        if (orderCode) root.state.updateDraft?.("tracking", { trackingCode: orderCode });
        sheet.innerHTML = processingPaymentHtml(item, { ...o, order: res?.order || o.order, orderCode });
        bindClose();
      };
      const goPaid = () => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        const orderCode = (o.order && o.order.order_code) || "";
        // Prefill the tracking screen so the "ติดตามคำสั่งซื้อ" button lands on
        // the live status of this exact order.
        if (orderCode) root.state.updateDraft?.("tracking", { trackingCode: orderCode });
        sheet.innerHTML = paidConfirmHtml(item, { ...o, orderCode });
        bindClose();
        trackItemEvent("cwf_store_purchase_paid", item, { method: o.lastMethod, amount: o.amount });
      };

      const renderMethod = (method) => {
        clearError();
        o.lastMethod = method;
        sheet.querySelectorAll("[data-pay-method]").forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-pay-method") === method));
        if (!body) return;
        body.innerHTML = method === "card" ? cardBodyHtml() : promptPayBodyHtml();
        if (method === "promptpay") {
          body.querySelector("[data-pp-start]")?.addEventListener("click", async () => {
            if (o.paymentInFlight) return;
            o.paymentInFlight = true;
            clearError();
            const btn = body.querySelector("[data-pp-start]");
            if (btn) { btn.disabled = true; btn.textContent = "กำลังสร้าง QR..."; }
            try {
              const res = await root.api.payOrder(o.order.order_code, { method: "promptpay" });
              if (isProcessingResponse(res) && !res?.payment?.qr_uri) { goProcessing(res); return; }
              const qr = res?.payment?.qr_uri;
              if (!qr) throw new Error("no qr");
              body.innerHTML = `
                <div class="pay-qr">
                  <img class="pay-qr-img" src="${esc(qr)}" alt="PromptPay QR" width="220" height="220">
                  <p class="pay-qr-hint">สแกน QR นี้ด้วยแอปธนาคารเพื่อชำระ ${esc(root.utils.formatBaht(o.amount))}</p>
                  <p class="pay-qr-wait" data-pp-wait>กำลังรอการชำระเงิน...</p>
                </div>`;
              startPolling(o.order.order_code, (status) => {
                if (status === "paid") goPaid();
                else { const w = body.querySelector("[data-pp-wait]"); if (w) w.textContent = "การชำระเงินไม่สำเร็จ กรุณาลองใหม่"; }
              });
            } catch (_) {
              showError("สร้าง QR ไม่สำเร็จ กรุณาลองใหม่");
              o.paymentInFlight = false;
              if (btn) { btn.disabled = false; btn.textContent = "สร้าง QR พร้อมเพย์"; }
            }
          });
        } else {
          body.querySelector("[data-card-pay]")?.addEventListener("click", async () => {
            if (o.paymentInFlight) return;
            clearError();
            const number = (body.querySelector("[data-card-number]")?.value || "").replace(/\s+/g, "");
            const exp = (body.querySelector("[data-card-exp]")?.value || "").trim();
            const cvc = (body.querySelector("[data-card-cvc]")?.value || "").trim();
            const holder = (body.querySelector("[data-card-name]")?.value || "").trim();
            const m = exp.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
            if (!number || !m || !cvc) { showError("กรุณากรอกข้อมูลบัตรให้ครบถ้วน"); return; }
            const btn = body.querySelector("[data-card-pay]");
            if (btn) { btn.disabled = true; btn.textContent = "กำลังชำระเงิน..."; }
            const reset = () => { if (btn) { btn.disabled = false; btn.textContent = "ชำระด้วยบัตร"; } };
            try {
              o.paymentInFlight = true;
              const Omise = await ensureOmiseJs(config.public_key);
              const token = await new Promise((resolve, reject) => {
                Omise.createToken("card", {
                  name: holder || o.name,
                  number,
                  expiration_month: m[1],
                  expiration_year: m[2].length === 2 ? `20${m[2]}` : m[2],
                  security_code: cvc,
                }, (statusCode, response) => {
                  if (statusCode === 200 && response && response.id) resolve(response.id);
                  else reject(new Error((response && response.message) || "tokenize failed"));
                });
              });
              const res = await root.api.payOrder(o.order.order_code, { method: "card", token });
              if (res?.order?.status === "paid") goPaid();
              else if (isProcessingResponse(res)) goProcessing(res);
              else { showError("การชำระเงินไม่สำเร็จ กรุณาตรวจสอบบัตรแล้วลองใหม่"); o.paymentInFlight = false; reset(); }
            } catch (err) {
              showError(err && err.message ? "ชำระเงินไม่สำเร็จ: " + err.message : "ชำระเงินไม่สำเร็จ กรุณาลองใหม่");
              o.paymentInFlight = false;
              reset();
            }
          });
        }
      };

      sheet.querySelectorAll("[data-pay-method]").forEach((b) =>
        b.addEventListener("click", () => renderMethod(b.getAttribute("data-pay-method")))
      );
      renderMethod((o.methods || []).includes("promptpay") ? "promptpay" : "card");
    };
    const qtyVal = mount.querySelector("[data-qty-val]");
    const totalEl = mount.querySelector("[data-buy-total]");
    const syncTotal = () => {
      if (qtyVal) qtyVal.textContent = String(qty);
      if (totalEl) totalEl.textContent = unitPrice === null ? "สอบถามราคา" : root.utils.formatBaht(unitPrice * qty);
    };
    bindClose();
    mount.querySelector("[data-qty-dec]")?.addEventListener("click", () => { qty = Math.max(1, qty - 1); syncTotal(); });
    mount.querySelector("[data-qty-inc]")?.addEventListener("click", () => { qty = Math.min(99, qty + 1); syncTotal(); });
    const submitBtn = mount.querySelector("[data-buy-submit]");
    submitBtn?.addEventListener("click", async () => {
      const name = (mount.querySelector("[data-buy-name]")?.value || "").trim();
      const phone = (mount.querySelector("[data-buy-phone]")?.value || "").trim();
      const errorEl = mount.querySelector("[data-buy-error]");
      if (!name || !phone) { if (errorEl) errorEl.hidden = false; return; }
      if (errorEl) errorEl.hidden = true;
      const delivery = mount.querySelector("input[name='cwf-delivery']:checked")?.value || "pickup";
      const install = mount.querySelector("input[name='cwf-install']:checked")?.value || "none";
      const address = (mount.querySelector("[data-buy-address]")?.value || "").trim();
      trackItemEvent("cwf_store_purchase_request", item, { qty, delivery, install });
      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังสร้างคำสั่งซื้อ...";
      let order = null;
      try {
        const res = await root.api.createOrder({
          customer_name: name,
          customer_phone: phone,
          delivery_method: delivery,
          install_option: install,
          address,
          items: [{ item_id: item.item_id, qty }],
        });
        order = res?.order || null;
      } catch (_error) {
        // Order couldn't be saved (offline / schema not ready) — fall through to
        // the LINE hand-off below so the sale isn't lost.
      }
      const sheet = mount.querySelector(".purchase-sheet");
      const amount = Number(order?.subtotal) || (unitPrice || 0) * qty;
      // Try online payment; gracefully fall back to the LINE hand-off when the
      // order didn't save or payment isn't configured on the server.
      let config = null;
      if (order && order.order_code) {
        try { config = await loadPaymentConfig(); } catch (_) { config = null; }
      }
      if (order && order.order_code && config && config.enabled) {
        renderPaymentStep({ order, qty, delivery, install, name, phone, amount }, config);
        return;
      }
      if (order?.order_code) root.state.updateDraft?.("tracking", { trackingCode: order.order_code });
      if (sheet) sheet.innerHTML = purchaseConfirmHtml(item, { qty, delivery, install, name, phone, orderCode: order?.order_code || "" });
      bindClose();
    });
    requestAnimationFrame(() => mount.querySelector(".contact-sheet-close")?.focus());
  }

  const store = {
    render(container) {
      filterState = { search: "", category: "", acType: "", washVariant: "", btu: "", queueToday: false, sort: "recommended" };
      filtersOpen = false;
      track("cwf_store_view", {});
      container.innerHTML = `
        <section class="screen store-screen">
          ${root.ui?.pageHeaderHtml ? root.ui.pageHeaderHtml("store") : ""}
          <div class="store-compact-header">
            <span class="store-compact-badge">ร้านค้า CWF</span>
            <h2>เลือกบริการและอุปกรณ์</h2>
          </div>
          <div data-store-body>${renderBody()}</div>
          <div data-contact-sheet-mount></div>
        </section>
      `;
      root.ui?.bindPageHeader?.(container);
      bindBody(container);
      ensureLoaded(container);
    },
    renderDetail(container) {
      const itemId = detailItemId();
      container.innerHTML = `
        <section class="screen store-detail-screen" data-store-detail-body>${renderDetailBody()}</section>
        <div data-contact-sheet-mount></div>
      `;
      bindDetailBody(container);
      const bucket = root.state.storeDetail;
      if (bucket.status === "idle" || String(bucket.itemId) !== String(itemId)) {
        loadDetail(container, itemId);
      }
    },
  };

  store.render.onLeave = () => {
    clearCardAutoplay();
  };
  store.renderDetail.onLeave = () => {
    clearDetailAutoplay();
  };

  store._test = { loadDetail, loadReviewsList, loadEligibility, detailItemId, renderDetailBody, renderReviewsSectionBody };

  root.store = store;
})();
