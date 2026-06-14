(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.availability = {
    // Phase 2 will call api.loadAvailability() and render real technician slots.
    renderSlotPlaceholder() {
      return `
        <section class="card">
          <h2>เวลาว่างของช่าง</h2>
          <p class="muted">ลูกค้าจะเลือกวันและเวลาที่มีช่างพร้อมให้บริการ</p>
        </section>
      `;
    },
  };
})();
