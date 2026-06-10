-- CWF AI Office Approval Queue v7
-- Adds admin approval workflow for AI-drafted LINE replies.
-- This does not enable AI auto-send. LINE send is only available when admin_approved_line_send_enabled is explicitly enabled and an admin clicks send.

CREATE TABLE IF NOT EXISTS public.ai_auto_reply_approvals (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NULL,
  line_user_id TEXT NULL,
  line_display_name TEXT NULL,
  customer_message TEXT NULL,
  ai_draft TEXT NOT NULL DEFAULT '',
  final_reply TEXT NOT NULL DEFAULT '',
  risk_label TEXT NOT NULL DEFAULT 'LOW',
  decision TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  decision_reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'ai_draft',
  source_draft_id BIGINT NULL,
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  rejected_by TEXT NULL,
  rejected_at TIMESTAMPTZ NULL,
  sent_by TEXT NULL,
  sent_at TIMESTAMPTZ NULL,
  line_response TEXT NULL,
  admin_note TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_auto_reply_approvals_status_created
  ON public.ai_auto_reply_approvals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_auto_reply_approvals_conversation
  ON public.ai_auto_reply_approvals(conversation_id);

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
  ('approval_queue_enabled','reply','คิวอนุมัติข้อความตอบ','ให้ AI ส่งร่างเข้าแผงอนุมัติก่อนใช้กับลูกค้า','true'::jsonb,false),
  ('admin_approved_line_send_enabled','reply','แอดมินกดส่ง LINE จากคิวอนุมัติ','ให้แอดมินส่งข้อความที่อนุมัติแล้วไป LINE ได้ด้วยปุ่มส่งเอง ไม่ใช่ Auto Send','false'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked;
