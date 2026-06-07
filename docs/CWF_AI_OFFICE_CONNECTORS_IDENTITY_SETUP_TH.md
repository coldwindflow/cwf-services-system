# CWF AI Office Connectors + LINE Customer Identity v2

เป้าหมาย: ทำให้ AI Office ใช้ข้อมูลจริงจาก CWF DB, LINE OA, Google Ads, GitHub และ Render แบบ read-only/draft-only และทำให้ระบบรู้ว่า LINE chat คนไหนผูกกับลูกค้าคนไหนใน CWF ผ่านเบอร์/เลขงาน/แอดมินยืนยัน

## สิ่งที่ระบบเพิ่ม

- LINE webhook รับแชทจริงเข้า `line_conversations` และ `line_messages`
- Identity Resolver หาเบอร์/เลขงานจากข้อความ LINE แล้วเสนอ candidate จากงานจริง
- ตาราง `line_customer_links` สำหรับผูก LINE userId กับลูกค้า/เบอร์/ใบงานจริง
- Google Ads OAuth + sync search term report เข้า DB
- GitHub read-only status สำหรับ Dev AI
- Render read-only status สำหรับ Dev AI
- `/ask` ได้ connector context ตามตัวละคร

## วิธีติดตั้ง

```bash
bash cwf-ai-office-connectors-identity-v2/tools/apply-ai-office-connectors-identity-v2.sh .
psql "$DATABASE_URL" -f migrations/20260607_ai_office_identity_and_connectors_v2.sql
```

commit แล้ว deploy Render

## Routes สำคัญ

- `GET /admin/ai-office/connectors/status`
- `GET /admin/ai-office/line/conversations/:id/identity`
- `POST /admin/ai-office/line/conversations/:id/link-customer`
- `GET /admin/ai-office/line/conversations/:id/context`
- `GET /admin/ai-office/google-ads/auth`
- `GET /admin/ai-office/google-ads/callback`
- `POST /admin/ai-office/google-ads/sync`
- `GET /admin/ai-office/google-ads/report`
- `GET /admin/ai-office/dev/github/status`
- `GET /admin/ai-office/dev/render/status`

## Render env ที่ต้องตั้ง

### LINE OA

```env
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
```

LINE Developers > Messaging API > Webhook URL:

```text
https://app.cwf-air.com/line/webhook
```

เปิด Use webhook

### Google Ads

```env
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_LOGIN_CUSTOMER_ID=...
GOOGLE_ADS_CUSTOMER_ID=...
GOOGLE_ADS_REDIRECT_URI=https://app.cwf-air.com/admin/ai-office/google-ads/callback
GOOGLE_ADS_API_VERSION=v24
```

หลัง deploy เปิด:

```text
/admin/ai-office/google-ads/auth
```

แล้ว login Google Ads เพื่อรับ refresh token

จากนั้น sync:

```bash
curl -X POST https://app.cwf-air.com/admin/ai-office/google-ads/sync
```

หรือกดผ่าน admin session/browser/dev tool ตามความเหมาะสม

### GitHub

```env
GITHUB_TOKEN=...
GITHUB_REPO_FULL_NAME=coldwindflow/cwf-services-system
```

แนะนำ token แบบ read-only: Contents read, Metadata read, Pull requests read

### Render

```env
RENDER_API_KEY=...
RENDER_SERVICE_ID=...
```

### OpenAI

```env
OPENAI_API_KEY=...
AI_OFFICE_MODEL=gpt-4.1-mini
```

### PIN

ให้ลบหรือปล่อยว่าง:

```env
AI_OFFICE_ACCESS_PIN=
```

เพราะ AI Office อยู่หลัง admin login แล้ว

## วิธีผูก LINE กับลูกค้า

1. ให้ลูกค้าทัก LINE OA หลังเปิด webhook
2. เปิด API identity ของ conversation นั้น:
   `/admin/ai-office/line/conversations/{id}/identity`
3. ระบบจะเสนอ candidate จากเบอร์/เลขงานในแชท
4. แอดมินยืนยันด้วย `POST /admin/ai-office/line/conversations/{id}/link-customer`
5. ครั้งต่อไป AI จะรู้ว่า LINE userId นี้ผูกกับลูกค้า/เบอร์/งานไหน

## ข้อห้าม Phase 1

- AI ห้ามส่ง LINE เอง
- AI ห้ามสร้างงานเอง
- AI ห้ามแก้งานเอง
- AI ห้ามเปลี่ยนสถานะ
- AI ห้ามปรับ Google Ads เอง
- Dev AI ห้าม merge/deploy เอง
- ห้ามส่งข้อมูลลูกค้าออกไปค้นเว็บภายนอก
