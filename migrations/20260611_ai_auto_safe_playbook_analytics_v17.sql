-- CWF AI Office V17: Auto Safe Playbook Analytics + Suggestions
-- Adds suggested playbooks from repeated safe questions that were skipped because no Playbook matched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_auto_safe_playbook_suggestions (
  id BIGSERIAL PRIMARY KEY,
  intent TEXT NOT NULL DEFAULT 'unknown',
  normalized_question TEXT NOT NULL DEFAULT '',
  trigger_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_title TEXT NOT NULL DEFAULT '',
  suggested_response_text TEXT NOT NULL DEFAULT '',
  sample_customer_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurrences INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'auto_safe_analytics',
  approved_playbook_id BIGINT NULL,
  dismissed_by TEXT NULL,
  dismissed_at TIMESTAMPTZ NULL,
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_auto_safe_playbook_suggestions_unique
  ON public.ai_auto_safe_playbook_suggestions(intent, normalized_question);

CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_playbook_suggestions_status
  ON public.ai_auto_safe_playbook_suggestions(status, occurrences DESC, updated_at DESC);

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
  ('auto_safe_playbook_suggestions_enabled','reply','แนะนำ Playbook จากคำถามที่พบบ่อย','ให้ระบบดูคำถามจริงที่ Auto Safe กันไว้เพราะไม่มี Playbook แล้วเสนอให้แอดมินสร้างชุดคำตอบใหม่','true'::jsonb,false),
  ('auto_safe_playbook_suggestion_min_count','reply','จำนวนคำถามซ้ำก่อนเสนอ Playbook','คำถามแนวเดียวกันต้องพบอย่างน้อยกี่ครั้งก่อนเสนอให้สร้าง Playbook','2'::jsonb,false),
  ('auto_safe_playbook_suggestion_window_days','reply','ช่วงวันที่ใช้หา Playbook แนะนำ','ดูคำถามย้อนหลังตามจำนวนวันนี้เพื่อเสนอ Playbook ใหม่','14'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked,
  updated_at=NOW();

COMMIT;
