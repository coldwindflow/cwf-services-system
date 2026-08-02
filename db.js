// db.js
// หน้าที่: เชื่อมต่อ PostgreSQL ผ่าน ENV และรองรับทั้ง Render กับ Docker ภายในบ้าน

const { Pool } = require("pg");

const sslSetting = String(process.env.DB_SSL || "").trim().toLowerCase();
const useSsl =
  sslSetting === "true" ||
  (sslSetting !== "false" && Boolean(process.env.DATABASE_URL));

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
  ...connectionConfig,

  // บังคับ timezone ทุก session ให้ตรงกับธุรกิจที่ใช้ในไทย
  options: "-c timezone=Asia/Bangkok",
});

console.log("DB CONFIG", {
  host: process.env.DB_HOST || "DATABASE_URL",
  port: process.env.DB_PORT || 5432,
  db: process.env.DB_NAME || "from DATABASE_URL",
  user: process.env.DB_USER || "from DATABASE_URL",
  ssl: useSsl,
});

module.exports = pool;
