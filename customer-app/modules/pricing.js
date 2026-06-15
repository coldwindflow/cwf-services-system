(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.pricing = {
    // Phase 2 will call api.previewPricing() and render backend-calculated pricing.
    renderEstimatePlaceholder() {
      return `
        <section class="card">
          <h2>ประเมินราคา</h2>
          <p class="muted">ลูกค้าจะเห็นราคาประมาณการก่อนยืนยันการจอง</p>
        </section>
      `;
    },
  };
})();
