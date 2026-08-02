# FindFix Server Control — Mobile Prototype

ต้นแบบหน้าจอจัดการ Home Server สำหรับบริษัทแม่ **FindFix** โดยแยกไว้ใน branch `findfix-server-manager-demo` เพื่อไม่แตะระบบ Production ของ CWF

## เปิดตัวอย่างบนมือถือ

- [เปิดตัวอย่างแบบโต้ตอบ](https://raw.githack.com/coldwindflow/cwf-services-system/findfix-server-manager-demo/prototypes/findfix-server-manager/index.html)
- [ดูไฟล์ใน GitHub](https://github.com/coldwindflow/cwf-services-system/tree/findfix-server-manager-demo/prototypes/findfix-server-manager)

> ข้อมูล CPU, RAM, Container, Deploy และ Backup ในหน้านี้เป็นข้อมูลจำลองสำหรับตรวจหน้าตาและการใช้งานบนมือถือ

## หน้าที่มีในต้นแบบ

- ภาพรวม CPU, RAM, NVMe และ Uptime
- รายการบริการ CWF, PostgreSQL, AI Office/n8n และ Cloudflare Tunnel
- ปุ่ม Deploy, Restart, Logs และ Backup แบบจำลอง
- Deploy progress และ Build log
- รายการไฟล์ Backup
- ตั้งค่า Auto Start, Auto Deploy, Auto Rollback และ LINE Alert
- Responsive สำหรับมือถือและหน้าจอ Desktop

## ขั้นต่อไป

เชื่อม UI นี้เข้ากับ FindFix Server Agent ที่รันใน Ubuntu VM เพื่ออ่านสถานะ Docker, system metrics, GitHub deploy, PostgreSQL backup และ Cloudflare Tunnel จากเครื่องจริง
