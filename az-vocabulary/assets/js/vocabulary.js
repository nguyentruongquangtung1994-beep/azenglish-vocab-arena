/* AZ Vocabulary — giao diện học. Mọi nội dung đưa vào trang bằng textContent (hàm h), không dùng innerHTML với dữ liệu. */
(function () {
  "use strict";
  const C = window.AZVCore, S = window.AZVStore, CFG = window.AZV_CONFIG || {};
  const $ = id => document.getElementById(id);
  const EXAM_NAME = { toeic: "TOEIC", ielts: "IELTS" };
  const DIR_NAME = { "en-vi": "Anh → Việt", "vi-en": "Việt → Anh" };
  const SPEED_NAME = { fast: ["Nhanh", "0,35 giây"], medium: ["Vừa", "0,65 giây"], slow: ["Chậm", "1 giây"] };
  const TIER = { trial: "Dùng thử", standard: "Standard", elite: "Elite" };
  const FREE_COUNT = 10, DUE_MAX = 30, MIN_GAP = 120;

  let ITEMS = [], BYID = {}, TOPICS = { toeic: [], ielts: [] }, P = null;
  let armed = {};
  // xác nhận bằng bấm lần 2 trong 4 giây (khung artifact và vài webview chặn hộp thoại xác nhận của trình duyệt)
  function twice(key, msg) { if (armed[key]) { delete armed[key]; return true; } armed[key] = true; toast(msg); setTimeout(() => { delete armed[key]; }, 4000); return false; }
  let advT = null, tStart = null, lockQ = false, shownAt = 0, resultTab = "all", pendingImport = null, toastT = null;

  /* ---------- tiện ích DOM an toàn ---------- */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(x => add(el, x)); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  const fill = (el, ...kids) => { el.replaceChildren(); kids.forEach(k => add(el, k)); return el; };
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200); }
  const today = () => C.localDate();
  const vnDate = d => d ? d.split("-").reverse().join("/") : "";
  function fmtDur(ms) { const s = Math.round((ms || 0) / 1000), m = Math.floor(s / 60); return m ? m + " phút " + String(s % 60).padStart(2, "0") + " giây" : s + " giây"; }
  const save = () => { if (!S.save(P)) toast("Trình duyệt đang chặn lưu dữ liệu — tiến độ sẽ mất khi đóng trang."); };
  function show(id) { ["scrHome", "scrLearn", "scrResult"].forEach(s => { $(s).hidden = s !== id; }); window.scrollTo(0, 0); }

  /* ---------- quyền học ---------- */
  function access() { const a = S.academy(); return { full: a.state === "active", acad: a, freeUsed: S.freeUsed() }; }
  const locked = () => { const a = access(); return !a.full && a.freeUsed; };

  /* ---------- tải học liệu ---------- */
  async function loadBanks() {
    const bad = [];
    let loaded = 0;
    for (const exam of C.EXAMS) {
      try {
        const res = await fetch("data/vocabulary-" + exam + ".json", { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const v = C.validateBank(await res.json());
        TOPICS[exam] = v.topics;
        v.items.forEach(it => { ITEMS.push(it); BYID[it.id] = it; });
        if (v.errors.length) bad.push(EXAM_NAME[exam] + ": " + v.errors.length + " lỗi, đã ẩn mục lỗi");
        if (v.items.length) loaded++;
      } catch (e) { bad.push(EXAM_NAME[exam] + ": không tải được (" + e.message + ")"); }
    }
    return { loaded, bad };
  }

  /* ---------- màn chọn bài ---------- */
  function topicName(exam, t) { if (!t || t === "all") return "Tổng hợp"; const x = (TOPICS[exam] || []).find(z => z.id === t); return x ? x.nameVi : t; }
  function roundTitle(r) {
    if (r.kind === "review") return "Ôn lại từ sai";
    if (r.kind === "due") return "Ôn theo lịch";
    return (r.topic === "all" ? "Tổng hợp " + EXAM_NAME[r.exam] : topicName(r.exam, r.topic));
  }
  const roundSub = r => [r.exam ? EXAM_NAME[r.exam] : null, r.level && r.level !== "all" ? C.LEVEL_VI[r.level] : null, DIR_NAME[r.dir]].filter(Boolean).join(" · ");

  function renderWho() {
    const a = S.academy(), w = $("who");
    if (a.state === "active") fill(w, h("span", { class: "tag", text: TIER[a.tier] || "Thành viên" }), h("span", { class: "nm", text: a.name }));
    else if (a.state === "expired") fill(w, h("span", { class: "tag", text: "Hết hạn dùng thử" }));
    else fill(w, h("span", { class: "tag", text: "Học thử miễn phí" }));
  }

  function segButtons(el, opts, cur, onPick) {
    fill(el, opts.map(o => h("button", { type: "button", "aria-pressed": String(o.v === cur), onclick: () => onPick(o.v, o) },
      o.label, o.sub ? h("span", { class: "lk", text: o.sub }) : null)));
  }
  function availableCount() { const p = P.prefs; return p.exam ? C.filterItems(ITEMS, p).length : 0; }

  function renderHome() {
    renderWho();
    const acc = access(), p = P.prefs;
    if (!acc.full && p.count > FREE_COUNT) p.count = FREE_COUNT;
    // lượt đang dở
    const rs = $("resume");
    if (P.active) {
      const r = P.active;
      fill(rs, h("div", { class: "resume" },
        h("div", null, h("b", { text: "Đang dở: " + roundTitle(r) }), h("span", { text: "Đã trả lời " + r.answers.length + "/" + r.questions.length + " · " + roundSub(r) })),
        h("button", { class: "btn", type: "button", onclick: resumeRound, text: "Tiếp tục" }),
        h("button", { class: "x", type: "button", onclick: abandonRound, text: "Bỏ lượt" })));
    } else rs.replaceChildren();
    // khối học nhanh
    const q = $("quick");
    if (locked()) {
      fill(q, gateCard("home"));
    } else if (!p.exam) {
      fill(q, h("h1", { text: "Học nhanh 10 từ" }),
        h("p", { text: "Chọn chương trình là bắt đầu ngay. Mỗi từ chọn một nghĩa, thẻ tự chuyển; xong lượt mới chữa bài." }),
        h("div", { class: "pick2" }, C.EXAMS.map(e => h("button", { class: e === "toeic" ? "btn navy" : "btn", type: "button", onclick: () => { p.exam = e; p.topic = "all"; p.level = "all"; p.count = FREE_COUNT; save(); startMain(); } },
          EXAM_NAME[e], h("small", { text: e === "toeic" ? "Công việc · đời sống" : "Speaking · Writing" })))));
    } else {
      fill(q, h("h1", { text: "Học nhanh " + p.count + " từ" }),
        h("div", { class: "sum" }, [EXAM_NAME[p.exam], topicName(p.exam, p.topic), p.level === "all" ? "Mọi mức" : C.LEVEL_VI[p.level], DIR_NAME[p.dir]].map(t => h("span", { text: t }))),
        h("button", { class: "btn block", type: "button", onclick: () => startMain(), text: "Học ngay" }));
    }
    // chuỗi ngày + lịch ôn
    const st = $("status"), due = C.dueIds(P.words, today()).filter(id => BYID[id]), strk = C.streak(P.days, today());
    const last = P.history.length ? P.history[P.history.length - 1] : null;
    fill(st,
      P.history.length ? h("span", null, "Chuỗi ", h("b", { text: strk + " ngày" }), " · luyện gần nhất " + vnDate(P.lastPracticed)) : h("span", { text: "Học xong lượt đầu sẽ có lịch ôn gợi ý sau 1, 3 và 7 ngày." }),
      due.length ? h("span", null, h("b", { text: due.length + " từ" }), " đến hạn ôn hôm nay") : null,
      due.length ? h("button", { class: "btn line", type: "button", onclick: startDue, text: "Ôn ngay" }) : null,
      last ? h("button", { class: "link", type: "button", onclick: () => showResult(last.id), text: "Xem kết quả lượt gần nhất" }) : null);
    renderSetup();
  }

  function renderSetup() {
    const p = P.prefs, acc = access();
    segButtons($("fExam"), C.EXAMS.map(e => ({ v: e, label: EXAM_NAME[e] })), p.exam, v => { if (p.exam !== v) { p.exam = v; p.topic = "all"; } save(); renderHome(); });
    const tops = p.exam ? [{ v: "all", label: "Tổng hợp" }].concat(TOPICS[p.exam].map(t => ({ v: t.id, label: t.nameVi }))) : [];
    if (tops.length) segButtons($("fTopic"), tops, p.topic, v => { p.topic = v; save(); renderHome(); });
    else fill($("fTopic"), h("p", { class: "muted small", text: "Chọn chương trình trước." }));
    segButtons($("fLevel"), [{ v: "all", label: "Mọi mức" }].concat(C.LEVELS.map(l => ({ v: l, label: C.LEVEL_VI[l] }))), p.level, v => { p.level = v; save(); renderHome(); });
    segButtons($("fCount"), C.COUNTS.map(n => ({ v: n, label: n + " từ", sub: !acc.full && n > FREE_COUNT ? "mở sau đăng ký" : null })), p.count, v => {
      if (!acc.full && v > FREE_COUNT) { toast("Lượt 20 và 30 từ mở khi bạn tạo tài khoản dùng thử miễn phí. Học thử 10 từ trước nhé."); return; }
      p.count = v; save(); renderHome();
    });
    segButtons($("fDir"), C.DIRS.map(d => ({ v: d, label: DIR_NAME[d], sub: d === "en-vi" ? "mặc định" : "chọn từ tiếng Anh" })), p.dir, v => { p.dir = v; save(); renderHome(); });
    segButtons($("fTimer"), C.TIMERS.map(t => ({ v: t, label: t + " giây", sub: t === 8 ? "mặc định" : t === 5 ? "gấp" : "thoải mái" })), p.timer, v => { p.timer = v; save(); renderHome(); });
    segButtons($("fSpeed"), Object.keys(SPEED_NAME).map(k => ({ v: k, label: SPEED_NAME[k][0], sub: SPEED_NAME[k][1] })), p.speed, v => { p.speed = v; save(); renderHome(); });
    segButtons($("fSound"), [{ v: "both", label: "Tiếng + đọc từ" }, { v: "sound", label: "Chỉ tiếng đúng/sai" }, { v: "off", label: "Tắt tiếng" }], p.sound && p.speak ? "both" : p.sound ? "sound" : "off", v => { p.sound = v !== "off"; p.speak = v === "both"; save(); renderHome(); if (p.sound) tone(true); });
    // số từ phù hợp
    const av = $("avail");
    av.classList.remove("short");
    if (!p.exam) { fill(av, h("p", { text: "Chọn TOEIC hoặc IELTS để xem số từ phù hợp." })); return; }
    const n = availableCount();
    if (n >= p.count) {
      fill(av, h("p", null, "Có ", h("b", { text: n + " từ" }), " phù hợp bộ lọc. Mỗi lượt lấy ngẫu nhiên " + p.count + " từ, không lặp."),
        h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: () => startMain(), text: "Bắt đầu lượt " + p.count + " từ" })));
    } else {
      av.classList.add("short");
      fill(av, h("p", null, "Bộ lọc này hiện chỉ có ", h("b", { text: n + " từ" }), ", chưa đủ " + p.count + ". AZ không lặp từ để bù cho đủ lượt."),
        h("div", { class: "row" },
          n > 0 ? h("button", { class: "btn", type: "button", onclick: () => startMain(n), text: "Học " + n + " từ hiện có" }) : null,
          p.level !== "all" ? h("button", { class: "btn line", type: "button", onclick: () => { p.level = "all"; save(); renderHome(); }, text: "Đổi sang Mọi mức" }) : null,
          p.topic !== "all" ? h("button", { class: "btn line", type: "button", onclick: () => { p.topic = "all"; save(); renderHome(); }, text: "Đổi sang Tổng hợp" }) : null));
    }
  }

  /* ---------- bắt đầu lượt ---------- */
  function startMain(countOverride) {
    if (locked()) { renderHome(); focusGate(); return; }
    const p = P.prefs, acc = access();
    if (!p.exam) { $("setup").open = true; toast("Chọn TOEIC hoặc IELTS trước."); return; }
    if (P.active && P.active.answers.length && !twice("new", "Bạn đang dở một lượt. Bấm lần nữa để bỏ lượt đó và học lượt mới.")) return;
    let count = countOverride || p.count;
    if (!acc.full) count = Math.min(count, FREE_COUNT);
    const res = C.buildRound(ITEMS, { exam: p.exam, topic: p.topic, level: p.level, dir: p.dir, count, kind: "main" });
    if (!res.ok) { show("scrHome"); renderHome(); $("setup").open = true; $("avail").scrollIntoView({ block: "center" }); return; }
    P.active = res.round; save(); openLearn();
  }
  function startDue() {
    if (locked()) { renderHome(); focusGate(); return; }
    const ids = C.dueIds(P.words, today()).filter(id => BYID[id]);
    if (!ids.length) { toast("Hôm nay chưa có từ đến hạn ôn."); return; }
    const pool = C.shuffle(ids).slice(0, DUE_MAX).map(id => BYID[id]);
    const res = C.buildRound(pool, { exam: null, dir: P.prefs.dir, count: pool.length, kind: "due" });
    P.active = res.round; save(); openLearn();
  }
  function startReview(roundId) {
    if (locked()) { focusGate(); return; }
    const r = P.history.find(x => x.id === roundId);
    const rv = r && C.buildReviewRound(r, BYID);
    if (!rv) return;
    P.active = rv; save(); openLearn();
  }
  function resumeRound() { if (P.active) openLearn(); }
  function abandonRound() {
    if (!P.active) return;
    if (P.active.answers.length && !twice("drop", "Bấm \"Bỏ lượt\" lần nữa để bỏ. Các câu đã trả lời trong lượt này sẽ không được tính.")) return;
    P.active = null; save(); renderHome();
  }

  /* ---------- màn học ---------- */
  function openLearn() { show("scrLearn"); renderQuestion(false); }
  function tickStart() { if (tStart == null && P.active && !$("scrLearn").hidden && document.visibilityState === "visible") tStart = performance.now(); }
  function tickStop() { if (tStart != null) { if (P.active) P.active.elapsedMs += Math.min(performance.now() - tStart, 5 * 60 * 1000); tStart = null; } }

  function renderQuestion(anim) {
    const r = P.active;
    if (!r) { show("scrHome"); renderHome(); return; }
    const i = r.answers.length, n = r.questions.length;
    if (i >= n) { finishRound(); return; }
    const q = r.questions[i], it = BYID[q.itemId], viEn = r.dir === "vi-en", secs = P.prefs.timer || 8;
    $("lTitle").textContent = roundTitle(r);
    $("lSub").textContent = roundSub(r);
    $("lCount").textContent = (i + 1) + "/" + n;
    $("lFill").style.width = (i / n * 100) + "%";
    $("lBar").setAttribute("aria-valuemax", n); $("lBar").setAttribute("aria-valuenow", i);
    renderMute();
    $("hint").textContent = "Mỗi từ " + secs + " giây · phím 1–4 · chữa bài khi xong lượt";
    const card = $("qcard");
    const prompt = h("h2", { class: viEn ? "term vi" : "term", tabindex: "-1", lang: viEn ? "vi" : "en", id: "qTerm", text: viEn ? it.meaningVi : it.term });
    const say = !viEn && canSay(it) ? h("button", { type: "button", class: "say", onclick: () => sayItem(it, true), "aria-label": "Nghe lại phát âm " + it.term }, speakerIcon(), "Nghe") : null;
    fill(card,
      h("div", { class: "qhead" },
        it.contextLabel ? h("span", { class: "ctx", text: "Ngữ cảnh: " + it.contextLabel }) : h("span"),
        h("span", { class: "qsec", id: "qSec", "aria-hidden": "true", text: secs + "s" })),
      h("div", { class: "qtime", "aria-hidden": "true" }, h("i", { id: "qTime" })),
      prompt,
      viEn ? null : h("p", { class: "ipa" }, h("span", { lang: "en", text: it.ipa }), say),
      h("p", { class: "ask", text: viEn ? "Từ/cụm tiếng Anh nào mang nghĩa này?" : "Nghĩa phù hợp nhất:" }),
      h("div", { class: "opts", id: "opts", role: "group", "aria-label": "Bốn lựa chọn" }, q.options.map((o, k) =>
        h("button", { type: "button", class: "opt", lang: viEn ? "en" : "vi", "aria-pressed": "false", onclick: () => choose(k) }, h("span", { class: "k", "aria-hidden": "true", text: String(k + 1) }), h("span", { text: o })))));
    if (anim) { card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter"); }
    lockQ = false; shownAt = performance.now();
    $("live").textContent = "Câu " + (i + 1) + " trên " + n + ", " + secs + " giây";
    prompt.focus({ preventScroll: true });
    tickStart();
    qStart(secs * 1000);
    if (!viEn && P.prefs.speak) sayItem(it, false);
  }

  /* ---------- đồng hồ mỗi từ: dừng khi tab ẩn, hết giờ = tính sai ---------- */
  let qT = null, qRaf = 0, qEnd = 0, qLeft = 0, qTotal = 0;
  function qStart(ms) { qStop(); qTotal = qLeft = ms; qResume(); }
  function qResume() {
    if (qT || !qLeft || lockQ || !P.active || $("scrLearn").hidden || document.visibilityState !== "visible") return;
    qEnd = performance.now() + qLeft;
    qT = setTimeout(() => { qT = null; qLeft = 0; choose(C.TIMEOUT, true); }, qLeft);
    const draw = () => {
      const left = Math.max(0, qEnd - performance.now()), bar = $("qTime"), sec = $("qSec");
      if (bar) { bar.style.width = (left / qTotal * 100) + "%"; bar.classList.toggle("low", left < 3000); }
      if (sec) { sec.textContent = Math.ceil(left / 1000) + "s"; sec.classList.toggle("low", left < 3000); }
    };
    draw(); clearInterval(qRaf); qRaf = setInterval(draw, 200);
  }
  function qPause() { if (qT) { clearTimeout(qT); qT = null; clearInterval(qRaf); qLeft = Math.max(0, qEnd - performance.now()); } }
  function qStop() { if (qT) clearTimeout(qT); qT = null; clearInterval(qRaf); qLeft = 0; }

  function choose(k, timeout) {
    const r = P.active;
    if (!r || lockQ || $("scrLearn").hidden || (!timeout && performance.now() - shownAt < MIN_GAP)) return;
    const i = r.answers.length, q = r.questions[i];
    if (!C.recordAnswer(r, i, k)) return;
    lockQ = true;
    qStop(); tickStop();
    save();                                   // lưu ngay: tải lại lúc đang chuyển thẻ không ghi trùng
    const opts = $("opts");
    opts.classList.add("locked");
    opts.querySelectorAll(".opt").forEach((b, j) => { b.disabled = true; if (j === k) { b.classList.add("picked"); b.setAttribute("aria-pressed", "true"); } });
    if (timeout) { const sec = $("qSec"); if (sec) sec.textContent = "Hết giờ"; }
    tone(k === q.answer);                     // tiếng đúng/sai ngay sau mỗi câu (đáp án đúng vẫn để cuối lượt mới chữa)
    $("live").textContent = timeout ? "Hết giờ" : "Đã chọn";
    let wait = C.SPEEDS[P.prefs.speed] || C.SPEEDS.fast;
    if (r.dir === "vi-en" && P.prefs.speak && canSay(BYID[q.itemId])) { sayItem(BYID[q.itemId], false); wait = Math.max(wait, 900); }   // Việt → Anh: đọc sau khi chọn để không lộ đáp án
    clearTimeout(advT);
    advT = setTimeout(() => { advT = null; if (P.active !== r) return; if (C.isComplete(r)) finishRound(); else renderQuestion(true); }, wait);
  }

  /* ---------- âm thanh: tiếng đúng/sai tổng hợp tại máy, đọc từ bằng giọng có sẵn của thiết bị (không gọi dịch vụ ngoài) ---------- */
  let actx = null;
  function audioCtx() {
    if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { actx = new A(); } catch (e) { return null; } }
    if (actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }
  function tone(ok) {
    if (!P.prefs.sound) return;
    const ctx = audioCtx(); if (!ctx) return;
    const notes = ok ? [[784, 0, .09], [1175, .08, .16]] : [[220, 0, .2], [175, .1, .26]];
    notes.forEach(([f, start, end]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
      o.type = ok ? "sine" : "triangle"; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(ok ? 0.18 : 0.22, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + end);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(ctx.currentTime + end + 0.02);
    });
  }
  const hasTTS = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  const canSay = it => !!it && (C.isSafeAudioUrl(it.audioUrl) || hasTTS());
  let voice = null;
  function pickVoice() {
    if (!hasTTS()) return null;
    const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    // giọng nữ, sáng, vui thường có sẵn: iPhone/Mac (Samantha…), Android/Chrome (Google US English), Windows (Aria, Jenny)
    const BRIGHT = [/aria.*natural|aria online/i, /jenny/i, /samantha/i, /google us english/i, /ava|allison|susan|zira|karen|moira|tessa/i, /female/i];
    for (const re of BRIGHT) { voice = vs.find(v => re.test(v.name)); if (voice) return voice; }
    voice = vs.find(v => /en[-_]US/i.test(v.lang) && v.localService) || vs.find(v => /en[-_](US|GB)/i.test(v.lang)) || vs[0] || null;
    return voice;
  }
  if (hasTTS()) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  // Ưu tiên audio giáo viên thu (audioUrl); chưa có thì dùng giọng đọc của trình duyệt.
  function sayItem(it, manual) {
    if (!it || (!manual && !P.prefs.speak)) return;
    if (C.isSafeAudioUrl(it.audioUrl)) { try { const a = new Audio(it.audioUrl); a.play().catch(() => { if (manual) toast("Chưa phát được âm thanh."); }); } catch (e) {} return; }
    if (!hasTTS()) { if (manual) toast("Thiết bị này chưa hỗ trợ đọc phát âm."); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(it.term);
      u.lang = (voice && voice.lang) || "en-US"; if (voice) u.voice = voice;
      u.pitch = 1.35; u.rate = 1.0; u.volume = 1;   // giọng cao, tươi, phấn khích nhưng vẫn rõ để học viên nghe kịp
      speechSynthesis.speak(u);
    } catch (e) { if (manual) toast("Chưa đọc được phát âm."); }
  }
  function speakerIcon(off) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "spk");
    const d = off ? ["M4 9h4l5-4v14l-5-4H4z", "M17 9l4 6M21 9l-4 6"] : ["M4 9h4l5-4v14l-5-4H4z", "M16.5 8.5a5 5 0 0 1 0 7", "M19 6a8.5 8.5 0 0 1 0 12"];
    d.forEach(x => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", x); s.appendChild(p); });
    return s;
  }
  function renderMute() {
    const on = P.prefs.sound || P.prefs.speak, b = $("mute");
    fill(b, speakerIcon(!on));
    b.setAttribute("aria-pressed", String(!on));
    b.setAttribute("aria-label", on ? "Tắt tiếng và tự đọc" : "Bật tiếng và tự đọc");
  }
  function toggleMute() {
    const on = !(P.prefs.sound || P.prefs.speak);
    P.prefs.sound = P.prefs.speak = on; save(); renderMute();
    if (!on && hasTTS()) speechSynthesis.cancel();
    toast(on ? "Đã bật tiếng đúng/sai và tự đọc từ." : "Đã tắt tiếng.");
  }

  function quitLearn() {
    clearTimeout(advT); advT = null; qStop(); tickStop(); save();
    if (hasTTS()) speechSynthesis.cancel();
    show("scrHome"); renderHome();
    toast("Đã lưu. Bấm Tiếp tục để học nốt lượt.");
  }

  function finishRound() {
    const r = P.active; if (!r) return;
    clearTimeout(advT); advT = null; qStop(); tickStop();
    r.finishedAt = Date.now();
    const d = today();
    P.history.push(r); P.active = null;
    C.applySchedule(P.words, r, d);
    if (!P.days.includes(d)) P.days.push(d);
    P.lastPracticed = d;
    if (r.kind === "main" && !access().full) S.markFreeUsed();
    save();
    resultTab = "all";
    showResult(r.id);
  }

  /* ---------- màn kết quả ---------- */
  function showResult(id) {
    const r = P.history.find(x => x.id === id);
    if (!r) { show("scrHome"); renderHome(); return; }
    renderWho();
    const s = C.scoreRound(r), rootId = r.rootId || r.id;
    const chain = P.history.filter(x => x.id === rootId || x.rootId === rootId).sort((a, b) => a.finishedAt - b.finishedAt);
    const reviewNo = chain.filter(x => x.kind === "review").indexOf(r) + 1;
    const eyebrow = r.kind === "review" ? "Kết quả lượt ôn " + reviewNo : r.kind === "due" ? "Kết quả ôn theo lịch" : "Kết quả lượt đầu";
    const isLocked = locked(), wrongN = s.wrongIds.length;
    const box = $("scrResult");
    const head = h("div", { class: "card rhead" },
      h("p", { class: "eyebrow", text: eyebrow }),
      h("h1", { id: "rTitle", class: "sr", text: eyebrow + ": " + s.correct + " trên " + s.total }),
      h("div", { class: "score", "aria-hidden": "true" }, String(s.correct), h("small", { text: "/" + s.total })),
      h("p", { class: "muted", text: roundTitle(r) + " · " + roundSub(r) }),
      h("div", { class: "kpis" },
        h("div", null, h("b", { text: s.pct + "%" }), h("span", { text: "tỉ lệ đúng" })),
        h("div", null, h("b", { text: fmtDur(r.elapsedMs) }), h("span", { text: "thời gian" })),
        h("div", null, h("b", { text: String(wrongN) }), h("span", { text: "từ cần ôn" }))),
      h("p", { class: "cmt", text: C.comment(s, r.kind) }),
      chain.length > 1 ? h("div", { class: "chain" }, h("b", { text: "Lượt đầu và các lượt ôn (tách riêng)" }),
        h("ul", null, chain.map((x, j) => { const sx = C.scoreRound(x); return h("li", { text: (x.kind === "review" ? "Lượt ôn " + j : "Lượt đầu") + ": " + sx.correct + "/" + sx.total + (x.kind === "review" ? " — đã trả lời đúng khi ôn" : " (" + sx.pct + "%, giữ nguyên)") }); })),
        h("p", { class: "muted small", text: "Điểm lượt đầu không thay đổi khi ôn. Trả lời đúng sau khi đã xem đáp án chưa có nghĩa là đã nhớ lâu — hãy ôn lại theo lịch 1, 3, 7 ngày." })) : null);
    const lockSub = isLocked ? h("span", { class: "lock", text: "· mở sau đăng ký" }) : null;
    const acts = h("div", { class: "acts" },
      wrongN ? h("button", { class: "btn", type: "button", onclick: () => isLocked ? focusGate() : startReview(r.id) }, "Ôn lại " + wrongN + " từ sai", lockSub) : null,
      h("button", { class: wrongN ? "btn line" : "btn", type: "button", onclick: () => isLocked ? focusGate() : startMain() }, "Học lượt mới", isLocked ? h("span", { class: "lock", text: "· mở sau đăng ký" }) : null),
      h("button", { class: "btn line", type: "button", onclick: () => { show("scrHome"); renderHome(); }, text: "Trở về chủ đề" }));
    const tabs = h("div", { class: "tabs", role: "group", "aria-label": "Lọc danh sách chữa bài" },
      h("button", { type: "button", "aria-pressed": String(resultTab === "all"), onclick: () => { resultTab = "all"; showResult(id); }, text: "Tất cả (" + s.total + ")" }),
      h("button", { type: "button", "aria-pressed": String(resultTab === "wrong"), onclick: () => { resultTab = "wrong"; showResult(id); }, text: "Từ chọn sai (" + wrongN + ")" }));
    const rows = s.rows.filter(x => resultTab === "all" || !x.correct);
    const list = h("div", { class: "rlist" }, rows.length ? rows.map(x => reviewItem(x, r)) : h("p", { class: "card empty", text: "Không có từ chọn sai trong lượt này." }));
    fill(box, head, isLocked ? gateCard("result") : null, acts, h("h2", { class: "sr", text: "Chữa bài" }), tabs, list);
    show("scrResult");
    $("app").focus({ preventScroll: true });
  }
  function reviewItem(x, r) {
    const it = BYID[x.itemId];
    if (!it) return h("div", { class: "card ritem", text: "Mục " + x.itemId + " không còn trong học liệu." });
    const viEn = r.dir === "vi-en";
    return h("article", { class: "card ritem" + (x.correct ? "" : " bad") },
      h("div", { class: "rt" }, h("b", { lang: "en", text: it.term }), h("span", { class: "ipa2", lang: "en", text: it.ipa }),
        canSay(it) ? h("button", { type: "button", class: "say sm", onclick: () => sayItem(it, true), "aria-label": "Nghe phát âm " + it.term }, speakerIcon()) : null,
        h("span", { class: "pos", text: it.partOfSpeech }),
        h("span", { class: "mark", text: x.correct ? "Đúng" : x.timedOut ? "Hết giờ" : (x.chosenText == null ? "Chưa trả lời" : "Sai") })),
      h("dl", null,
        h("dt", { text: "Nghĩa" }), h("dd", { text: it.meaningVi + (it.contextLabel ? " (ngữ cảnh: " + it.contextLabel + ")" : "") }),
        !x.correct && x.chosenText != null ? [h("dt", { text: "Bạn chọn" }), h("dd", { class: "you", lang: viEn ? "en" : "vi", text: x.chosenText })] : null,
        h("dt", { text: "Ví dụ" }), h("dd", null, h("span", { class: "ex", lang: "en", text: it.exampleEn }), h("br"), h("span", { text: it.exampleVi })),
        h("dt", { text: "Cách dùng" }), h("dd", { text: it.usageNoteVi }),
        it.confusionNoteVi ? [h("dt", { text: "Dễ nhầm" }), h("dd", { text: it.confusionNoteVi })] : null));
  }

  /* ---------- cổng mở khoá sau 10 từ miễn phí ---------- */
  function focusGate() { const f = document.querySelector(".gate input, .gate a"); const g = document.querySelector(".gate"); if (g) g.scrollIntoView({ block: "start", behavior: "smooth" }); if (f) setTimeout(() => f.focus({ preventScroll: true }), 300); }
  function gateCard(where) {
    const acc = access(), academy = (CFG.academy || "academy.html") + "?next=" + encodeURIComponent(location.pathname);   // Academy chỉ chuyển về trang cùng tên miền
    if (acc.acad.state === "expired") {
      return h("div", { class: "card gate" }, h("h2", { text: "Tài khoản dùng thử đã hết hạn" }),
        h("p", { class: "sub", text: "Bạn đã học xong lượt miễn phí. Để học tiếp AZ Vocabulary và các chương trình trong AZIELTS Academy, liên hệ AZEnglish để đăng ký khoá học hoặc gia hạn." }),
        h("a", { class: "btn block", href: "tel:" + String(CFG.phone || "").replace(/\s/g, ""), text: "Gọi / Zalo " + (CFG.phone || "") }),
        h("p", { class: "alt" }, h("a", { href: academy, text: "Đăng nhập tài khoản khác ở Academy" })));
    }
    const err = h("p", { class: "err", role: "alert" });
    const f = {
      name: h("input", { id: "gName", autocomplete: "name", required: true, maxlength: "80" }),
      phone: h("input", { id: "gPhone", type: "tel", inputmode: "tel", autocomplete: "tel", required: true, maxlength: "16" }),
      email: h("input", { id: "gEmail", type: "email", autocomplete: "email", required: true, maxlength: "120" }),
      pw: h("input", { id: "gPw", type: "password", autocomplete: "new-password", required: true, minlength: "6", maxlength: "64" })
    };
    const btn = h("button", { class: "btn block", type: "submit", text: "Tạo tài khoản và học tiếp" });
    const form = h("form", { novalidate: true, onsubmit: e => { e.preventDefault(); register(f, btn, err); } },
      h("label", { for: "gName", text: "Họ và tên" }), f.name,
      h("label", { for: "gPhone", text: "Số điện thoại (dùng làm tên đăng nhập)" }), f.phone,
      h("label", { for: "gEmail", text: "Email" }), f.email,
      h("label", { for: "gPw", text: "Đặt mật khẩu (từ 6 ký tự)" }), f.pw,
      err, btn,
      h("p", { class: "fine", text: "Tài khoản dùng chung với AZIELTS Academy. AZEnglish có thể liên hệ qua số điện thoại hoặc email để tư vấn lộ trình học." }));
    return h("div", { class: "card gate", id: "gate" },
      h("h2", { text: where === "home" ? "Bạn đã học xong 10 từ miễn phí" : "Mở khoá để học tiếp — miễn phí" }),
      h("p", { class: "sub", text: "Tạo tài khoản AZIELTS Academy dùng thử 7 ngày, không cần thanh toán:" }),
      h("ul", null, h("li", { text: "Ôn lại từ sai và học lượt mới không giới hạn" }), h("li", { text: "Lượt 20 hoặc 30 từ, ôn theo lịch 1 · 3 · 7 ngày" }), h("li", { text: "Dùng thử các chương trình IELTS khác trong Academy" })),
      form,
      h("p", { class: "alt" }, "Đã có tài khoản? ", h("a", { href: academy, text: "Đăng nhập ở Academy" })),
      where === "home" && P.history.length ? h("p", { class: "alt" }, h("button", { class: "link", type: "button", onclick: () => showResult(P.history[P.history.length - 1].id), text: "Xem lại kết quả lượt vừa học" })) : null);
  }
  async function hashPw(u, p) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(u.trim().toLowerCase() + "|azacad|" + p)); let s = ""; new Uint8Array(b).forEach(x => { s += String.fromCharCode(x); }); return btoa(s); }
  function normPhone(v) { let d = String(v).replace(/[^\d+]/g, ""); if (d.startsWith("+84")) d = "0" + d.slice(3); else if (d.startsWith("84") && d.length === 11) d = "0" + d.slice(2); return d.replace(/\D/g, ""); }
  async function register(f, btn, err) {
    err.textContent = "";
    const name = f.name.value.trim(), phone = normPhone(f.phone.value), email = f.email.value.trim(), pw = f.pw.value;
    if (name.length < 2) { err.textContent = "Nhập họ và tên của bạn."; f.name.focus(); return; }
    if (!/^0\d{8,10}$/.test(phone)) { err.textContent = "Số điện thoại chưa đúng (ví dụ 0971882096)."; f.phone.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Nhập email đúng định dạng."; f.email.focus(); return; }
    if (pw.length < 6) { err.textContent = "Mật khẩu cần ít nhất 6 ký tự."; f.pw.focus(); return; }
    if (!CFG.api) { err.textContent = "Bản chạy thử này chưa nối máy chủ tài khoản. Hãy bấm \"Đăng nhập ở Academy\" để đăng ký."; return; }
    btn.disabled = true; btn.textContent = "Đang tạo tài khoản…";
    try {
      const res = await fetch(CFG.api, { method: "POST", body: JSON.stringify({ t: "register", u: phone, ph: await hashPw(phone, pw), cls: "", name, phone, email, dev: S.deviceId() }) });
      const j = await res.json();
      if (j && j.ok && j.s) {
        S.saveAcademySession(j.s);
        toast("Đã mở khoá. Chúc bạn học tốt!");
        if (!$("scrResult").hidden && P.history.length) showResult(P.history[P.history.length - 1].id); else { show("scrHome"); renderHome(); }
        return;
      }
      const m = (j && j.error) || "Không tạo được tài khoản.";
      err.textContent = /đã có|tồn tại/i.test(m) ? m + " Nếu đây là số của bạn, hãy đăng nhập ở Academy." : m;
    } catch (e) { err.textContent = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."; }
    btn.disabled = false; btn.textContent = "Tạo tài khoản và học tiếp";
  }

  /* ---------- xuất / nhập / xoá tiến độ ---------- */
  function openData() {
    const d = $("dlgData"), due = C.dueIds(P.words, today()).length;
    fill($("dSum"), P.history.length + " lượt đã học · " + Object.keys(P.words).length + " từ đã gặp · " + due + " từ đến hạn ôn · chuỗi " + C.streak(P.days, today()) + " ngày" + (P.lastPracticed ? " · luyện gần nhất " + vnDate(P.lastPracticed) : ""));
    $("dMsg").textContent = ""; $("dMsg").className = "dlg-msg"; $("dConflict").hidden = true; $("dClearBox").hidden = true; pendingImport = null;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  function dataMsg(t, ok) { const m = $("dMsg"); m.textContent = t; m.className = "dlg-msg " + (ok ? "good" : "bad"); }
  function sanitizeActive(p) { if (p.active && !p.active.questions.every(q => BYID[q.itemId])) p.active = null; return p; }
  function applyImport(mode) {
    if (!pendingImport) return;
    P = sanitizeActive(mode === "merge" ? C.mergeProgress(P, pendingImport) : pendingImport);
    save(); pendingImport = null; $("dConflict").hidden = true;
    dataMsg(mode === "merge" ? "Đã gộp tiến độ." : "Đã thay bằng tiến độ từ file.", true);
    renderHome();
  }
  function bindData() {
    $("openData").onclick = openData;
    $("dExport").onclick = () => { S.exportFile(P); dataMsg("Đã tạo file tiến độ. Kiểm tra thư mục Tải về.", true); };
    $("dImport").onchange = e => {
      const file = e.target.files && e.target.files[0]; e.target.value = "";
      if (!file) return;
      if (file.size > 5e6) { dataMsg("File quá lớn (tối đa 5 MB).", false); return; }
      const rd = new FileReader();
      rd.onload = () => {
        const r = S.parseImport(String(rd.result));
        if (!r.ok) { dataMsg("Không nhập được: " + r.errors.slice(0, 3).join("; "), false); return; }
        pendingImport = r.progress;
        if (S.hasData(P)) { $("dConflict").hidden = false; dataMsg("File hợp lệ: " + r.progress.history.length + " lượt học.", true); }
        else applyImport("replace");
      };
      rd.onerror = () => dataMsg("Không đọc được file.", false);
      rd.readAsText(file);
    };
    $("dMerge").onclick = () => applyImport("merge");
    $("dReplace").onclick = () => applyImport("replace");
    $("dClear").onclick = () => { $("dClearBox").hidden = false; $("dClearYes").focus(); };
    $("dClearNo").onclick = () => { $("dClearBox").hidden = true; };
    $("dClearYes").onclick = () => { S.clear(); P = C.emptyProgress(); save(); $("dClearBox").hidden = true; dataMsg("Đã xoá toàn bộ tiến độ trên máy này.", true); fill($("dSum"), "0 lượt đã học"); renderHome(); };
  }

  /* ---------- sự kiện chung ---------- */
  function bindGlobal() {
    $("quit").onclick = quitLearn;
    $("mute").onclick = toggleMute;
    document.addEventListener("keydown", e => {
      if ($("scrLearn").hidden || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); choose(Number(e.key) - 1); }
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { qPause(); if (tStart != null) { tickStop(); save(); } } else { tickStart(); qResume(); } });
    window.addEventListener("pagehide", () => { if (tStart != null) { tickStop(); save(); } });
    window.addEventListener("storage", e => {
      if (e.key === "az_acad") { renderWho(); if (!$("scrHome").hidden) renderHome(); }
      // tab khác vừa lưu tiến độ: nạp lại khi tab này không đang học, tránh ghi đè bằng bản cũ
      if (e.key === "azv_progress_v1" && $("scrLearn").hidden) { P = S.load().progress; if (!$("scrHome").hidden) renderHome(); }
    });
  }

  async function init() {
    const logo = document.querySelector(".logo");
    if (CFG.home) { logo.href = CFG.home; logo.setAttribute("aria-label", CFG.homeLabel || "Về trang chủ"); } else if (CFG.academy) logo.href = CFG.academy;
    bindGlobal(); bindData();
    const st = S.load(); P = st.progress;
    renderWho();
    const res = await loadBanks();
    const ls = $("loadState");
    if (!ITEMS.length) {
      ls.className = "state err";
      fill(ls, h("b", { text: "Không tải được học liệu." }),
        location.protocol === "file:" ? "Trang đang mở trực tiếp từ file. Hãy chạy qua localhost (xem docs/VOCABULARY_README.md) hoặc mở trên GitHub Pages." : "Kiểm tra kết nối mạng rồi tải lại trang. " + res.bad.join(" · "));
      return;
    }
    ls.hidden = true; $("homeBody").hidden = false;
    const notes = [];
    if (st.notice) notes.push(st.notice);
    if (res.bad.length) notes.push("Một phần học liệu có lỗi: " + res.bad.join(" · "));
    if (P.active && !P.active.questions.every(q => BYID[q.itemId])) { P.active = null; save(); notes.push("Học liệu vừa được cập nhật nên lượt đang dở không tiếp tục được."); }
    if (notes.length) { $("notice").hidden = false; $("notice").textContent = notes.join(" "); }
    renderHome();
  }
  init();
})();
