const TECH_BASE_STATUS_CAPS = {
  basic_clean: { label: 'ล้างแอร์ผนัง', skill: 4, wis: 1, int: 0 },
  premium_clean: { label: 'ล้างพรีเมียม', skill: 6, wis: 2, int: 1 },
  coil_clean: { label: 'แขวนคอยล์', skill: 8, wis: 3, int: 1 },
  overhaul: { label: 'ตัดล้างใหญ่', skill: 9, wis: 3, int: 2 },
  cassette_or_hanging: { label: 'ล้างแอร์แขวน/สี่ทิศทาง', skill: 8, wis: 3, int: 2 },
  install: { label: 'ติดตั้งแอร์', skill: 8, wis: 3, int: 3 },
  relocate: { label: 'ย้ายแอร์', skill: 8, wis: 3, int: 3 },
  leak_repair: { label: 'ซ่อมรั่ว', skill: 11, wis: 6, int: 5 },
  refrigerant: { label: 'เติมน้ำยา/เช็กระบบน้ำยา', skill: 7, wis: 5, int: 4 },
  electrical: { label: 'เช็กไฟ/บอร์ด/คาปา/มอเตอร์', skill: 8, wis: 6, int: 6 },
  complex_diagnosis: { label: 'วิเคราะห์อาการเสียซับซ้อน', skill: 10, wis: 8, int: 8 },
};

function clamp100(n){ n = Number(n || 0); if (!Number.isFinite(n)) n = 0; return Math.max(0, Math.min(100, Math.round(n))); }
function avgNums(arr){ const xs = (arr || []).map(Number).filter(Number.isFinite); return xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0; }
function score100(v){ return clamp100(Number(v || 0) * 20); }
function pickEvidence(answers, key){ return Number(answers?.evidence_scores?.[key] || answers?.[key]?.evidence_score || 0); }
function selectedCaps(answers){ return Array.isArray(answers?.capabilities) ? answers.capabilities.map(String) : []; }
function rankFromAverage(avg){ avg = Number(avg || 0); if (avg >= 90) return 'S'; if (avg >= 80) return 'A+'; if (avg >= 70) return 'A'; if (avg >= 60) return 'B'; return 'C'; }
function expSkill(exp){
  const v = String(exp || '').trim();
  if (v === 'lt1') return 20;
  if (v === '1-2') return 35;
  if (v === '3-5') return 55;
  if (v === '5-10') return 70;
  if (v === '10plus') return 85;
  return 20;
}
function optionScore(value, table, def = 50){ return Number.isFinite(table[String(value || '')]) ? table[String(value || '')] : def; }
function capLabels(caps){ return (caps || []).map(k => TECH_BASE_STATUS_CAPS[k]?.label).filter(Boolean); }

function calculateTechnicianBaseStatus(answers = {}, technician = {}) {
  const caps = selectedCaps(answers);
  const capScores = caps.map(k => TECH_BASE_STATUS_CAPS[k]).filter(Boolean);
  const capSkillBonus = capScores.reduce((s,c)=>s + Number(c.skill || 0), 0);
  const capWisBonus = capScores.reduce((s,c)=>s + Number(c.wis || 0), 0);
  const capIntBonus = capScores.reduce((s,c)=>s + Number(c.int || 0), 0);

  const q5 = score100(pickEvidence(answers, 'q5'));
  const q6 = score100(pickEvidence(answers, 'q6'));
  const q10 = score100(pickEvidence(answers, 'q10'));
  const q12 = score100(pickEvidence(answers, 'q12'));

  const q7 = optionScore(answers.q7_photo_discipline, { always: 95, sometimes_forget: 75, need_reminder: 55, dislike: 35, dont_understand: 20 }, 50);
  const q8 = optionScore(answers.q8_app_updates, { full: 95, need_training: 78, if_easy: 68, dislike_app: 40, refuse: 15 }, 50);
  const q9 = optionScore(answers.q9_price_issue, { A: 48, B: 95, C: 35, D: 25 }, 50);
  const q11 = optionScore(answers.q11_heavy_day, { A: 95, B: 35, C: 68, D: 5 }, 50);
  const q13 = optionScore(answers.q13_work_style, { solo: 55, pair: 75, team: 82, all: 95, depends: 85 }, 60);
  const q14 = optionScore(answers.q14_disagree, { A: 62, B: 35, C: 95, D: 10 }, 50);
  const q16 = optionScore(answers.q16_growth_role, { stable: 70, hard_jobs: 82, team_lead: 92, main_partner: 88, subcontractor: 78, unsure: 55 }, 60);
  const q15Evidence = (()=>{ const q = answers.q15_growth_plan || {}; const filled = ['technical','communication','system','goal'].filter(k => String(q[k] || '').trim()).length; return clamp100(40 + (filled * 15)); })();

  const skill = clamp100(avgNums([expSkill(answers.experience_years), q5, q12]) + Math.min(24, capSkillBonus));
  const wis = clamp100(avgNums([q5, q6]) + Math.min(22, capWisBonus));
  const intv = clamp100(avgNums([q5, q15Evidence]) + Math.min(22, capIntBonus));
  const disc = clamp100(avgNums([q7, q8]));
  const comm = clamp100(avgNums([q8, q9, q10, q14]));
  const service = clamp100(avgNums([q9, q10]));
  const end = clamp100(avgNums([q11, q12]));
  const trust = clamp100(avgNums([q6, q9, q11, q12]));
  const team = clamp100(avgNums([q13, q14]));
  const growth = clamp100(avgNums([q6, q15Evidence, q16]));

  const stats = { SKILL: skill, END: end, WIS: wis, INT: intv, DISC: disc, SERVICE: service, COMM: comm, TEAM: team, TRUST: trust, GROWTH: growth };
  const averageStats = avgNums(Object.values(stats));
  const level = Math.min(40, Math.max(1, Math.round(averageStats / 2.5)));
  const rank = rankFromAverage(averageStats);
  const strengths = [];
  if (skill >= 80) strengths.push('ทักษะช่างพื้นฐานดี');
  if (wis >= 80) strengths.push('แก้ปัญหาเฉพาะหน้าได้ดี');
  if (disc >= 75) strengths.push('พร้อมทำตามระบบและเช็กลิสต์');
  if (service >= 75) strengths.push('เหมาะกับงานที่ต้องเจอลูกค้า');
  if (team >= 75) strengths.push('ทำงานร่วมกับทีมได้ดี');
  if (trust >= 80) strengths.push('ไว้ใจให้รับผิดชอบงานได้');
  if (growth >= 80) strengths.push('มีศักยภาพเติบโตต่อ');
  if (!strengths.length) strengths.push('ควรเริ่มจากงานพื้นฐานพร้อมหัวหน้าคุม เพื่อเก็บหลักฐานจริง');

  const suitable = [];
  if (skill >= 80 && wis >= 80) suitable.push('งานยาก / งานซ่อม / งานวิเคราะห์อาการ');
  if (disc >= 75 && service >= 75) suitable.push('งานลูกค้าคอนโด / ลูกค้า VIP');
  if (team >= 75) suitable.push('งานทีม');
  if (skill < 60) suitable.push('เริ่มจากงานล้างทั่วไปหรือผู้ช่วย');
  for (const label of capLabels(caps)) suitable.push(label);
  const suitableJobs = Array.from(new Set(suitable)).slice(0, 10);

  const restricted = [];
  if (skill < 70 || wis < 70) restricted.push('ยังไม่ควรรับงานซ่อมยากหรืองานวิเคราะห์อาการคนเดียว');
  if (comm < 60) restricted.push('ยังไม่ควรคุยราคาเพิ่มกับลูกค้าเอง ต้องให้แอดมิน/เจ้าของอนุมัติ');
  if (trust < 60) restricted.push('ต้องมีหัวหน้าคุมก่อนจนกว่าจะมีหลักฐานความสม่ำเสมอ');
  if (disc < 60) restricted.push('ต้องฝึกใช้แอพ / ถ่ายรูปก่อน-หลัง / อัปเดตสถานะก่อนรับงานเดี่ยว');
  if (service < 60) restricted.push('ยังไม่ควรลงงานลูกค้า VIP หรือเคสลูกค้าจุกจิก');
  if (!restricted.length) restricted.push('ไม่มีข้อจำกัดรุนแรงจากแบบประเมินเบื้องต้น แต่ต้องยืนยันด้วยงานจริง');

  const dev = [];
  if (disc < 75) dev.push('ฝึกกดสถานะในแอพและถ่ายรูปก่อน-หลังให้ครบทุกงาน');
  if (comm < 75) dev.push('ฝึกการแจ้งปัญหาหน้างานและการขออนุมัติเพิ่มราคา');
  if (service < 75) dev.push('ฝึกการอธิบายลูกค้าอย่างสุภาพและไม่ปะทะ');
  if (team < 75) dev.push('ฝึกทำงานร่วมทีมและเสนอความเห็นแบบไม่ทำลายทีม');
  if (skill < 75) dev.push('เริ่มแผนพัฒนาทักษะช่างจากงานที่ยังไม่มั่นใจ');
  if (growth < 75) dev.push('กำหนดเป้าหมาย 30 วันและทักษะที่ต้องฝึกให้ชัด');
  if (!dev.length) dev.push('เริ่มทดลองงาน 30 วันด้วย KPI จากระบบจริง เพื่อยืนยันคะแนนฐาน');

  const prompt = buildTechnicianCharacterPrompt({ technician, stats, level, rank, strengths, restricted, dev, answers });
  return { stats, level, rank, suitable_jobs: suitableJobs, restricted_jobs: restricted, strengths, risk_points: restricted, development_plan: dev, generated_prompt: prompt };
}

function buildTechnicianCharacterPrompt({ technician = {}, stats = {}, level, rank, strengths = [], restricted = [], dev = [], answers = {} }) {
  const name = technician.full_name || technician.username || 'CWF Technician';
  const role = answers.q16_growth_role || technician.employment_type || 'technician';
  return `Create a premium 9:16 RPG-style Thai character status card for Coldwindflow Air Services. Use the technician profile photo as identity reference only, not for judging ability. Character name: ${name}. Class/Role: ${role}. Level: ${level}. Rank: ${rank}. Use navy blue, electric blue, white, and yellow CWF branding. Include stats: SKILL ${stats.SKILL}, END ${stats.END}, WIS ${stats.WIS}, INT ${stats.INT}, DISC ${stats.DISC}, SERVICE ${stats.SERVICE}, COMM ${stats.COMM}, TEAM ${stats.TEAM}, TRUST ${stats.TRUST}, GROWTH ${stats.GROWTH}. Passive skills/strengths: ${strengths.join(', ')}. Upgrade points: ${dev.join(', ')}. Risk warnings: ${restricted.join(', ')}. Add Thai footer: "Base Status ก่อนเริ่มงาน / คะแนนจริงต้องปรับด้วยผลงานจริง". Make it look like a premium game status screen, clean readable Thai typography, stat bars, badges, and Coldwindflow technician theme.`;
}

module.exports = {
  calculateTechnicianBaseStatus,
  buildTechnicianCharacterPrompt,
};
