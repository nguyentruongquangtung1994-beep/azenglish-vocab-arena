/* AZ Vocabulary — lõi logic thuần (không đụng DOM, không lưu trữ).
   Dùng chung cho trang học, trang biên tập và kiểm thử Node (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AZVCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EXAMS = ["toeic", "ielts"];
  const LEVELS = ["basic", "intermediate", "advanced"];
  const LEVEL_VI = { basic: "Cơ bản", intermediate: "Trung cấp", advanced: "Nâng cao" };
  const REVIEW_STATUS = ["draft", "reviewed", "needs-fix"];
  const DIRS = ["en-vi", "vi-en"];
  const COUNTS = [10, 20, 30];
  const SPEEDS = { fast: 350, medium: 650, slow: 1000 };
  const TIMERS = [5, 8, 12];            // giây cho mỗi từ
  const TIMEOUT = -1;                    // lựa chọn đặc biệt: hết giờ, tính như sai
  const INTERVALS = [1, 3, 7];           // gợi ý ôn sau 1, 3, 7 ngày
  const REQ_STR = ["id", "exam", "topic", "level", "term", "ipa", "partOfSpeech", "meaningVi",
    "exampleEn", "exampleVi", "usageNoteVi", "contentVersion", "sourceType", "reviewStatus"];
  const OPT_STR = ["contextLabel", "confusionNoteVi", "audioUrl", "sourceUrl", "reviewer", "reviewedAt"];
  const ITEM_KEYS = REQ_STR.concat(OPT_STR, ["distractorsVi", "reverseDistractorsEn"]);

  /* ---------- tiện ích ---------- */
  const norm = s => String(s == null ? "" : s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  function makeRng(seed) {                       // mulberry32: cho kiểm thử lặp lại được
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rng) {
    const a = arr.slice(), r = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const uid = (rng) => Date.now().toString(36) + Math.floor((rng || Math.random)() * 1e9).toString(36);

  /* ---------- ngày địa phương ---------- */
  function localDate(d) { d = d || new Date(); const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function addDays(dateStr, n) { const [y, m, d] = dateStr.split("-").map(Number); return localDate(new Date(y, m - 1, d + n)); }
  function streak(days, today) {                 // số ngày học liên tiếp tính đến hôm nay (hoặc hôm qua)
    const set = new Set(days || []); let cur = set.has(today) ? today : addDays(today, -1), n = 0;
    while (set.has(cur)) { n++; cur = addDays(cur, -1); }
    return n;
  }

  /* ---------- kiểm tra học liệu ---------- */
  const HTML_RE = /<\s*\/?\s*[a-z!]|javascript:/i;
  function validateItem(it, topicIds) {
    const errors = [], warnings = [], id = it && it.id ? it.id : "(không có id)";
    const E = m => errors.push(id + ": " + m), W = m => warnings.push(id + ": " + m);
    if (!it || typeof it !== "object" || Array.isArray(it)) return { errors: ["Mục không phải object"], warnings };
    for (const k of REQ_STR) {
      if (typeof it[k] !== "string") E("thiếu trường bắt buộc " + k);
      else if (!it[k].trim()) E("chuỗi trống ở " + k);
    }
    for (const k of OPT_STR) if (it[k] != null && typeof it[k] !== "string") E(k + " phải là chuỗi hoặc null");
    for (const k of OPT_STR) if (typeof it[k] === "string" && !it[k].trim()) E("chuỗi trống ở " + k + " (dùng null nếu không có)");
    for (const k of Object.keys(it)) if (!ITEM_KEYS.includes(k)) W("trường lạ " + k + " sẽ bị bỏ qua");
    if (typeof it.id === "string" && !/^[a-z0-9][a-z0-9-]{2,80}$/.test(it.id)) E("id chỉ gồm chữ thường không dấu, số, gạch nối");
    if (it.exam != null && !EXAMS.includes(it.exam)) E("exam không hợp lệ: " + it.exam);
    if (it.level != null && !LEVELS.includes(it.level)) E("level không hợp lệ: " + it.level);
    if (it.reviewStatus != null && !REVIEW_STATUS.includes(it.reviewStatus)) E("reviewStatus không hợp lệ: " + it.reviewStatus);
    if (topicIds && typeof it.topic === "string" && !topicIds.includes(it.topic)) E("chủ đề chưa khai báo: " + it.topic);
    if (it.reviewStatus === "reviewed" && (!it.reviewer || !it.reviewedAt)) E("đã duyệt thì phải có reviewer và reviewedAt");
    if (it.reviewStatus !== "reviewed" && (it.reviewer || it.reviewedAt)) W("có tên người duyệt nhưng reviewStatus chưa là reviewed");
    checkOptions(it.meaningVi, it.distractorsVi, "distractorsVi", E, W);
    checkOptions(it.term, it.reverseDistractorsEn, "reverseDistractorsEn", E, W);
    for (const k of ITEM_KEYS) {
      const v = it[k], list = Array.isArray(v) ? v : [v];
      for (const s of list) if (typeof s === "string" && HTML_RE.test(s)) E(k + " chứa thẻ HTML hoặc javascript: — không cho phép");
    }
    if (typeof it.audioUrl === "string" && !isSafeAudioUrl(it.audioUrl)) E("audioUrl phải là đường dẫn tương đối hoặc https tới file .mp3/.m4a/.ogg/.wav");
    if (typeof it.sourceUrl === "string" && !/^https:\/\//.test(it.sourceUrl)) E("sourceUrl phải bắt đầu bằng https://");
    if (typeof it.exampleEn === "string" && typeof it.term === "string" && it.exampleEn.trim() && !looselyContains(it.exampleEn, it.term)) W("câu ví dụ không chứa nguyên dạng từ/cụm (kiểm tra lại biến thể)");
    return { errors, warnings };
  }
  function checkOptions(correct, list, name, E, W) {
    if (!Array.isArray(list)) { E(name + " phải là mảng 3 mục"); return; }
    if (list.length !== 3) E(name + " cần đúng 3 mục (đang có " + list.length + ")");
    const seen = new Set();
    list.forEach((s, i) => {
      if (typeof s !== "string" || !s.trim()) { E(name + "[" + i + "] trống"); return; }
      const n = norm(s);
      if (seen.has(n)) E(name + " có đáp án trùng: " + s);
      seen.add(n);
      if (typeof correct === "string" && n === norm(correct)) E(name + " chứa chính đáp án đúng: " + s);
      if (typeof correct === "string" && correct.trim()) {
        const r = s.length / correct.length;
        if (r > 2.2 || r < 0.4) W(name + " \"" + s + "\" chênh độ dài nhiều so với đáp án đúng");
      }
    });
  }
  function looselyContains(sentence, term) {
    const s = norm(sentence), words = norm(term).replace(/\(.*?\)/g, "").split(/[\s-]+/).filter(w => w.length > 2 && !["your", "the", "and", "for", "sth", "with"].includes(w));
    return words.every(w => s.includes(w.slice(0, Math.max(3, w.length - 3))));
  }
  function isSafeAudioUrl(u) {
    if (typeof u !== "string" || !u) return false;
    if (/^(javascript|data|vbscript):/i.test(u.trim())) return false;
    return /^(https:\/\/[^\s]+|(?!\/\/)[a-z0-9_./-]+)\.(mp3|m4a|ogg|wav)(\?[^\s]*)?$/i.test(u.trim());
  }
  function validateBank(bank) {
    const errors = [], warnings = [], valid = [];
    if (!bank || typeof bank !== "object") return { errors: ["File không phải JSON object"], warnings, items: valid, topics: [] };
    if (bank.schema !== "azv-bank") errors.push("schema phải là \"azv-bank\"");
    if (!EXAMS.includes(bank.exam)) errors.push("exam của bộ từ không hợp lệ");
    const topics = Array.isArray(bank.topics) ? bank.topics.filter(t => t && typeof t.id === "string" && typeof t.nameVi === "string") : [];
    if (!topics.length) errors.push("thiếu danh sách topics");
    const tIds = topics.map(t => t.id);
    if (new Set(tIds).size !== tIds.length) errors.push("trùng id chủ đề");
    if (!Array.isArray(bank.items)) { errors.push("thiếu mảng items"); return { errors, warnings, items: valid, topics }; }
    const ids = new Map(), terms = new Map();
    bank.items.forEach((it, i) => {
      const r = validateItem(it, tIds);
      if (it && it.exam && bank.exam && it.exam !== bank.exam) r.errors.push((it.id || "#" + i) + ": exam khác với exam của file");
      if (it && typeof it.id === "string") {
        if (ids.has(it.id)) r.errors.push(it.id + ": ID trùng với mục #" + ids.get(it.id));
        else ids.set(it.id, i);
      }
      if (it && typeof it.term === "string") {
        const k = norm(it.term);
        if (terms.has(k)) r.warnings.push(it.id + ": từ \"" + it.term + "\" đã có ở " + terms.get(k));
        else terms.set(k, it.id);
      }
      errors.push(...r.errors); warnings.push(...r.warnings);
      if (!r.errors.length) valid.push(it);
    });
    return { errors, warnings, items: valid, topics };
  }

  /* ---------- tạo lượt học ---------- */
  function filterItems(items, f) {
    return items.filter(it => (!f.exam || it.exam === f.exam) && (!f.topic || f.topic === "all" || it.topic === f.topic) && (!f.level || f.level === "all" || it.level === f.level));
  }
  function makeQuestion(it, dir, rng) {
    const correct = dir === "vi-en" ? it.term : it.meaningVi;
    const wrong = dir === "vi-en" ? it.reverseDistractorsEn : it.distractorsVi;
    const options = shuffle([correct].concat(wrong), rng);
    return { itemId: it.id, options, answer: options.indexOf(correct) };
  }
  // Trả về { ok:true, round } hoặc { ok:false, available } khi không đủ từ (không lặp từ để bù).
  function buildRound(items, opt, rng) {
    const pool = filterItems(items, opt), count = opt.count;
    if (pool.length < count) return { ok: false, available: pool.length };
    const picked = shuffle(pool, rng).slice(0, count);
    return { ok: true, round: newRound(picked, opt, rng) };
  }
  function newRound(picked, opt, rng) {
    return {
      id: "r" + uid(rng), kind: opt.kind || "main", parentId: opt.parentId || null, rootId: opt.rootId || null,
      exam: opt.exam, topic: opt.topic || "all", level: opt.level || "all", dir: opt.dir || "en-vi",
      questions: picked.map(it => makeQuestion(it, opt.dir || "en-vi", rng)),
      answers: [], elapsedMs: 0, startedAt: Date.now(), finishedAt: null
    };
  }
  // Ghi đáp án cho câu qIndex (choice = TIMEOUT khi hết giờ). Chỉ nhận khi đúng là câu đang chờ (chặn bấm 2 lần / tải lại lúc chuyển thẻ).
  function recordAnswer(round, qIndex, choice) {
    if (!round || round.finishedAt) return false;
    if (qIndex !== round.answers.length || qIndex >= round.questions.length) return false;
    const q = round.questions[qIndex];
    if (!Number.isInteger(choice) || choice < TIMEOUT || choice >= q.options.length) return false;
    round.answers.push({ itemId: q.itemId, choice });
    return true;
  }
  const isComplete = r => !!r && r.answers.length >= r.questions.length;
  function scoreRound(round) {
    const rows = round.questions.map((q, i) => {
      const a = round.answers[i];
      return { itemId: q.itemId, chosenText: a && a.choice >= 0 ? q.options[a.choice] : null, timedOut: !!a && a.choice === TIMEOUT, correctText: q.options[q.answer], correct: !!a && a.choice === q.answer };
    });
    const total = rows.length, correct = rows.filter(r => r.correct).length;
    return { total, correct, pct: total ? Math.round(correct / total * 100) : 0, rows, wrongIds: rows.filter(r => !r.correct).map(r => r.itemId) };
  }
  function buildReviewRound(round, itemsById, rng) {
    const s = scoreRound(round), picked = shuffle(s.wrongIds.map(id => itemsById[id]).filter(Boolean), rng);
    if (!picked.length) return null;
    return newRound(picked, { kind: "review", parentId: round.id, rootId: round.rootId || round.id, exam: round.exam, topic: round.topic, level: round.level, dir: round.dir }, rng);
  }
  function hasDuplicateItems(round) { const ids = round.questions.map(q => q.itemId); return new Set(ids).size !== ids.length; }

  /* ---------- lịch ôn 1 / 3 / 7 ngày ---------- */
  // Lượt chính hoặc lượt "ôn đến hạn" mới cập nhật lịch; lượt ôn ngay sau khi chữa bài không đổi lịch.
  function applySchedule(words, round, today) {
    if (round.kind === "review") return words;
    const s = scoreRound(round);
    for (const r of s.rows) {
      const w = words[r.itemId] || { seen: 0, right: 0, wrong: 0, stage: 0, due: null, last: null };
      w.seen++; if (r.correct) w.right++; else w.wrong++;
      if (!r.correct) { w.stage = 0; w.due = addDays(today, INTERVALS[0]); }
      else if (round.kind === "due" || w.seen > 1) { w.stage = Math.min(w.stage + 1, INTERVALS.length); w.due = w.stage >= INTERVALS.length ? null : addDays(today, INTERVALS[w.stage]); }
      else { w.stage = 1; w.due = addDays(today, INTERVALS[1]); }
      w.last = today; words[r.itemId] = w;
    }
    return words;
  }
  const dueIds = (words, today) => Object.keys(words || {}).filter(id => words[id] && words[id].due && words[id].due <= today);

  /* ---------- tiến độ: kiểm tra, gộp ---------- */
  function emptyProgress() {
    return { schema: "azv-progress", version: 1, updatedAt: null, prefs: { exam: null, topic: "all", level: "all", count: 10, dir: "en-vi", speed: "fast", timer: 8, sound: true, speak: true }, active: null, history: [], words: {}, days: [], lastPracticed: null };
  }
  function validRound(r) {
    return r && typeof r === "object" && typeof r.id === "string" && Array.isArray(r.questions) && Array.isArray(r.answers) &&
      r.questions.every(q => q && typeof q.itemId === "string" && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === "string") && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4) &&
      r.answers.length <= r.questions.length && r.answers.every((a, i) => a && a.itemId === r.questions[i].itemId && Number.isInteger(a.choice) && a.choice >= TIMEOUT && a.choice < 4) && !hasDuplicateItems(r);
  }
  function validateProgress(p) {
    const errors = [];
    if (!p || typeof p !== "object") return { ok: false, errors: ["Không phải JSON object"] };
    if (p.schema !== "azv-progress") errors.push("Không phải file tiến độ AZ Vocabulary (schema sai)");
    if (p.version !== 1) errors.push("Phiên bản tiến độ không hỗ trợ: " + p.version);
    if (p.active != null && !validRound(p.active)) errors.push("Lượt đang học bị hỏng");
    if (!Array.isArray(p.history) || !p.history.every(validRound)) errors.push("Lịch sử lượt học bị hỏng");
    if (!p.words || typeof p.words !== "object" || Array.isArray(p.words)) errors.push("Dữ liệu từ đã học bị hỏng");
    else for (const k of Object.keys(p.words)) { const w = p.words[k]; if (!w || typeof w !== "object" || (w.due != null && !/^\d{4}-\d{2}-\d{2}$/.test(w.due))) { errors.push("Từ " + k + " có lịch ôn sai"); break; } }
    if (!Array.isArray(p.days) || !p.days.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) errors.push("Danh sách ngày học bị hỏng");
    return { ok: !errors.length, errors };
  }
  // Gộp tiến độ nhập vào với tiến độ hiện có: lịch sử hợp theo id, từ lấy bản học gần nhất, giữ cài đặt hiện tại.
  function mergeProgress(cur, inc) {
    const out = JSON.parse(JSON.stringify(cur));
    const ids = new Set(out.history.map(r => r.id));
    for (const r of inc.history) if (!ids.has(r.id)) out.history.push(r);
    out.history.sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
    for (const [k, w] of Object.entries(inc.words)) { const c = out.words[k]; if (!c || (w.last || "") > (c.last || "")) out.words[k] = w; }
    out.days = Array.from(new Set(out.days.concat(inc.days))).sort();
    out.lastPracticed = [out.lastPracticed, inc.lastPracticed].filter(Boolean).sort().pop() || null;
    if (!out.active && inc.active) out.active = inc.active;
    return out;
  }

  /* ---------- nhận xét trung thực ---------- */
  function comment(s, kind) {
    if (kind === "review") return s.correct === s.total ? "Bạn đã trả lời đúng tất cả từ khi ôn. Đây là đúng sau khi đã xem đáp án, chưa phải đã nhớ lâu — hãy quay lại theo lịch ôn." : "Vẫn còn " + (s.total - s.correct) + " từ chưa đúng. Đọc lại ví dụ và cách dùng rồi ôn tiếp.";
    if (s.pct === 100) return "Bạn nhận diện đúng nghĩa của tất cả từ trong lượt này. Bước tiếp theo: thử đặt câu với vài cụm — nhận ra nghĩa chưa có nghĩa là đã dùng được khi nói và viết.";
    if (s.pct >= 80) return "Phần lớn từ bạn đã nhận diện đúng nghĩa. Xem kỹ các từ chọn sai bên dưới rồi ôn lại ngay.";
    if (s.pct >= 50) return "Bạn đúng khoảng " + s.pct + "%. Nhiều từ còn chưa chắc — đọc ví dụ, ôn lại từ sai và quay lại sau 1 ngày.";
    return "Nhiều từ trong lượt này còn mới với bạn, điều đó bình thường ở lần đầu. Đọc ví dụ và lưu ý dễ nhầm bên dưới, rồi ôn lại từ sai.";
  }

  return { EXAMS, LEVELS, LEVEL_VI, DIRS, COUNTS, SPEEDS, TIMERS, TIMEOUT, INTERVALS, norm, makeRng, shuffle, localDate, addDays, streak,
    validateItem, validateBank, isSafeAudioUrl, filterItems, makeQuestion, buildRound, recordAnswer, isComplete, scoreRound,
    buildReviewRound, hasDuplicateItems, applySchedule, dueIds, emptyProgress, validateProgress, validRound, mergeProgress, comment };
});
