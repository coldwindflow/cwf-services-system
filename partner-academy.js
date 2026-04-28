(function(){
  const $ = (id) => document.getElementById(id);
  const state = { applicationCode: '', lessons: [], exam: null, questions: [] };

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function setMessage(text, type){
    const el = $('message');
    el.textContent = text || '';
    el.className = `msg ${type || ''}`;
  }

  async function api(url, opts){
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts && opts.headers ? opts.headers : {}) },
      ...(opts || {})
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  function completionPercent(){
    if (!state.lessons.length) return 0;
    const done = state.lessons.filter((l) => l.completed).length;
    return Math.round((done / state.lessons.length) * 100);
  }

  function renderLessons(data){
    const app = data.application || {};
    const course = data.course || {};
    state.lessons = data.lessons || [];
    $('academyPanel').classList.remove('hidden');
    $('courseTitle').textContent = course.title || course.course_title || 'CWF Basic Partner';
    $('applicantName').textContent = `${app.full_name || '-'} • ${app.application_code || state.applicationCode}`;
    const percent = completionPercent();
    $('progressBadge').textContent = `${percent}%`;
    $('progressBadge').className = `badge ${percent === 100 ? 'ok' : ''}`;
    $('lessons').innerHTML = state.lessons.map((lesson) => `
      <article class="lesson">
        <div class="top">
          <div>
            <b>${esc(lesson.sort_order || '')}. ${esc(lesson.lesson_title)}</b>
            <div style="margin-top:6px;line-height:1.55">${esc(lesson.body_text || '')}</div>
            <div class="muted">${lesson.completed ? `เสร็จแล้ว ${new Date(lesson.completed_at).toLocaleString('th-TH')}` : 'ยังไม่เสร็จ'}</div>
          </div>
          <span class="badge ${lesson.completed ? 'ok' : ''}">${lesson.completed ? 'เสร็จแล้ว' : 'รอทำ'}</span>
        </div>
        <button class="${lesson.completed ? 'ghost' : 'primary'}" data-complete="${esc(lesson.id)}" type="button" style="margin-top:10px">${lesson.completed ? 'ทำซ้ำ/ยืนยัน' : 'ทำบทเรียนนี้เสร็จ'}</button>
      </article>
    `).join('');
  }

  function renderExam(data){
    state.exam = data.exam || null;
    state.questions = data.questions || [];
    if (!state.exam) return;
    $('examPanel').classList.remove('hidden');
    $('examMeta').textContent = `ผ่านที่ ${Number(state.exam.passing_score_percent || 80)}%`;
    $('questions').innerHTML = state.questions.map((q, idx) => {
      const choices = Array.isArray(q.choices_json) ? q.choices_json : [];
      return `
        <article class="question">
          <b>${idx + 1}. ${esc(q.question_text)}</b>
          <div class="choices">
            ${choices.map((choice, cidx) => `
              <label class="choice">
                <input type="radio" name="q_${esc(q.id)}" value="${cidx}">
                <span>${esc(choice)}</span>
              </label>
            `).join('')}
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadAcademy(){
    try {
      setMessage('', '');
      state.applicationCode = $('applicationCode').value.trim().toUpperCase();
      if (!state.applicationCode) throw new Error('กรุณากรอกรหัสใบสมัคร');
      const academy = await api(`/partner/academy/${encodeURIComponent(state.applicationCode)}`);
      renderLessons(academy);
      const exam = await api(`/partner/academy/${encodeURIComponent(state.applicationCode)}/exam`);
      renderExam(exam);
    } catch (e) {
      setMessage(e.message, 'err');
    }
  }

  async function completeLesson(lessonId){
    try {
      await api(`/partner/academy/${encodeURIComponent(state.applicationCode)}/lessons/${encodeURIComponent(lessonId)}/complete`, { method: 'POST', body: '{}' });
      const academy = await api(`/partner/academy/${encodeURIComponent(state.applicationCode)}`);
      renderLessons(academy);
      setMessage('บันทึกบทเรียนเรียบร้อย', 'ok');
    } catch (e) {
      setMessage(e.message, 'err');
    }
  }

  async function submitExam(){
    try {
      const answers = {};
      for (const q of state.questions) {
        const picked = document.querySelector(`input[name="q_${CSS.escape(String(q.id))}"]:checked`);
        if (!picked) throw new Error('กรุณาตอบข้อสอบให้ครบทุกข้อ');
        answers[String(q.id)] = Number(picked.value);
      }
      const data = await api(`/partner/academy/${encodeURIComponent(state.applicationCode)}/exam/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers })
      });
      const score = Number(data.attempt && data.attempt.score_percent);
      setMessage(`ส่งข้อสอบแล้ว คะแนน ${score}% ${data.passed ? 'ผ่าน' : 'ยังไม่ผ่าน'}`, data.passed ? 'ok' : 'err');
    } catch (e) {
      setMessage(e.message, 'err');
    }
  }

  $('btnLoad').addEventListener('click', loadAcademy);
  $('btnSubmitExam').addEventListener('click', submitExam);
  $('lessons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-complete]');
    if (btn) completeLesson(btn.dataset.complete);
  });
  $('applicationCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAcademy();
  });

  const params = new URLSearchParams(location.search);
  const code = params.get('code') || params.get('application_code');
  if (code) {
    $('applicationCode').value = code;
    loadAcademy();
  }
})();
