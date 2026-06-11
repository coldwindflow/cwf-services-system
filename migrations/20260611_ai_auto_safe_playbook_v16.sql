-- V16: Safe Reply Playbook for Auto Safe LINE Reply
-- Approved, low-risk response templates used before any generated draft.

CREATE TABLE IF NOT EXISTS public.ai_auto_safe_reply_playbooks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT 'unknown',
  language TEXT NOT NULL DEFAULT 'th',
  trigger_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_text TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_playbooks_title_intent_unique
  ON public.ai_auto_safe_reply_playbooks(title, intent);

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_playbooks_active_intent
  ON public.ai_auto_safe_reply_playbooks(is_active, intent, priority);

ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS playbook_id BIGINT NULL;
ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS playbook_title TEXT NULL;

INSERT INTO public.ai_auto_safe_reply_playbooks(title,intent,language,trigger_phrases,response_text,risk_level,priority,is_active,approved_by,approved_at,metadata)
VALUES
('ราคาโปรล้างแอร์ผนัง','price_question','th','["ราคา","กี่บาท","เท่าไหร่","โปร","ล้างปกติ","ล้างพรีเมียม","price","cost"]'::jsonb,
'ได้ค่ะ ราคาโปรตอนนี้สำหรับแอร์ผนังมีดังนี้นะคะ

แอร์ผนังไม่เกิน 12,000 BTU
• ล้างปกติ 550 บาท
• ล้างพรีเมียม 790 บาท
• ล้างแบบแขวนคอยล์ 1,290 บาท
• ตัดล้างใหญ่ 1,850 บาท

แอร์ผนัง 18,000 BTU ขึ้นไป
• ล้างปกติ 690 บาท
• ล้างพรีเมียม 990 บาท
• ล้างแบบแขวนคอยล์ 1,550 บาท
• ตัดล้างใหญ่ 2,150 บาท

ราคาจะขึ้นอยู่กับขนาด BTU และจำนวนเครื่องค่ะ ขอทราบจำนวนเครื่อง ขนาด BTU และพื้นที่หน้างานได้ไหมคะ',
'LOW',10,true,'system_seed',NOW(),'{}'::jsonb),
('พื้นที่บริการหลัก','area_question','th','["พื้นที่","ไปไหม","รับงาน","โซน","บางนา","อ่อนนุช","พระโขนง","พระราม 3","บางพลี","สุขุมวิท","สำโรง","ลาซาล","ยานนาวา"]'::jsonb,
'รับงานค่ะ พื้นที่หลักของ Coldwindflow มีโซนพระโขนง บางจาก อ่อนนุช ปุณณวิถี อุดมสุข บางนา แบริ่ง สำโรง ลาซาล สุขุมวิทตอนปลาย พระราม 3 ยานนาวา บางคอแหลม สาธุประดิษฐ์ เจริญกรุง ช่องนนทรี และบางพลีค่ะ

ขอโลเคชั่นหรือชื่อคอนโด/หมู่บ้านหน้างานได้ไหมคะ เดี๋ยวแอดมินเช็กคิวและระยะทางให้ค่ะ',
'LOW',20,true,'system_seed',NOW(),'{}'::jsonb),
('อธิบายความต่างบริการล้าง','service_explain','th','["ต่างกัน","แบบไหนดี","พรีเมียม","แขวนคอยล์","ตัดล้าง","ล้างใหญ่","ล้างปกติ"]'::jsonb,
'ได้ค่ะ โดยสรุปงานล้างมีหลายระดับนะคะ

• ล้างปกติ: ล้างฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และฉีดท่อน้ำทิ้ง
• ล้างพรีเมียม: ละเอียดขึ้น ถอดรางน้ำทิ้ง/โพรงกระรอกตามหน้างาน และทำความสะอาดลึกกว่า
• ล้างแบบแขวนคอยล์: ถอดแผงไฟและถาดหลัง ทำความสะอาดละเอียดมากขึ้น
• ตัดล้างใหญ่: ถอดล้างทั้งตัว เหมาะกับเครื่องสกปรกหนักหรือไม่เคยล้างละเอียดนานแล้วค่ะ

ถ้าลูกค้าแจ้งอาการหรือส่งรูปเครื่องมา แอดมินช่วยแนะนำแบบที่เหมาะให้ได้ค่ะ',
'LOW',30,true,'system_seed',NOW(),'{}'::jsonb),
('ทักทายและขอข้อมูลเบื้องต้น','general_greeting','th','["สวัสดี","สอบถาม","สนใจ","hello","hi"]'::jsonb,
'สวัสดีค่ะ Coldwindflow Air Services ยินดีให้บริการค่ะ

สอบถามงานล้างแอร์ ซ่อมแอร์ ติดตั้ง หรือตรวจเช็คแอร์ได้เลยนะคะ ขอทราบพื้นที่หน้างานและรายละเอียดเบื้องต้นได้ไหมคะ',
'LOW',40,true,'system_seed',NOW(),'{}'::jsonb)
ON CONFLICT (title, intent) DO NOTHING;

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
('auto_safe_playbook_enabled','reply','ใช้ Playbook ที่อนุมัติแล้วก่อน AI ร่างเอง','ให้ Auto Safe Reply ใช้คำตอบที่ผ่านการอนุมัติแล้วสำหรับราคา พื้นที่บริการ และคำอธิบายแพ็กเกจ เพื่อลดการตอบเพี้ยน','true'::jsonb,false),
('auto_safe_playbook_required','reply','ส่งเองเฉพาะเมื่อมี Playbook ตรงเคส','ถ้าเปิด AI จะส่ง LINE เองเฉพาะคำถามที่ match playbook ที่อนุมัติแล้ว ถ้าไม่ match จะกันไว้ให้แอดมิน','true'::jsonb,false),
('auto_safe_playbook_seed_enabled','reply','เปิดชุด Playbook หลักของ CWF','เปิดชุดคำตอบหลักที่ seed จากข้อมูลธุรกิจ CWF เช่น ราคา พื้นที่ และความต่างบริการ','true'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked;
