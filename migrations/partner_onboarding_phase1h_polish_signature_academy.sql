-- CWF Partner Onboarding polish: agreement signature, academy video gating, real contract seed
-- Safe to run multiple times.

ALTER TABLE public.agreement_signatures
ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

ALTER TABLE public.academy_lessons
ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.academy_lessons
ADD COLUMN IF NOT EXISTS min_watch_seconds INT NOT NULL DEFAULT 60;

ALTER TABLE public.academy_progress
ADD COLUMN IF NOT EXISTS watched_seconds INT NOT NULL DEFAULT 0;

UPDATE public.academy_lessons
SET min_watch_seconds = 60
WHERE min_watch_seconds IS NULL OR min_watch_seconds < 60;

INSERT INTO public.agreement_templates(template_code, version, title, body_text, content_html, source_note, is_active)
VALUES(
  'partner_standard',
  2,
  'CWF สัญญาพาร์ทเนอร์ช่างแอร์ ฉบับใช้งานจริง',
  'CWF สัญญาพาร์ทเนอร์ช่างแอร์ ฉบับใช้งานจริง - จัดรูปแบบจากเอกสาร PDF สำหรับใช้ในระบบ',
  '<h2>สัญญาพาร์ทเนอร์ช่างแอร์ Coldwindflow Air Services</h2><p>ฉบับใช้งานจริงสำหรับงานล้าง / ซ่อม / ติดตั้งแอร์แบบพาร์ทเนอร์</p><h3>เรทค่าตอบแทนพาร์ทเนอร์แบบขั้นบันได</h3><table class="contract-rate-table"><thead><tr><th>ประเภทงาน</th><th>ขนาด BTU</th><th>เครื่องที่ 1</th><th>เครื่องที่ 2-3</th><th>เครื่องที่ 4+</th></tr></thead><tbody><tr><td>ล้างปกติ</td><td>ไม่เกิน 12,000</td><td>400</td><td>350</td><td>320</td></tr><tr><td>ล้างปกติ</td><td>18,000 ขึ้นไป</td><td>450</td><td>400</td><td>350</td></tr><tr><td>ล้างพรีเมียม</td><td>ไม่เกิน 12,000</td><td>550</td><td>500</td><td>450</td></tr><tr><td>ล้างพรีเมียม</td><td>18,000 ขึ้นไป</td><td>700</td><td>650</td><td>600</td></tr><tr><td>แขวนคอยล์</td><td>ไม่เกิน 12,000</td><td>850</td><td>800</td><td>750</td></tr><tr><td>แขวนคอยล์</td><td>18,000 ขึ้นไป</td><td>1,050</td><td>1,000</td><td>950</td></tr><tr><td>ตัดล้างใหญ่</td><td>ไม่เกิน 12,000</td><td>1,200</td><td>1,100</td><td>1,000</td></tr><tr><td>ตัดล้างใหญ่</td><td>18,000 ขึ้นไป</td><td>1,450</td><td>1,350</td><td>1,250</td></tr></tbody></table><h3>เงื่อนไขสำคัญ</h3><ul><li>ต้องปฏิบัติตามมาตรฐานงาน CWF</li><li>ห้ามรับเงินนอกระบบและห้ามเปลี่ยนราคาเอง</li><li>เงินประกันความเสียหาย 5,000 บาท หักตามรอบที่ตกลง</li><li>บริษัทมีสิทธิระงับหรือยุติสิทธิ์เมื่อผิดเงื่อนไข</li></ul>',
  'IMPORTED_FROM_CWF_PARTNER_CONTRACT_PDF_STRUCTURED_V2',
  TRUE
)
ON CONFLICT(template_code, version) DO UPDATE SET
  title=EXCLUDED.title,
  body_text=EXCLUDED.body_text,
  content_html=EXCLUDED.content_html,
  source_note=EXCLUDED.source_note,
  is_active=TRUE,
  updated_at=NOW();
