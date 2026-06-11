-- CWF AI Office V13: Auto Safe LINE Reply
-- เปิดให้ AI ส่ง LINE เองเฉพาะคำถามความเสี่ยงต่ำ พร้อม log / cooldown / daily limit

CREATE TABLE IF NOT EXISTS public.ai_auto_safe_reply_logs (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NULL,
  line_user_id TEXT NULL,
  message_id TEXT NULL,
  customer_message TEXT NOT NULL DEFAULT '',
  reply_text TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT 'unknown',
  decision TEXT NOT NULL DEFAULT 'BLOCKED',
  risk_label TEXT NOT NULL DEFAULT 'MEDIUM',
  confidence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'skipped',
  skipped_reason TEXT NULL,
  line_response TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_message_id_unique
  ON public.ai_auto_safe_reply_logs(message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_conversation_created
  ON public.ai_auto_safe_reply_logs(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_status_created
  ON public.ai_auto_safe_reply_logs(status, created_at DESC);

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
('auto_safe_reply_send_enabled','reply','AI ส่ง LINE เองเฉพาะคำถามปลอดภัย','เปิดให้ AI ส่ง LINE เองเฉพาะคำถามความเสี่ยงต่ำ เช่น ราคา พื้นที่บริการ อธิบายบริการ และทักทายทั่วไป','false'::jsonb,false),
('auto_safe_reply_cooldown_minutes','reply','พักก่อนตอบซ้ำอัตโนมัติ','จำนวน นาที ที่ต้องเว้นก่อน AI ตอบเองซ้ำในแชทเดิม','15'::jsonb,false),
('auto_safe_reply_daily_limit','reply','จำนวนตอบเองสูงสุดต่อแชทต่อวัน','กัน AI ตอบเองถี่เกินไปในแชทเดียว','5'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked,
  updated_at=NOW();

UPDATE public.ai_office_control_settings
   SET locked=false,
       description='เปิดให้ AI ส่ง LINE เองเฉพาะคำถามความเสี่ยงต่ำ เช่น ราคา พื้นที่บริการ อธิบายบริการ และทักทายทั่วไป',
       updated_at=NOW()
 WHERE key='auto_safe_reply_send_enabled';

-- ยังล็อกการส่งเองแบบทุกเคสไว้เหมือนเดิม
UPDATE public.ai_office_control_settings
   SET value='false'::jsonb,
       locked=true,
       updated_at=NOW()
 WHERE key='auto_send_line_enabled';
