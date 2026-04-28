-- Partner Onboarding remaining modules: agreement, academy, exams, certification, trial evaluation.
-- Backward-compatible only. Job-blocking enforcement remains controlled by CERTIFICATION_ENFORCEMENT.

CREATE TABLE IF NOT EXISTS public.agreement_templates (
  id BIGSERIAL PRIMARY KEY,
  template_code TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_code, version)
);
CREATE INDEX IF NOT EXISTS idx_agreement_templates_active ON public.agreement_templates(template_code, is_active, version DESC);

CREATE TABLE IF NOT EXISTS public.agreement_signatures (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  template_id BIGINT NOT NULL REFERENCES public.agreement_templates(id),
  template_version INT NOT NULL,
  signer_full_name TEXT NOT NULL,
  consent_terms BOOLEAN NOT NULL DEFAULT FALSE,
  signed_ip TEXT,
  signed_user_agent TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agreement_signatures_application ON public.agreement_signatures(application_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS public.academy_courses (
  id BIGSERIAL PRIMARY KEY,
  course_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_lessons (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  lesson_title TEXT NOT NULL,
  body_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.academy_progress (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_academy_progress_application ON public.academy_progress(application_id, course_id);

CREATE TABLE IF NOT EXISTS public.academy_exams (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  exam_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  passing_score_percent NUMERIC(5,2) NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academy_exam_questions (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES public.academy_exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  choices_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_choice_index INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.academy_exam_attempts (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  exam_id BIGINT NOT NULL REFERENCES public.academy_exams(id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_application ON public.academy_exam_attempts(application_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.technician_certifications (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  technician_username TEXT,
  certification_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_training','exam_ready','exam_failed','exam_passed','trial_unlocked','approved','suspended','revoked')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  admin_note TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id, certification_code)
);
CREATE INDEX IF NOT EXISTS idx_tech_cert_username_code ON public.technician_certifications(technician_username, certification_code, status);

CREATE TABLE IF NOT EXISTS public.partner_trial_jobs (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  technician_username TEXT,
  certification_code TEXT NOT NULL,
  job_id BIGINT,
  status TEXT NOT NULL DEFAULT 'unlocked',
  admin_note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_trial_jobs_application ON public.partner_trial_jobs(application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_evaluations (
  id BIGSERIAL PRIMARY KEY,
  trial_job_id BIGINT NOT NULL REFERENCES public.partner_trial_jobs(id) ON DELETE CASCADE,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  evaluator_username TEXT,
  punctuality_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  uniform_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  communication_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  photo_quality_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  job_quality_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  customer_issue BOOLEAN NOT NULL DEFAULT FALSE,
  admin_note TEXT,
  result TEXT NOT NULL CHECK (result IN ('passed','failed','needs_more_trial')),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_evaluations_application ON public.partner_evaluations(application_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_incidents (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES public.partner_applications(id) ON DELETE CASCADE,
  trial_job_id BIGINT REFERENCES public.partner_trial_jobs(id) ON DELETE SET NULL,
  incident_type TEXT,
  severity TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_incidents_application ON public.partner_incidents(application_id, created_at DESC);

INSERT INTO public.agreement_templates(template_code, version, title, body_text, is_active)
VALUES (
  'partner_standard',
  1,
  'CWF Partner Agreement',
  'สัญญาพาร์ทเนอร์ CWF เวอร์ชันพื้นฐาน: ผู้ให้บริการต้องรักษามาตรฐานแบรนด์ แต่งกายสุภาพ สื่อสารกับลูกค้าอย่างมืออาชีพ เช็กอิน/ปิดงานตามระบบ ห้ามเปลี่ยนราคาเอง ห้ามรับเงินนอกระบบ และรับผิดชอบงานรับประกันตามนโยบาย CWF',
  TRUE
)
ON CONFLICT(template_code, version) DO NOTHING;

DO $$
DECLARE
  course_id BIGINT;
  exam_id BIGINT;
BEGIN
  INSERT INTO public.academy_courses(course_code, title, description, is_active)
  VALUES ('cwf_basic_partner', 'CWF Basic Partner', 'หลักสูตรพื้นฐานสำหรับ Partner ก่อนรับงานทดลอง', TRUE)
  ON CONFLICT(course_code) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, is_active=TRUE, updated_at=NOW()
  RETURNING id INTO course_id;

  INSERT INTO public.academy_lessons(course_id, lesson_title, body_text, sort_order, is_active)
  VALUES
    (course_id, 'มาตรฐานแบรนด์ CWF', 'รักษาความสุภาพ ความตรงเวลา และคุณภาพงานตามมาตรฐาน CWF', 1, TRUE),
    (course_id, 'การแต่งกายและมารยาทหน้างาน', 'แต่งกายสะอาด สุภาพ และเคารพพื้นที่ลูกค้า', 2, TRUE),
    (course_id, 'การสื่อสารกับลูกค้า', 'แจ้งขั้นตอนงานและปัญหาด้วยภาษาที่ชัดเจน ไม่กดดันลูกค้า', 3, TRUE),
    (course_id, 'การเช็กอิน', 'เช็กอินตามระบบเมื่อถึงหน้างานเพื่อให้ทีมติดตามได้', 4, TRUE),
    (course_id, 'การถ่ายรูปก่อนและหลังงาน', 'ถ่ายรูปให้ครบ ชัด และเห็นสภาพก่อน/หลังงาน', 5, TRUE),
    (course_id, 'ห้ามเปลี่ยนราคาเอง', 'ราคาและรายการเพิ่มต้องผ่านระบบหรือแอดมินเท่านั้น', 6, TRUE),
    (course_id, 'ห้ามรับเงินนอกระบบ', 'รับชำระตามช่องทางที่ CWF กำหนดเท่านั้น', 7, TRUE),
    (course_id, 'วิธีปิดงาน', 'ตรวจงาน สรุปรายการ และปิดงานในระบบให้ครบ', 8, TRUE),
    (course_id, 'ความรับผิดชอบงานรับประกัน', 'รับผิดชอบการแก้ไขตามนโยบายรับประกันของ CWF', 9, TRUE),
    (course_id, 'กติกางานทดลอง', 'งานทดลองใช้ประเมินมาตรฐานก่อนเปิดสิทธิ์รับงานจริง', 10, TRUE)
  ON CONFLICT(course_id, sort_order) DO UPDATE SET lesson_title=EXCLUDED.lesson_title, body_text=EXCLUDED.body_text, is_active=TRUE, updated_at=NOW();

  INSERT INTO public.academy_exams(course_id, exam_code, title, passing_score_percent, is_active)
  VALUES (course_id, 'cwf_basic_partner_exam', 'แบบทดสอบ CWF Basic Partner', 80, TRUE)
  ON CONFLICT(exam_code) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, passing_score_percent=80, is_active=TRUE, updated_at=NOW()
  RETURNING id INTO exam_id;

  INSERT INTO public.academy_exam_questions(exam_id, question_text, choices_json, correct_choice_index, sort_order)
  VALUES
    (exam_id, 'หากพบว่าต้องเพิ่มราคา Partner ควรทำอย่างไร', '["แจ้งลูกค้าและเก็บเพิ่มเอง","แจ้งแอดมิน/ทำตามระบบ CWF","ยกเลิกงานทันที"]'::jsonb, 1, 1),
    (exam_id, 'รูปก่อนและหลังงานควรเป็นอย่างไร', '["ถ่ายเท่าที่สะดวก","ถ่ายให้ครบ ชัด เห็นสภาพงาน","ไม่จำเป็นถ้าลูกค้ารีบ"]'::jsonb, 1, 2),
    (exam_id, 'การรับเงินนอกระบบทำได้หรือไม่', '["ทำได้ถ้าลูกค้ายินยอม","ทำได้เฉพาะงานเล็ก","ห้ามรับเงินนอกระบบ"]'::jsonb, 2, 3),
    (exam_id, 'เมื่อถึงหน้างานควรทำอะไรในระบบก่อน', '["เช็กอิน","ปิดงาน","ขอรีวิว"]'::jsonb, 0, 4),
    (exam_id, 'งานทดลองมีไว้เพื่ออะไร', '["ประเมินมาตรฐานก่อนเปิดสิทธิ์งานจริง","เพิ่มราคา","ข้ามขั้นตอนเอกสาร"]'::jsonb, 0, 5)
  ON CONFLICT(exam_id, sort_order) DO UPDATE SET question_text=EXCLUDED.question_text, choices_json=EXCLUDED.choices_json, correct_choice_index=EXCLUDED.correct_choice_index, updated_at=NOW();
END $$;
