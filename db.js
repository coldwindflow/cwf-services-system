// db.js
// หน้าที่: เชื่อมต่อ PostgreSQL บน Render (บังคับใช้ ENV + SSL)

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,                  // dpg-xxxx
  port: Number(process.env.DB_PORT || 5432),  // 5432
  user: process.env.DB_USER,                  // cwfdb
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // ✅ บังคับ timezone ทุก session ให้ตรงกับธุรกิจที่ใช้ในไทย
  // ทำให้การ cast / เปรียบเทียบ timestamp (รวมถึงการกันชนคิว) ไปในทางเดียวกันทั้งระบบ
  // หมายเหตุ: pg รองรับ options แบบ libpq
  options: "-c timezone=Asia/Bangkok",

  // ⭐ จำเป็นมากสำหรับ Render
  ssl: {
    rejectUnauthorized: false,
  },
});

// log ให้เห็นใน Render Logs ว่าใช้ค่าอะไรจริง
console.log("✅ DB CONFIG", {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  db: process.env.DB_NAME,
  user: process.env.DB_USER,
});

module.exports = pool;


