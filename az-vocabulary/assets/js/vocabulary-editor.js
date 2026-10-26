/* Biên tập học liệu AZ Vocabulary: nhập/sửa/xoá/xem trước/kiểm tra/xuất JSON. Không đăng lên web, không chứa token.
   Dữ liệu nhập chỉ được JSON.parse và hiển thị bằng textContent/value — không thực thi. */
(function () {
  "use strict";
  const C = window.AZVCore, $ = id => document.getElementById(id);
  const DRAFT = "azv_editor_draft_";
  const FIELDS = [
    ["term", "Từ / cụm tiếng Anh"], ["ipa", "Phiên âm IPA"], ["partOfSpeech", "Từ loại"], ["meaningVi", "Nghĩa đúng theo ngữ cảnh"],
    ["contextLabel", "Nhãn ngữ cảnh (tuỳ chọn)", true], ["exampleEn", "Câu ví dụ tiếng Anh", false, "ta"], ["exampleVi", "Dịch câu ví dụ", false, "ta"],
    ["usageNoteVi", "Giải thích cách dùng", false, "ta"], ["confusionNoteVi", "Lưu ý dễ nhầm (tuỳ chọn)", true, "ta"],
    ["audioUrl", "audioUrl (tuỳ chọn, ví dụ audio/toeic/agenda.mp3)", true], ["sourceUrl", "sourceUrl (tuỳ chọn, https://…)", true],
    ["reviewer", "Người duyệt (chỉ điền khi đã duyệt thật)", true], ["reviewedAt", "Ngày duyệt YYYY-MM-DD", true]
  ];
  let bank = null, sel = null, toastT, armed = {};
  function twice(key, msg) { if (armed[key]) { delete armed[key]; return true; } armed[key] = true; toast(msg); setTimeout(() => { delete armed[key]; }, 4000); return false; }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "text") el.textContent = v; else if (k === "class") el.className = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v); }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    return el;
  }
  function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  function out(msg, ok) { const o = $("eOut"); o.textContent = msg; o.className = "ed-out " + (ok ? "good" : "bad"); }
  const exam = () => $("eExam").value;
  function persist() { try { localStorage.setItem(DRAFT + exam(), JSON.stringify(bank)); } catch (e) {} }

  function setBank(b, note) {
    if (!b || b.schema !== "azv-bank" || !Array.isArray(b.items) || !Array.isArray(b.topics)) { out("File không đúng cấu trúc học liệu AZ Vocabulary (schema \"azv-bank\").", false); return; }
    if (b.exam !== exam()) $("eExam").value = b.exam;
    bank = b; sel = null; persist(); renderTopics(); renderList(); renderForm();
    if (note) out(note, true);
  }
  async function loadSite() {
    try { const r = await fetch("data/vocabulary-" + exam() + ".json", { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); setBank(await r.json(), "Đã tải bộ " + exam().toUpperCase() + " đang có trên web."); }
    catch (e) { out("Không tải được file từ web (" + e.message + "). Nếu mở trực tiếp từ file, hãy chạy qua localhost hoặc dùng \"Nhập file JSON\".", false); }
  }
  function loadDraftOrSite() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT + exam()) || "null"); } catch (e) { d = null; }
    if (d) setBank(d, "Đang mở bản nháp đã lưu trong trình duyệt. Bấm \"Tải bản đang có trên web\" để bỏ bản nháp."); else loadSite();
  }

  function renderTopics() {
    const s = $("eTopic"), cur = s.value;
    s.replaceChildren(h("option", { value: "all", text: "Mọi chủ đề" }), ...bank.topics.map(t => h("option", { value: t.id, text: t.nameVi })));
    s.value = bank.topics.some(t => t.id === cur) ? cur : "all";
  }
  function visible() {
    const t = $("eTopic").value, q = C.norm($("eSearch").value);
    return bank.items.filter(it => (t === "all" || it.topic === t) && (!q || C.norm([it.id, it.term, it.meaningVi].join(" ")).includes(q)));
  }
  function renderList() {
    const ids = bank.topics.map(t => t.id), items = visible();
    $("eInfo").textContent = items.length + " / " + bank.items.length + " mục";
    $("eList").replaceChildren(...items.map(it => {
      const bad = C.validateItem(it, ids).errors.length;
      return h("button", { type: "button", "aria-current": String(sel === it.id), onclick: () => { sel = it.id; renderList(); renderForm(); } },
        h("span", { class: bad ? "bad" : null, text: (bad ? "⚠ " : "") + it.term }), h("small", { text: it.id + " · " + (C.LEVEL_VI[it.level] || it.level) + " · " + it.reviewStatus }));
    }));
  }
  function field(it, [k, label, opt, kind]) {
    const v = it[k] == null ? "" : it[k];
    const inp = kind === "ta" ? h("textarea", { id: "f_" + k }) : h("input", { id: "f_" + k });
    inp.value = v;
    return [h("label", { for: "f_" + k, text: label }), inp];
  }
  function renderForm() {
    const f = $("eForm"), it = bank && bank.items.find(x => x.id === sel);
    if (!it) { f.replaceChildren(h("p", { class: "muted", text: "Chọn một mục ở danh sách hoặc bấm \"Thêm mục mới\"." })); return; }
    const opts = (vals, cur, names) => vals.map(v => { const o = h("option", { value: v, text: names ? names[v] || v : v }); if (v === cur) o.selected = true; return o; });
    const three = (k, arr) => h("div", { class: "three" }, [0, 1, 2].map(i => { const x = h("input", { id: "f_" + k + i, "aria-label": k + " " + (i + 1) }); x.value = (arr || [])[i] || ""; return x; }));
    f.replaceChildren(...[
      h("h2", { text: it.term || "(mục mới)", style: "font-size:20px" }),
      h("label", { text: "ID (ổn định, không đổi sau khi đã dùng)" }), h("input", { id: "f_id", value: it.id, readonly: true }),
      h("div", { class: "two" },
        h("div", null, h("label", { for: "f_topic", text: "Chủ đề" }), h("select", { id: "f_topic" }, opts(bank.topics.map(t => t.id), it.topic, Object.fromEntries(bank.topics.map(t => [t.id, t.nameVi]))))),
        h("div", null, h("label", { for: "f_level", text: "Độ khó (mức học liệu AZ)" }), h("select", { id: "f_level" }, opts(C.LEVELS, it.level, C.LEVEL_VI)))),
      FIELDS.slice(0, 5).map(x => field(it, x)),
      h("label", { text: "3 nghĩa nhiễu tiếng Việt (cùng loại, độ dài gần nhau, không đồng nghĩa với nghĩa đúng)" }), three("dvi", it.distractorsVi),
      h("label", { text: "3 phương án nhiễu tiếng Anh cho chiều Việt → Anh (không được đúng với nghĩa)" }), three("ren", it.reverseDistractorsEn),
      FIELDS.slice(5).map(x => field(it, x)),
      h("label", { for: "f_reviewStatus", text: "Trạng thái duyệt" }), h("select", { id: "f_reviewStatus" }, opts(["draft", "reviewed", "needs-fix"], it.reviewStatus, { draft: "Bản nháp — chưa duyệt", reviewed: "Đã duyệt", "needs-fix": "Cần sửa" })),
      h("div", { class: "ed-acts" },
        h("button", { class: "btn", type: "button", onclick: saveItem, text: "Lưu mục này" }),
        h("button", { class: "btn line", type: "button", onclick: preview, text: "Xem trước câu hỏi" }),
        h("button", { class: "btn ghost-red", type: "button", onclick: delItem, text: "Xoá mục" })),
      h("div", { id: "fOut", class: "ed-out", role: "status" }),
      h("div", { id: "fPreview", class: "pv" })].flat(Infinity).filter(Boolean));
  }
  function readForm() {
    const it = bank.items.find(x => x.id === sel), g = id => $(id).value.trim(), n = v => v === "" ? null : v;
    const next = Object.assign({}, it, { topic: g("f_topic"), level: g("f_level"), reviewStatus: g("f_reviewStatus"),
      distractorsVi: [0, 1, 2].map(i => g("f_dvi" + i)), reverseDistractorsEn: [0, 1, 2].map(i => g("f_ren" + i)) });
    FIELDS.forEach(([k, , opt]) => { next[k] = opt ? n(g("f_" + k)) : g("f_" + k); });
    return next;
  }
  function saveItem() {
    const next = readForm(), r = C.validateItem(next, bank.topics.map(t => t.id));
    const o = $("fOut");
    bank.items[bank.items.findIndex(x => x.id === sel)] = next; persist(); renderList();
    $("eForm").querySelector("h2").textContent = next.term || "(mục mới)";
    o.className = "ed-out " + (r.errors.length ? "bad" : "good");
    o.textContent = r.errors.length ? "Đã lưu nháp nhưng còn lỗi:\n• " + r.errors.join("\n• ") : "Đã lưu. Mục hợp lệ." + (r.warnings.length ? "\nLưu ý:\n• " + r.warnings.join("\n• ") : "");
  }
  function preview() {
    const it = readForm(), pv = $("fPreview");
    const row = dir => {
      const ok = dir === "en-vi" ? it.meaningVi && it.distractorsVi.every(Boolean) : it.term && it.reverseDistractorsEn.every(Boolean);
      if (!ok) return h("p", { class: "muted", text: "Chưa đủ nội dung để xem trước chiều " + dir + "." });
      const q = C.makeQuestion(it, dir);
      return h("div", { class: "qcard", style: "margin-top:10px" },
        it.contextLabel ? h("span", { class: "ctx", text: "Ngữ cảnh: " + it.contextLabel }) : null,
        h("h3", { class: dir === "vi-en" ? "term vi" : "term", text: dir === "vi-en" ? it.meaningVi : it.term }),
        dir === "en-vi" ? h("p", { class: "ipa", text: it.ipa }) : null,
        h("div", { class: "opts", style: "margin-top:12px" }, q.options.map((o, k) => h("div", { class: "opt" + (k === q.answer ? " picked" : "") }, h("span", { class: "k", text: String(k + 1) }), h("span", { text: o + (k === q.answer ? "  ✓ đáp án" : "") })))));
    };
    pv.replaceChildren(h("p", { class: "muted small", text: "Xem trước (đáp án được đánh dấu chỉ trong công cụ biên tập; học viên không thấy dấu này khi học):" }), row("en-vi"), row("vi-en"));
  }
  function delItem() {
    const it = bank.items.find(x => x.id === sel);
    if (!it || !twice("del" + it.id, "Bấm \"Xoá mục\" lần nữa để xoá \"" + it.term + "\" khỏi bản nháp.")) return;
    bank.items = bank.items.filter(x => x.id !== sel); sel = null; persist(); renderList(); renderForm(); toast("Đã xoá khỏi bản nháp.");
  }
  function newItem() {
    if (!bank) return;
    const topic = $("eTopic").value !== "all" ? $("eTopic").value : bank.topics[0].id;
    let n = bank.items.filter(i => i.topic === topic).length + 1, id;
    do { id = bank.exam + "-" + topic + "-" + String(n++).padStart(2, "0"); } while (bank.items.some(i => i.id === id));
    bank.items.push({ id, exam: bank.exam, topic, level: "basic", term: "", ipa: "", partOfSpeech: "", meaningVi: "", contextLabel: null, distractorsVi: ["", "", ""], reverseDistractorsEn: ["", "", ""],
      exampleEn: "", exampleVi: "", usageNoteVi: "", confusionNoteVi: null, audioUrl: null, contentVersion: bank.contentVersion || "draft", sourceType: "az-original", sourceUrl: null, reviewStatus: "draft", reviewer: null, reviewedAt: null });
    sel = id; persist(); renderList(); renderForm(); $("f_term").focus();
  }
  function checkAll() {
    const v = C.validateBank(bank);
    out((v.errors.length ? "✗ " + v.errors.length + " lỗi" : "✓ Không có lỗi") + " · " + v.items.length + " mục hợp lệ · " + v.warnings.length + " lưu ý" +
      (v.errors.length ? "\n• " + v.errors.slice(0, 40).join("\n• ") : "") + (v.warnings.length ? "\nLưu ý:\n• " + v.warnings.slice(0, 40).join("\n• ") : "") +
      "\nKiểm tra tự động không thay thế giáo viên duyệt nghĩa và độ tự nhiên.", !v.errors.length);
    return v;
  }
  function exportJson() {
    const v = checkAll();
    if (v.errors.length && !twice("exp", "Còn " + v.errors.length + " lỗi (trang học sẽ ẩn các mục lỗi). Bấm \"Xuất JSON\" lần nữa để vẫn xuất.")) return;
    const blob = new Blob([JSON.stringify(bank, null, 1) + "\n"], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "vocabulary-" + bank.exam + ".json" });
    document.body.append(a); a.click(); a.remove();
    toast("Đã xuất vocabulary-" + bank.exam + ".json — thay vào thư mục data/ rồi đẩy lên GitHub.");
  }

  $("eExam").onchange = loadDraftOrSite;
  $("eLoad").onclick = () => { try { localStorage.removeItem(DRAFT + exam()); } catch (e) {} loadSite(); };
  $("eFile").onchange = e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    if (file.size > 5e6) { out("File quá lớn (tối đa 5 MB).", false); return; }
    const rd = new FileReader();
    rd.onload = () => { try { setBank(JSON.parse(String(rd.result)), "Đã nhập " + file.name + "."); } catch (x) { out("File không phải JSON hợp lệ.", false); } };
    rd.readAsText(file);
  };
  $("eTopic").onchange = renderList;
  $("eSearch").oninput = renderList;
  $("eNew").onclick = newItem;
  $("eCheck").onclick = () => bank && checkAll();
  $("eExport").onclick = () => bank && exportJson();
  loadDraftOrSite();
})();
