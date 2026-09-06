/* Issue #329: generic promotion-policy editor extension.
 * Loaded after admin-store-catalog.js so the stable catalog editor remains unchanged.
 */
(() => {
  "use strict";

  const originalEnsureBundleModal = ensureBundleModal;
  const originalRenderBundleVariantEditor = renderBundleVariantEditor;
  const originalNewBundleVariant = newBundleVariant;
  const originalOpenBundleModal = openBundleModal;

  function policyFieldHtml() {
    return `<div id="bm_promotion_policy_fields" class="asc-section">
      <div class="asc-section-title">นโยบายโปรโมชั่น</div>
      <div class="asc-grid2">
        <div class="asc-field"><label>วิธีคิดราคา *</label>
          <select id="bm_pricing_strategy">
            <option value="per_variant_tier">ราคาแยกตาม Variant</option>
            <option value="total_quantity_tier_plus_unit_modifiers">ราคารวมตามจำนวน + ส่วนเพิ่มต่อเครื่อง</option>
          </select>
        </div>
        <div class="asc-field"><label>รูปแบบการเลือกระดับ *</label>
          <select id="bm_selection_mode">
            <option value="multi_variant">เลือก Variant ร่วมกันได้</option>
            <option value="exclusive_level">เลือกได้ทีละระดับบริการ</option>
          </select>
        </div>
      </div>
      <div class="asc-grid2">
        <div class="asc-field"><label>จำนวนเครื่องสูงสุดต่อการซื้อ/จอง</label><input id="bm_maximum_total_quantity" type="number" min="1" max="99" step="1" placeholder="ไม่กำหนด"></div>
        <div class="asc-field"><label>รับประกันหลังปิดงาน (วัน)</label><input id="bm_warranty_days" type="number" min="1" max="3650" step="1" placeholder="ไม่กำหนด"></div>
      </div>
      <div class="asc-field"><label>รูปแบบการชำระเงิน *</label>
        <select id="bm_payment_mode">
          <option value="book_now">จองวันบริการทันที (Book now)</option>
          <option value="prepaid_full">ชำระเต็มจำนวน เก็บสิทธิ์ไว้ใช้ภายหลัง (Prepaid)</option>
        </select>
        <p class="muted2 mini">Prepaid ต้องมีวันหมดสิทธิ์และวันรับประกัน ระบบจะไม่อนุญาต policy ที่ข้อมูลไม่ครบ</p>
      </div>
    </div>`;
  }

  function ensurePolicyFields() {
    if (el("bm_promotion_policy_fields")) return;
    const minimum = el("bm_minimum_total_quantity");
    const anchor = minimum?.closest(".asc-field");
    if (!anchor) return;
    anchor.insertAdjacentHTML("afterend", policyFieldHtml());
  }

  ensureBundleModal = function ensureBundleModalWithPromotionPolicy() {
    originalEnsureBundleModal();
    ensurePolicyFields();
  };

  newBundleVariant = function newBundleVariantWithPromotionPolicy() {
    return {
      ...originalNewBundleVariant(),
      service_level_key: null,
      service_level_label: null,
      unit_price_modifier: "0.00",
    };
  };

  function appendVariantPolicyEditor(article, variant) {
    if (!article || article.querySelector("[data-promotion-variant-policy]")) return;
    const tierBlock = article.querySelector(".asc-bundle-tiers")?.previousElementSibling;
    const html = `<div data-promotion-variant-policy class="asc-section">
      <div class="asc-section-title">ระดับบริการ / ส่วนเพิ่มราคา</div>
      <div class="asc-grid2">
        <div class="asc-field"><label>Service level key</label><input data-variant-field="service_level_key" maxlength="80" placeholder="เช่น standard" value="${escapeHtml(variant.service_level_key || "")}"></div>
        <div class="asc-field"><label>ชื่อลูกค้าเห็น</label><input data-variant-field="service_level_label" maxlength="120" placeholder="เช่น STANDARD" value="${escapeHtml(variant.service_level_label || "")}"></div>
      </div>
      <div class="asc-field"><label>ส่วนเพิ่มราคาต่อเครื่อง (บาท)</label><input data-variant-field="unit_price_modifier" inputmode="decimal" placeholder="0.00" value="${escapeHtml(variant.unit_price_modifier == null ? "0.00" : variant.unit_price_modifier)}"><p class="muted2 mini">ตัวอย่าง 18,000 BTU +100/เครื่อง ให้ใส่ 100.00</p></div>
    </div>`;
    if (tierBlock) tierBlock.insertAdjacentHTML("beforebegin", html);
    else article.insertAdjacentHTML("beforeend", html);
  }

  renderBundleVariantEditor = function renderBundleVariantEditorWithPolicy() {
    originalRenderBundleVariantEditor();
    document.querySelectorAll("[data-bundle-variant-index]").forEach((article) => {
      const index = Number(article.dataset.bundleVariantIndex);
      appendVariantPolicyEditor(article, bundleVariantDrafts[index] || {});
    });
  };

  function optionalNumber(id) {
    const value = String(el(id)?.value || "").trim();
    return value === "" ? null : Number(value);
  }

  function loadParentPolicy(policy = {}) {
    ensurePolicyFields();
    el("bm_pricing_strategy").value = policy.pricing_strategy || "per_variant_tier";
    el("bm_selection_mode").value = policy.selection_mode || "multi_variant";
    el("bm_maximum_total_quantity").value = policy.maximum_total_quantity == null ? "" : String(policy.maximum_total_quantity);
    el("bm_payment_mode").value = policy.payment_mode || "book_now";
    el("bm_warranty_days").value = policy.warranty_days == null ? "" : String(policy.warranty_days);
  }

  openBundleModal = async function openBundleModalWithPromotionPolicy(bundleKey = null) {
    await originalOpenBundleModal(bundleKey);
    ensurePolicyFields();
    if (!bundleKey) {
      loadParentPolicy();
      bundleVariantDrafts = bundleVariantDrafts.map((variant) => ({
        ...variant,
        service_level_key: variant.service_level_key || null,
        service_level_label: variant.service_level_label || null,
        unit_price_modifier: variant.unit_price_modifier == null ? "0.00" : String(variant.unit_price_modifier),
      }));
      renderBundleVariantEditor();
      return;
    }
    try {
      const policy = await apiFetch(`/admin/catalog/service-package-bundles/${encodeURIComponent(bundleKey)}/promotion-policy`);
      loadParentPolicy(policy);
      const byKey = new Map((policy.variants || []).map((variant) => [variant.package_key, variant]));
      bundleVariantDrafts = bundleVariantDrafts.map((variant) => ({
        ...variant,
        ...(byKey.get(variant.package_key) || {}),
      }));
      renderBundleVariantEditor();
    } catch (error) {
      const box = el("bundle_modal_error");
      box.textContent = error?.message || "โหลดนโยบายโปรโมชั่นไม่สำเร็จ";
      box.style.display = "block";
    }
  };

  function promotionPolicyPayload(saved, desiredActive, desiredVisible) {
    const savedVariants = Array.isArray(saved?.variants) ? saved.variants : [];
    return {
      pricing_strategy: el("bm_pricing_strategy").value,
      selection_mode: el("bm_selection_mode").value,
      maximum_total_quantity: optionalNumber("bm_maximum_total_quantity"),
      payment_mode: el("bm_payment_mode").value,
      warranty_days: optionalNumber("bm_warranty_days"),
      is_active: desiredActive,
      is_customer_visible: desiredVisible,
      variants: savedVariants.map((savedVariant, index) => {
        const draft = bundleVariantDrafts.find((variant) => variant.package_key === savedVariant.package_key)
          || bundleVariantDrafts[index]
          || {};
        return {
          package_key: savedVariant.package_key,
          service_level_key: String(draft.service_level_key || "").trim() || null,
          service_level_label: String(draft.service_level_label || "").trim() || null,
          unit_price_modifier: String(draft.unit_price_modifier == null || draft.unit_price_modifier === "" ? "0.00" : draft.unit_price_modifier).trim(),
        };
      }),
    };
  }

  saveBundle = async function saveBundleWithPromotionPolicy() {
    if (isSaving) return;
    const box = el("bundle_modal_error");
    box.style.display = "none";
    isSaving = true;
    el("bundle_modal_save").disabled = true;
    try {
      const payload = bundlePayload();
      const desiredActive = payload.is_active;
      const desiredVisible = payload.is_customer_visible;
      // Fail closed: the parent stays hidden until the policy write succeeds.
      payload.is_active = false;
      payload.is_customer_visible = false;
      const url = editingBundleKey
        ? `/admin/catalog/service-package-bundles/${encodeURIComponent(editingBundleKey)}`
        : "/admin/catalog/service-package-bundles";
      const saved = await apiFetch(url, {
        method: editingBundleKey ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      const bundleKey = saved.service_bundle_key || editingBundleKey;
      if (!bundleKey) throw new Error("ระบบไม่ได้ส่งรหัสโปรโมชั่นกลับมา กรุณารีเฟรชและลองใหม่");

      await apiFetch(`/admin/catalog/service-package-bundles/${encodeURIComponent(bundleKey)}/promotion-policy`, {
        method: "PATCH",
        body: JSON.stringify(promotionPolicyPayload(saved, desiredActive, desiredVisible)),
      });

      const files = Array.from(el("bm_images")?.files || []);
      for (const file of files) {
        const formData = new FormData();
        formData.append("image", file);
        await apiFetch(`/admin/catalog/items/${saved.item_id}/images`, { method: "POST", body: formData });
      }
      el("bundle_modal_backdrop").classList.add("hidden");
      await Promise.all([loadServicePackages(), loadCatalogItems()]);
      showToast("บันทึกโปรโมชั่นและนโยบายราคาแล้ว", "success");
    } catch (error) {
      box.textContent = error?.message || "บันทึกโปรโมชั่นไม่สำเร็จ ระบบคงรายการไว้ในสถานะซ่อนเพื่อความปลอดภัย";
      box.style.display = "block";
    } finally {
      isSaving = false;
      el("bundle_modal_save").disabled = false;
    }
  };
})();
