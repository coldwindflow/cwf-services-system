(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.availability = {
    // Phase 2 will call api.loadAvailability() and render real technician slots.
    renderSlotPlaceholder() {
      return `
        <section class="card">
          <h2>เวลาว่าง</h2>
          <p class="muted">Phase 2 จะเชื่อมต่อ /public/availability_v2 เพื่อแสดงเวลาที่มีช่างว่างจริง</p>
        </section>
      `;
    },
  };
})();
