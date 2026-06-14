(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  root.services = {
    primaryActions: [
      { route: "booking", title: "จองบริการ", copy: "เริ่มเลือกประเภทงานและเวลาที่สะดวก" },
      { route: "tracking", title: "ติดตามงาน", copy: "ดูสถานะจากเลข Booking หรือ token" },
      { route: "profile", title: "โทร / LINE หา CWF", copy: "ช่องทางช่วยเหลืออยู่ในหน้าโปรไฟล์" },
    ],
    serviceTypes: [
      "ล้างแอร์",
      "ซ่อมแอร์",
      "ติดตั้งแอร์",
      "ตรวจอาการ / ปรึกษา",
    ],
    scheduledSteps: [
      { title: "เลือกบริการ / อาการ", copy: "เลือกประเภทงานและปัญหาหลักของแอร์" },
      { title: "รายละเอียดแอร์", copy: "ระบุชนิดแอร์ BTU จำนวนเครื่อง และวิธีล้างถ้ามี" },
      { title: "ที่อยู่ / แผนที่", copy: "เตรียมที่อยู่หน้างานและลิงก์ Google Maps" },
      { title: "วันและเวลาว่าง", copy: "Phase 2 จะโหลดเวลาที่มีช่างว่างจาก API จริง" },
      { title: "ประเมินราคา", copy: "Phase 2 จะเรียก pricing preview จาก backend" },
      { title: "ตรวจสอบก่อนส่ง", copy: "ปุ่มส่งจริงถูกปิดใน Phase 1" },
    ],
    urgentSteps: [
      { title: "เลือกอาการด่วน", copy: "เก็บอาการที่ต้องการให้พาร์ทเนอร์ประเมินเร็ว" },
      { title: "ที่อยู่ / แผนที่", copy: "ใช้เพื่อคัดพาร์ทเนอร์ช่างในพื้นที่ลูกค้า" },
      { title: "รูป / วิดีโอ", copy: "Placeholder สำหรับแนบหลักฐานใน Phase ถัดไป" },
      { title: "ส่งคำขอคิวด่วน", copy: "Phase 1 ไม่ยิงงานจริงและไม่แตะ urgent dispatch" },
      { title: "Waiting Room", copy: "แสดงการรอช่างพาร์ทเนอร์กดรับงาน" },
      { title: "Admin Fallback", copy: "ถ้าไม่มีพาร์ทเนอร์รับ แอดมินช่วยจัดคิวหรือแปลงเป็นจองล่วงหน้า" },
    ],
  };
})();
