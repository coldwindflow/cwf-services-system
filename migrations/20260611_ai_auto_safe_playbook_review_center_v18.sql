-- CWF AI Office V18: Auto Safe Playbook Review Center
-- Lets admins edit suggested Playbooks before approving them for Auto Safe LINE replies.

BEGIN;

ALTER TABLE public.ai_auto_safe_playbook_suggestions
  ADD COLUMN IF NOT EXISTS reviewed_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_intent TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_trigger_phrases JSONB NULL,
  ADD COLUMN IF NOT EXISTS reviewed_response_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_priority INTEGER NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL;

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
  ('auto_safe_playbook_review_required','reply','ต้องตรวจ Playbook ก่อนอนุมัติ','ให้แอดมินตรวจชื่อ trigger และข้อความตอบ ก่อนสร้าง Playbook ให้ AI ใช้ส่ง LINE เอง','true'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked,
  updated_at=NOW();

COMMIT;
