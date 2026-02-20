# cwf-services-system
CWF (Coldwindflow) air service management system for admin and technicians

## Cloudinary Storage (Photos)

ระบบรูปหน้างานรองรับ 2 โหมด:

1) **Cloudinary (แนะนำ)** — ถ้าตั้ง ENV ครบ ระบบจะอัปโหลดรูปขึ้น Cloudinary และเก็บ URL แบบ https

ตั้งค่า ENV บน Render:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

2) **Fallback Local (/uploads)** — ถ้าไม่ตั้ง ENV ครบ ระบบจะเซฟรูปไว้ที่ `/uploads` (ไม่แนะนำบน Render)
