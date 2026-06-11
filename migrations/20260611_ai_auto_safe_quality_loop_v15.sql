-- CWF AI Office V15 - Auto Safe Reply Quality Loop
-- แอดมิน feedback คำตอบที่ AI ส่งเอง และให้ระบบใช้ feedback กันการตอบซ้ำที่ไม่ดี

CREATE TABLE IF NOT EXISTS public.ai_auto_safe_quality_feedback (
  id BIGSERIAL PRIMARY KEY,
  log_id BIGINT NULL,
  conversation_id BIGINT NULL,
  line_user_id TEXT NULL,
  customer_message TEXT NOT NULL DEFAULT '',
  reply_text TEXT NOT NULL DEFAULT '',
  feedback_type TEXT NOT NULL DEFAULT 'bad',
  reason TEXT NULL,
  admin_note TEXT NULL,
  created_by TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_quality_feedback_log
  ON public.ai_auto_safe_quality_feedback(log_id);
CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_quality_feedback_conv
  ON public.ai_auto_safe_quality_feedback(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_quality_feedback_type_created
  ON public.ai_auto_safe_quality_feedback(feedback_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_auto_safe_learning_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_type TEXT NOT NULL DEFAULT 'similar_customer_message',
  phrase TEXT NULL,
  intent TEXT NULL,
  action TEXT NOT NULL DEFAULT 'block_auto_safe',
  reason TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_feedback_id BIGINT NULL,
  created_by TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_learning_rules_active
  ON public.ai_auto_safe_learning_rules(is_active, rule_type);

ALTER TABLE public.ai_auto_safe_reply_logs
  ADD COLUMN IF NOT EXISTS quality_status TEXT NULL;
ALTER TABLE public.ai_auto_safe_reply_logs
  ADD COLUMN IF NOT EXISTS feedback_reason TEXT NULL;

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
('auto_safe_quality_guard_enabled','reply','เรียนรู้จาก feedback ก่อนส่งเอง','กัน AI ส่งเองซ้ำในแนวคำถามที่แอดมินเคยบอกว่าไม่ดีหรือผิด','true'::jsonb,false),
('auto_safe_negative_feedback_threshold','reply','จำนวน feedback ลบก่อนบล็อกแนวตอบ','ถ้าแนวคำถาม/intent นี้โดน feedback ลบครบจำนวนนี้ จะกันไม่ให้ Auto Safe ส่งเอง','2'::jsonb,false),
('auto_safe_negative_feedback_window_days','reply','ช่วงวันย้อนหลังของ feedback ลบ','ใช้ feedback ลบย้อนหลังตามจำนวนวันนี้เพื่อคุม Auto Safe','14'::jsonb,false),
('auto_safe_auto_pause_on_bad_feedback','reply','พักแชทอัตโนมัติเมื่อ feedback ลบ','เมื่อแอดมินกดว่าคำตอบ Auto Safe ไม่ดี ให้พัก AI เฉพาะแชทนั้นทันที','true'::jsonb,false),
('auto_safe_auto_pause_minutes','reply','เวลาพักแชทหลัง feedback ลบ','จำนวน นาที ที่พัก AI ตอบเองเฉพาะแชทหลังแอดมินให้ feedback ลบ','1440'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked;
