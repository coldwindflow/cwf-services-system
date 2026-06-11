-- CWF AI Office V25 - separated production pages and customer reply tone control
INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked, updated_at)
VALUES
  ('ai_office_customer_reply_tone','reply','โทนลงท้ายข้อความลูกค้า','กำหนดโทนคำลงท้ายสำหรับร่างตอบลูกค้าและ Auto Safe: female, male, neutral หรือ auto','"female"'::jsonb,false,NOW())
ON CONFLICT (key) DO UPDATE SET
  category=EXCLUDED.category,
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  updated_at=NOW();
