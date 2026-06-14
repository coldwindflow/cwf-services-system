(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.pricing = {
    // Phase 2 will call api.previewPricing() and render backend-calculated pricing.
    renderEstimatePlaceholder() {
      return `
        <section class="card">
          <h2>ประเมินราคา</h2>
          <p class="muted">Phase 2 จะเชื่อมต่อ /public/pricing_preview เพื่อใช้ราคาจาก backend เท่านั้น</p>
        </section>
      `;
    },
  };
})();
