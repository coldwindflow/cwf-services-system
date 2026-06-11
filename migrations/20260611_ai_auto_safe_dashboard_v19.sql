-- CWF AI Office V19: Auto Safe Dashboard + work saved metrics
-- Safe additive migration. No destructive changes.

INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
VALUES
  ('auto_safe_dashboard_enabled','reply','แดชบอร์ดผลลัพธ์ Auto Safe','เปิดการคำนวณตัวเลขลดงานแอดมินจาก Auto Safe Reply','true'::jsonb,false),
  ('auto_safe_dashboard_window_days','reply','ช่วงวันที่ใช้คำนวณแดชบอร์ด','จำนวนวันย้อนหลังที่ใช้สรุปผลลัพธ์ Auto Safe','30'::jsonb,false),
  ('auto_safe_estimated_admin_seconds_per_reply','reply','เวลาที่แอดมินใช้ตอบต่อข้อความ','ใช้ประเมินเวลาที่ประหยัดได้ต่อข้อความที่ AI ตอบเอง','45'::jsonb,false),
  ('auto_safe_admin_hourly_cost_thb','reply','ต้นทุนเวลาต่อชั่วโมงของแอดมิน','ใช้ประเมินมูลค่าเวลาที่ Auto Safe ช่วยประหยัด','120'::jsonb,false)
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  locked=EXCLUDED.locked;

ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS playbook_id BIGINT NULL;
ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS playbook_title TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_playbook_created
  ON public.ai_auto_safe_reply_logs(playbook_id, created_at DESC)
  WHERE playbook_id IS NOT NULL;
