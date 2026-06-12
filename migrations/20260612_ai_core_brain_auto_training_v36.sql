-- CWF AI Office v36 Shared Core Brain + Auto Internal Training
-- Additive-only migration. Does not touch jobs/customers/payments/auth.
-- Goal: one shared CWF Core Brain for every customer-facing AI agent, plus internal auto-draft training queue.

CREATE TABLE IF NOT EXISTS public.ai_training_auto_answers (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NULL,
  line_user_id TEXT NULL,
  line_message_id TEXT NULL,
  line_message_pk BIGINT NULL,
  customer_message TEXT NOT NULL DEFAULT '',
  ai_reply TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 0,
  intent TEXT NOT NULL DEFAULT 'general',
  situation_type TEXT NOT NULL DEFAULT 'general',
  service_type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_review',
  source TEXT NOT NULL DEFAULT 'brain_v2_auto_training',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_training_auto_answers_line_message_id
  ON public.ai_training_auto_answers(line_message_id)
  WHERE line_message_id IS NOT NULL AND line_message_id <> '';

CREATE INDEX IF NOT EXISTS idx_ai_training_auto_answers_status_created
  ON public.ai_training_auto_answers(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_training_auto_answers_conversation
  ON public.ai_training_auto_answers(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_training_conversation_settings (
  conversation_id BIGINT PRIMARY KEY,
  line_user_id TEXT NULL,
  mode TEXT NOT NULL DEFAULT 'inherit',
  auto_internal_answer_enabled BOOLEAN NULL,
  updated_by TEXT NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_training_conversation_settings_mode
  ON public.ai_training_conversation_settings(mode);

CREATE TABLE IF NOT EXISTS public.ai_office_control_settings (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'main',
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  locked BOOLEAN NOT NULL DEFAULT false,
  updated_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
  ('auto_internal_training_enabled', 'training', 'Auto Training ภายใน', 'เปิดให้ระบบสร้างคำตอบ AI ภายในทันทีเมื่อข้อความ LINE ลูกค้าเข้า ยังไม่ส่งหาลูกค้าจริง', 'false'::jsonb, false),
  ('auto_internal_training_auto_answer', 'training', 'Auto ตอบภายในเมื่อ LINE เข้า', 'เมื่อลูกค้าส่งข้อความ ให้ AI ร่างคำตอบไว้ใน Training Queue อัตโนมัติ เพื่อให้แอดมินมากดถูก/ไม่ถูก/สอนเพิ่ม', 'false'::jsonb, false),
  ('auto_internal_training_learn_to_core_brain', 'training', 'บันทึกบทเรียนเข้าคลังสมองกลาง', 'เมื่อแอดมินกดถูกหรือสอนคำตอบ ให้บันทึกเป็นความรู้กลางที่ทุก Agent ใช้ร่วมกัน', 'true'::jsonb, false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked;

-- Document shared-brain learning sources. ai_brain_items itself is created by 20260609_ai_brain_items_v30.sql.
COMMENT ON TABLE public.ai_training_auto_answers IS 'Internal-only AI drafts generated from inbound LINE messages for admin training review. Does not send LINE.';
COMMENT ON TABLE public.ai_training_conversation_settings IS 'Per-LINE-conversation override for Auto Internal Training: inherit/on/off.';
