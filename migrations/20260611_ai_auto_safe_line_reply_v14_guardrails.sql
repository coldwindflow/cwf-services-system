-- CWF AI Office V14 - Auto Safe LINE Reply Guardrails
-- Adds per-conversation pause and stricter configurable Auto Safe controls.

CREATE TABLE IF NOT EXISTS public.ai_auto_safe_conversation_pauses (
  conversation_id BIGINT PRIMARY KEY,
  line_user_id TEXT NULL,
  paused_until TIMESTAMPTZ NOT NULL,
  paused_by TEXT NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_conversation_pauses_until
  ON public.ai_auto_safe_conversation_pauses(paused_until);

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked) VALUES
('auto_safe_reply_confidence_threshold','reply','คะแนนมั่นใจขั้นต่ำก่อนส่งเอง','AI จะส่งเองเฉพาะคำถามที่ผ่านเกณฑ์ความมั่นใจนี้ขึ้นไป','85'::jsonb,false),
('auto_safe_human_takeover_minutes','reply','พักอัตโนมัติหลังแอดมินตอบเอง','ถ้าแอดมินเพิ่งตอบลูกค้าในแชทนั้น ให้ AI หยุดตอบเองตามจำนวนนาทีนี้','60'::jsonb,false),
('auto_safe_reply_quiet_hours_enabled','reply','งด AI ตอบเองนอกเวลาที่กำหนด','เปิดเพื่อกัน AI ส่ง LINE เองช่วงดึกหรือช่วงที่ไม่ต้องการ','false'::jsonb,false),
('auto_safe_reply_quiet_start','reply','เริ่มงดตอบเอง','เวลาเริ่มงด AI ตอบเอง รูปแบบ HH:mm ตามเวลาไทย','"22:00"'::jsonb,false),
('auto_safe_reply_quiet_end','reply','สิ้นสุดงดตอบเอง','เวลาสิ้นสุดงด AI ตอบเอง รูปแบบ HH:mm ตามเวลาไทย','"08:00"'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked;
