#!/usr/bin/env python3
from pathlib import Path
import re
import sys

VERSION = "ai-office-customer-chat-v14-20260607"
ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
PACK = Path(__file__).resolve().parents[1]
CHANGED = []

def p(rel):
    return ROOT / rel

def read(rel):
    fp = p(rel)
    if not fp.exists():
        raise FileNotFoundError(f"Missing required file: {rel}")
    return fp.read_text(encoding="utf-8")

def write(rel, text):
    fp = p(rel)
    old = fp.read_text(encoding="utf-8") if fp.exists() else None
    if old != text:
        fp.write_text(text, encoding="utf-8")
        CHANGED.append(rel)

def copy_asset(src_rel, dest_rel):
    src = PACK / src_rel
    dst = p(dest_rel)
    dst.parent.mkdir(parents=True, exist_ok=True)
    new = src.read_bytes()
    old = dst.read_bytes() if dst.exists() else None
    if old != new:
        dst.write_bytes(new)
        CHANGED.append(dest_rel)

def find_function_bounds(text, fn_name):
    m = re.search(r"function\s+" + re.escape(fn_name) + r"\s*\([^)]*\)\s*\{", text)
    if not m:
        raise ValueError(f"Function not found: {fn_name}")
    start = m.start()
    brace = text.find("{", m.end() - 1)
    depth = 0
    i = brace
    in_str = None
    esc = False
    while i < len(text):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
        else:
            if ch in ('"', "'", "`"):
                in_str = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return start, i + 1
        i += 1
    raise ValueError(f"Function end not found: {fn_name}")

def replace_function(text, fn_name, new_body):
    start, end = find_function_bounds(text, fn_name)
    return text[:start] + new_body.strip() + text[end:]


def patch_admin_common():
    rel = "admin-v2-common.js"
    text = read(rel)

    # 1) CSS for a real topbar AI shortcut next to hamburger.
    css_marker = "/* CWF AI Office topbar quick entry v13 */"
    if css_marker not in text:
        css = f'''
    {css_marker}
    #cwfTopNav .in{{justify-content:flex-start!important}}
    #cwfTopNav .navLeft{{display:flex;align-items:center;gap:8px;flex:0 0 auto;order:0}}
    #cwfTopNav .ttl{{flex:1 1 auto;min-width:0;order:1}}
    #cwfTopNav .btns{{order:0}}
    #cwfTopNav .cwf-ai-entry{{background:#fff!important;border-color:rgba(255,204,0,.78)!important;overflow:hidden;padding:4px;position:relative;text-decoration:none}}
    #cwfTopNav .cwf-ai-entry:after{{content:"";position:absolute;inset:-1px;border-radius:20px;background:linear-gradient(135deg,rgba(255,204,0,.40),rgba(21,88,214,.16));opacity:0;transition:opacity .18s ease;pointer-events:none}}
    #cwfTopNav .cwf-ai-entry:hover:after,#cwfTopNav .cwf-ai-entry.active:after{{opacity:1}}
    #cwfTopNav .cwf-ai-entry img{{width:100%;height:100%;object-fit:contain;border-radius:15px;display:block;background:#fff;position:relative;z-index:1}}
    #cwfTopNav .cwf-ai-entry.active{{box-shadow:0 0 0 2px rgba(255,204,0,.58),0 16px 34px rgba(0,0,0,0.24)}}
    @media (max-width:420px){{#cwfTopNav .navLeft{{gap:7px}}#cwfTopNav .cwf-ai-entry img{{border-radius:14px}}}}
'''
        needle = "    #cwfTopNavSpacer{height:62px}"
        if needle in text:
            text = text.replace(needle, css + "\n" + needle)
        else:
            text = text.replace("  `;", css + "\n  `;", 1)

    # 2) Force the topbar HTML to place hamburger and AI button together on the left.
    start = text.find("  nav.innerHTML = `")
    anchor = "  document.body.insertBefore(nav, document.body.firstChild);"
    end = text.find(anchor, start)
    if start == -1 or end == -1:
        raise ValueError("Cannot locate admin nav HTML block")
    nav_block = f'''  nav.innerHTML = `
    <div class="in">
      <div class="navLeft">
        <button id="cwfMenuBtn" class="cwf-icbtn" type="button" title="เมนู" aria-label="เมนู">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z"/></svg>
        </button>
        <a id="cwfAiOfficeEntry" class="cwf-icbtn cwf-ai-entry${{location.pathname.includes('/admin/ai-office') ? ' active' : ''}}" href="/admin/ai-office" title="AI Office" aria-label="AI Office">
          <img src="/assets/icons/cwf-ai-office-entry.png?v={VERSION}" alt="AI Office">
        </a>
      </div>
      <div class="ttl">
        <b>CWF Admin</b>
        <span>${{pageTitle}}</span>
      </div>
    </div>
  `;
'''
    text = text[:start] + nav_block + text[end:]

    # 3) Extra safety: if future markup changes, inject the AI button after hamburger at runtime.
    if "function ensureAiOfficeTopbarEntry" not in text:
        helper = f'''
function ensureAiOfficeTopbarEntry(){{
  try{{
    const menu = document.getElementById('cwfMenuBtn');
    if (!menu || document.getElementById('cwfAiOfficeEntry')) return;
    const a = document.createElement('a');
    a.id = 'cwfAiOfficeEntry';
    a.className = 'cwf-icbtn cwf-ai-entry' + ((location.pathname || '').includes('/admin/ai-office') ? ' active' : '');
    a.href = '/admin/ai-office';
    a.title = 'AI Office';
    a.setAttribute('aria-label','AI Office');
    a.innerHTML = '<img src="/assets/icons/cwf-ai-office-entry.png?v={VERSION}" alt="AI Office">';
    menu.insertAdjacentElement('afterend', a);
  }}catch(e){{}}
}}
'''
        text = text.replace("function injectAdminMenu(){", helper + "\nfunction injectAdminMenu(){", 1)
    if "ensureAiOfficeTopbarEntry();" not in text:
        text = text.replace(anchor, anchor + "\n  ensureAiOfficeTopbarEntry();", 1)

    write(rel, text)


def patch_ai_office_js():
    rel = "admin-ai-office.js"
    text = read(rel)
    text = re.sub(r'const VERSION = "[^"]+";', f'const VERSION = "{VERSION}";', text, count=1)

    text = re.sub(r"const inboxTools = \[[\s\S]*?\];", '''const inboxTools = [
    ["recommended","ร่างคำตอบแนะนำ"],
    ["shorter","ตอบสั้นลง"],
    ["polite","สุภาพขึ้น"],
    ["closing","ช่วยปิดการขาย"],
    ["missing","ถามข้อมูลที่ขาด"],
    ["expensive","ลูกค้าบอกแพง"],
  ];''', text, count=1)

    new_tools = r'''
  function renderInboxTools(){
    const box = qs("#inboxTools"); if (!box) return;
    box.innerHTML = `<div class="lineAiAsk">
      <label for="lineAiAskInput">ถาม AI สำหรับแชทนี้</label>
      <textarea id="lineAiAskInput" rows="2" placeholder="พิมพ์ถาม AI เช่น ควรตอบลูกค้ายังไงดี / ทำให้สั้นลง / ปิดการขายยังไง"></textarea>
      <button type="button" class="lineAiAskBtn" id="btnLineAiAsk">ถาม AI ในแชทนี้</button>
    </div>
    <div class="toolGrid">${inboxTools.map(([key,label]) => `<button type="button" class="toolBtn" data-tool="${key}">${escapeHtml(label)}</button>`).join("")}</div>`;
    qsa("[data-tool]", box).forEach((btn) => btn.addEventListener("click", () => draftForSelected(btn.dataset.tool, btn.textContent || "")));
    qs("#btnLineAiAsk", box)?.addEventListener("click", () => {
      const input = qs("#lineAiAskInput", box);
      const text = cleanText(input?.value);
      if (!text) return showToast("พิมพ์คำถามให้ AI ก่อน");
      draftForSelected("custom", text);
      if (input) input.value = "";
    });
  }
'''
    text = replace_function(text, "renderInboxTools", new_tools)

    if "function draftInstructionForTool" not in text:
        insert = r'''
  function draftInstructionForTool(tool, label){
    const base = "ใช้เฉพาะแชทลูกค้าคนนี้ ร่างข้อความแบบแอดมินผู้หญิงของ Coldwindflow ให้สั้น สุภาพ ธรรมชาติ พร้อมคัดลอกส่งลูกค้า ถ้าเป็นภาษาไทยให้ใช้ ค่ะ/นะคะ อย่างเป็นธรรมชาติ ห้ามใส่สรุปหรือหมายเหตุใน customer_reply";
    const map = {
      recommended: "ร่างคำตอบแนะนำที่เหมาะที่สุดจากข้อความล่าสุดของลูกค้า",
      shorter: "ร่างใหม่ให้สั้นลง เหมือนแอดมินพิมพ์ตอบ LINE จริง ไม่เกิน 2-3 บรรทัด",
      polite: "ร่างใหม่ให้สุภาพขึ้น นุ่มนวลขึ้น แต่ยังสั้นและพร้อมส่ง",
      closing: "ร่างคำตอบช่วยปิดการขายแบบไม่กดดัน เน้นให้ลูกค้าส่งข้อมูล/จองคิวต่อ",
      missing: "ถามเฉพาะข้อมูลที่ยังขาดแบบธรรมชาติ ไม่ถามหลายเรื่องเกินจำเป็น",
      expensive: "ตอบลูกค้าที่รู้สึกว่าแพง โดยอธิบายความคุ้มค่าและมาตรฐานงานแบบสั้น ไม่เถียงลูกค้า",
    };
    if (tool === "custom") return `${label || "ช่วยดูแชทนี้แล้วร่างคำตอบที่เหมาะสม"}. ${base}`;
    return `${map[tool] || label || "ร่างคำตอบแนะนำ"}. ${base}`;
  }
'''
        idx = text.find("  async function draftForSelected")
        if idx == -1:
            raise ValueError("Cannot locate draftForSelected")
        text = text[:idx] + insert + "\n" + text[idx:]

    new_render = r'''
  function renderDraft(draft){
    const box = qs("#draftAnswer"); if (!box) return;
    if (!draft) {
      app.draftText = "";
      box.innerHTML = `<section class="draftSection replyMain"><h4>ข้อความพร้อมส่งลูกค้า</h4><div class="customerReplyText mutedReply">เลือกแชทลูกค้า ระบบจะร่างข้อความตอบให้อัตโนมัติ</div></section>`;
      return;
    }
    const reply = cleanText(draft.customer_reply || draft.answer || "");
    app.draftText = reply;
    const summary = Array.isArray(draft.admin_summary) ? draft.admin_summary : [];
    const missing = Array.isArray(draft.missing_info) ? draft.missing_info : [];
    const list = (items, emptyText) => items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : `<div>${escapeHtml(emptyText)}</div>`;
    const foreign = draft.is_foreign_customer ? `<div class="foreignBox internalOnlyBox"><b>${escapeHtml(draft.foreign_customer_label || "ลูกค้าต่างชาติ")}</b><span>ข้อความต้นฉบับ: ${escapeHtml(draft.original_message || "-")}</span><span>แปลไทยให้แอดมิน: ${escapeHtml(draft.thai_translation || "ยังไม่มีคำแปลไทย")}</span></div>` : "";
    box.innerHTML = `
      <section class="draftSection replyMain customerReplyOnly">
        <h4>ข้อความพร้อมส่งลูกค้า</h4>
        <div class="customerReplyText">${escapeHtml(reply || "ยังไม่มีข้อความพร้อมส่ง")}</div>
      </section>
      <details class="draftSection internalOnly">
        <summary>ดูรายละเอียดสำหรับแอดมิน</summary>
        ${foreign}
        <h4>สรุปสำหรับแอดมิน</h4>${list(summary, "ยังไม่มีสรุปเพิ่มเติม")}
        <h4>ข้อมูลที่ยังขาด</h4>${list(missing, "ยังไม่พบข้อมูลที่ต้องถามเพิ่ม")}
        <h4>แนะนำขั้นต่อไป</h4><div>${escapeHtml(draft.next_step || "ตรวจข้อความและคัดลอกไปตอบลูกค้า")}</div>
      </details>`;
  }
'''
    text = replace_function(text, "renderDraft", new_render)

    old_select_tail = '    renderThread(); renderCustomerContext();\n  }\n  async function draftForSelected'
    if old_select_tail in text:
        text = text.replace(old_select_tail, '    renderThread(); renderCustomerContext();\n    await draftForSelected("recommended", "ร่างคำตอบแนะนำ");\n  }\n  async function draftForSelected', 1)

    text = text.replace('      const instruction = `${label || tool}. ใช้เฉพาะแชทลูกค้าคนนี้ ตอบสั้นแบบแอดมิน LINE และห้ามบอกว่าส่งข้อความแล้ว`;', '      const instruction = draftInstructionForTool(tool, label);', 1)
    text = text.replace('then(() => showToast("คัดลอกแล้ว"))', 'then(() => showToast("คัดลอกเฉพาะข้อความตอบลูกค้าแล้ว"))')
    write(rel, text)


def patch_ai_office_html():
    rel = "admin-ai-office.html"
    text = read(rel)
    text = re.sub(r'ai-office-production-v\d+[^"<\s]*', VERSION, text)
    marker = "/* Customer Inbox natural reply v13 */"
    if marker not in text:
        css = f'''
    {marker}
    .customerReplyOnly{{border:2px solid rgba(21,88,214,.18);background:linear-gradient(180deg,#fff,#f8fbff)}}
    .customerReplyText{{white-space:pre-wrap;font-size:16px;line-height:1.72;font-weight:850;color:#07152f;letter-spacing:-.01em}}
    .mutedReply{{color:#6b7280;font-weight:800}}
    .internalOnly{{margin-top:12px;background:#f8fbff;border-style:dashed}}
    .internalOnly summary{{cursor:pointer;font-weight:1000;color:#0d3d8d;list-style:none}}
    .internalOnly summary::-webkit-details-marker{{display:none}}
    .internalOnly summary:after{{content:"⌄";float:right;color:#64748b}}
    .internalOnly[open] summary:after{{content:"⌃"}}
    .internalOnlyBox{{margin:10px 0;padding:10px;border-radius:14px;background:#fff8da;border:1px solid #f2d96a;display:flex;flex-direction:column;gap:5px}}
    .lineAiAsk{{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:18px;background:#f8fbff;border:1px solid rgba(21,88,214,.14);margin-bottom:10px}}
    .lineAiAsk label{{font-weight:1000;color:#0d3d8d;font-size:13px}}
    .lineAiAsk textarea{{width:100%;min-height:70px;resize:vertical;border-radius:14px;border:1px solid rgba(21,88,214,.18);padding:10px 12px;font:inherit;background:#fff}}
    .lineAiAskBtn{{border:0;border-radius:999px;background:linear-gradient(135deg,#0d3d8d,#1769ff);color:#fff;min-height:42px;font-weight:1000;box-shadow:0 10px 20px rgba(21,88,214,.20)}}
    .toolGrid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}
    .draftAnswer{{font-size:15px}}
    @media(max-width:760px){{.toolGrid{{grid-template-columns:1fr}}.lineAiAsk textarea{{min-height:82px}}}}
'''
        text = text.replace("  </style>", css + "\n  </style>", 1)
    write(rel, text)


def patch_backend_route():
    rel = "server/routes/adminAiOfficeReadOnly.js"
    text = read(rel)

    if "function agentExpertProfile" not in text:
        expert_fn = r'''
function agentExpertProfile(agentName) {
  const key = String(agentName || "").toLowerCase();
  if (key.includes("sales")) return "Master Closer: เซลส์มือโปรสำหรับงานแอร์ ตอบลูกค้าบอกแพง อธิบายความคุ้มค่า ปิดการขายแบบไม่กดดัน และร่าง follow-up สั้นแบบ LINE";
  if (key.includes("ops")) return "Dispatch & Operations Commander: หัวหน้าคิวงาน ดูคิววันนี้/พรุ่งนี้ งานค้าง งานยังไม่จ่าย งานเสี่ยง และข้อความประสานช่าง/ลูกค้า";
  if (key.includes("ads")) return "Elite Performance Marketer: ผู้เชี่ยวชาญ Google/Facebook/TikTok Ads คุมต้นทุนต่อ lead วิเคราะห์ search terms พื้นที่ยิงแอด และข้อความโฆษณาที่ทำให้ลูกค้าทักจริง";
  if (key.includes("content")) return "Creative Director: ครีเอทีฟไดเรกเตอร์ เปลี่ยนงานจริง รีวิวจริง และ pain point ลูกค้าเป็นโพสต์ แคปชัน และสคริปต์วิดีโอที่ขายได้";
  if (key.includes("dev")) return "Senior Production Engineer: วิศวกรระบบอาวุโส ตรวจ repo, route, deploy, cache, bug, risk, checklist และ rollback แบบ production-safe";
  if (key.includes("office")) return "AI Chief of Staff: หัวหน้าทีม AI ที่เลือกแผนกที่เกี่ยวข้องและรวมคำตอบจาก Admin/Sales/Ops/Ads/Content/Dev ให้ทำงานร่วมกัน";
  return "Senior Admin Manager: หัวหน้าแอดมินมืออาชีพ อ่านแชทลูกค้า จัดข้อมูลให้ครบ ร่างข้อความ LINE สั้น สุภาพ ธรรมชาติ พร้อมคัดลอก และแปลต่างชาติให้แอดมินเข้าใจ";
}
'''
        s, e = find_function_bounds(text, "getLineAgent")
        text = text[:e] + "\n\n" + expert_fn.strip() + text[e:]

    text = text.replace('    `บทบาท: ${agent.role}`,', '    `บทบาท: ${agent.role}`,\n    `โปรไฟล์ผู้เชี่ยวชาญ: ${agentExpertProfile(agent.name)}`,', 1)
    text = text.replace('    `หน้าที่: ${agent.role}`,', '    `หน้าที่: ${agent.role}`,\n    `โปรไฟล์ผู้เชี่ยวชาญ: ${agentExpertProfile(agent.name)}`,', 1)

    strict = '    "customer_reply must contain only the final customer-facing message. Do not include admin_summary, missing_info, next_step, or internal notes inside customer_reply.",'
    if strict in text and "customer_reply must sound like a real Coldwindflow LINE admin" not in text:
        add = '''
    "customer_reply must sound like a real female Coldwindflow LINE admin, not a report: short, natural, polite, usually 1-4 lines. For Thai replies, use ค่ะ/นะคะ naturally, not ครับ.",
    "customer_reply must not contain bullet points, headings, admin notes, system wording, or words like สรุป, ข้อมูลที่ยังขาด, แนะนำขั้นต่อไป, หมายเหตุสำหรับแอดมิน.",
    "If information is missing, ask only the next most important question naturally in the customer_reply.",
    "If customer asks price, answer with current CWF price first when enough service context exists, then ask one missing detail if needed.",
    "Examples of good Thai LINE style: สวัสดีค่ะ รบกวนแจ้งพื้นที่ให้บริการ จำนวนเครื่อง และวันเวลาที่สะดวกเพิ่มเติมได้ไหมคะ เดี๋ยวแอดมินตรวจสอบคิวและแจ้งรายละเอียดให้นะคะ 🙏",'''
        text = text.replace(strict, strict + add, 1)

    if "function sanitizeCustomerReply" not in text:
        sanitizer = r'''
function sanitizeCustomerReply(value, fallback) {
  let text = cleanText(value, 2200);
  const safeFallback = cleanText(fallback, 2200);
  if (!text) return safeFallback;
  text = text.replace(/^\s*(ข้อความพร้อมส่งลูกค้า|ข้อความตอบลูกค้า|customer_reply|reply)\s*[:：]\s*/i, "").replace(/^\s*(คำตอบแนะนำ|ร่างคำตอบ)\s*[:：]\s*/i, "").trim();
  const forbidden = /(สรุปให้แอดมิน|สรุปลูกค้า|ข้อมูลที่ยังขาด|แนะนำขั้นต่อไป|หมายเหตุสำหรับแอดมิน|admin_summary|missing_info|next_step|internal note)/i;
  const bulletLines = text.split(/\n+/).filter((line) => /^\s*[-•*]\s+/.test(line)).length;
  if (forbidden.test(text) || bulletLines >= 2) return safeFallback;
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
'''
        idx = text.find("function normalizeLineDraftPayload")
        if idx == -1:
            raise ValueError("Cannot locate normalizeLineDraftPayload")
        text = text[:idx] + sanitizer.strip() + "\n\n" + text[idx:]

    text = text.replace('    customer_reply: cleanText(payload?.customer_reply, 2000) || fallback.customer_reply,', '    customer_reply: sanitizeCustomerReply(payload?.customer_reply, fallback.customer_reply),', 1)

    # Stronger fallback replies for cases where AI returns a report or invalid JSON.
    if "function fallbackLineDraft" in text and "const looksLikePriceQuestion" not in text:
        new_fallback = r'''
function fallbackLineDraft({ conversation, messages, threadContext }) {
  const latest = latestCustomerMessage(messages);
  const original = cleanText(latest.message_text || latest.message_text_for_admin || conversation?.last_message_text, 1000);
  const language = detectCustomerLanguage(original);
  const isForeign = Boolean(latest.is_foreign_customer || language !== "th" && language !== "unknown");
  const missing = threadContext?.customer_context?.missing_information || ["พื้นที่/ที่อยู่", "ประเภทงาน", "จำนวนเครื่อง", "วันเวลาที่สะดวก"];
  const q = original.toLowerCase();
  const looksLikePriceQuestion = /ราคา|เท่าไหร่|กี่บาท|price|cost|how much/.test(q);
  const looksLikeExpensive = /แพง|สูง|ลด|expensive|too much/.test(q);
  const hasPartialPhone = /0\d[xX*]{3,}|098x|xxx/.test(q);
  let reply = "";
  if (["en", "ja", "zh", "ko"].includes(language)) {
    reply = looksLikePriceQuestion
      ? "Hello, thank you for contacting Coldwindflow Air Services. Wall-type AC cleaning starts from 550 THB. Could you please send your area, number of units, and BTU/size if available? We’ll check the details and confirm for you."
      : "Hello, thank you for contacting Coldwindflow Air Services. Could you please send your area, number of air conditioners, and preferred date/time? We’ll check the queue and confirm the details for you.";
  } else if (looksLikePriceQuestion) {
    reply = "สวัสดีค่ะ ราคาล้างแอร์ผนังเริ่มต้น 550 บาทค่ะ รบกวนแจ้งขนาด BTU / จำนวนเครื่อง และพื้นที่ให้บริการเพิ่มเติมได้ไหมคะ เดี๋ยวแอดมินเช็กคิวให้ค่ะ 🙏";
  } else if (looksLikeExpensive) {
    reply = "เข้าใจค่ะ งานของ Coldwindflow จะมีการตรวจเช็กเบื้องต้น ล้างคอยล์เย็น/คอยล์ร้อน และรับประกันงานล้าง 30 วันค่ะ ถ้าลูกค้าสะดวก แอดมินช่วยดูแพ็กเกจที่เหมาะกับอาการและงบให้ได้ค่ะ";
  } else if (hasPartialPhone) {
    reply = "สวัสดีค่ะ รบกวนส่งเบอร์โทรติดต่อกลับแบบครบถ้วน พร้อมพื้นที่ให้บริการและจำนวนเครื่องเพิ่มเติมได้ไหมคะ เดี๋ยวแอดมินตรวจสอบคิวและแจ้งรายละเอียดให้นะคะ 🙏";
  } else {
    reply = "สวัสดีค่ะ รบกวนแจ้งพื้นที่ให้บริการ จำนวนเครื่อง และวันเวลาที่สะดวกเพิ่มเติมได้ไหมคะ เดี๋ยวแอดมินตรวจสอบคิวและแจ้งรายละเอียดให้นะคะ 🙏";
  }
  return {
    customer_reply: reply,
    admin_summary: [original ? "ลูกค้าส่งข้อความเข้ามา ต้องรอข้อมูลเพิ่มเติมก่อนตอบราคา/คิวให้ชัดเจน" : "ยังไม่มีข้อความลูกค้าที่อ่านได้"],
    missing_info: missing,
    next_step: "ตรวจข้อความพร้อมส่ง แล้วคัดลอกไปตอบลูกค้าด้วยแอดมินเอง",
    customer_language: language,
    is_foreign_customer: isForeign,
    foreign_customer_label: isForeign ? foreignCustomerLabel(conversation) : "",
    original_message: original,
    thai_translation: latest.thai_translation || "",
  };
}
'''
        text = replace_function(text, "fallbackLineDraft", new_fallback)

    write(rel, text)


def main():
    copy_asset("assets/icons/cwf-ai-office-entry.png", "assets/icons/cwf-ai-office-entry.png")
    patch_admin_common()
    patch_ai_office_js()
    patch_ai_office_html()
    patch_backend_route()
    print("CWF AI Office Customer Chat v14 applied.")
    print("Changed files:")
    for rel in CHANGED:
        print("-", rel)

if __name__ == "__main__":
    main()
