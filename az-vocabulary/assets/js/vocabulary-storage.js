/* AZ Vocabulary — lưu tiến độ trên thiết bị (localStorage) + đọc phiên đăng nhập AZIELTS Academy.
   Không gửi dữ liệu học tập ra ngoài. Mọi truy cập bộ nhớ đều bọc try/catch (chế độ riêng tư có thể chặn). */
(function (root) {
  "use strict";
  const C = root.AZVCore;
  const KEY = "azv_progress_v1", FREE = "azv_free_used", ACAD = "az_acad", DEV = "az_dev";
  const MAX_HISTORY = 60, MAX_DAYS = 120;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // Trả về { progress, notice } — notice có nội dung khi dữ liệu cũ bị hỏng hoặc không đọc được.
  function load() {
    const raw = get(KEY);
    if (!raw) return { progress: C.emptyProgress(), notice: null };
    try {
      const p = JSON.parse(raw), v = C.validateProgress(p);
      if (v.ok) return { progress: Object.assign(C.emptyProgress(), p, { prefs: Object.assign(C.emptyProgress().prefs, p.prefs || {}) }), notice: null };
      set(KEY + "_hong", raw);
      return { progress: C.emptyProgress(), notice: "Tiến độ cũ trên máy bị hỏng nên đã bắt đầu lại. Bản cũ được giữ riêng để giáo viên kiểm tra." };
    } catch (e) {
      set(KEY + "_hong", raw);
      return { progress: C.emptyProgress(), notice: "Không đọc được tiến độ cũ trên máy, đã bắt đầu lại." };
    }
  }
  function save(p) {
    p.updatedAt = Date.now();
    if (p.history.length > MAX_HISTORY) p.history = p.history.slice(-MAX_HISTORY);
    if (p.days.length > MAX_DAYS) p.days = p.days.slice(-MAX_DAYS);
    return set(KEY, JSON.stringify(p));
  }
  function clear() { del(KEY); }

  // Lượt học thử miễn phí 10 từ: cờ riêng, không nằm trong file tiến độ.
  const freeUsed = () => get(FREE) === "1";
  const markFreeUsed = () => set(FREE, "1");

  // Phiên AZIELTS Academy dùng chung tên miền: { state: "none" | "active" | "expired", name, tier, exp }
  function academy() {
    let s = null;
    try { s = JSON.parse(get(ACAD) || "null"); } catch (e) { s = null; }
    if (!s || !s.u) return { state: "none" };
    const today = C.localDate();
    const active = !s.exp || String(s.exp) >= today;
    return { state: active ? "active" : "expired", name: String(s.name || s.u), tier: s.tier || "", exp: s.exp || "" };
  }
  function saveAcademySession(s) { return set(ACAD, JSON.stringify(s)); }
  function deviceId() {     // cùng định dạng với Academy để máy chủ đếm thiết bị thống nhất
    let d = get(DEV);
    if (!d) { d = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); if (!set(DEV, d)) d = "nolocal"; }
    return d;
  }

  /* ---------- xuất / nhập ---------- */
  function exportFile(p) {
    const blob = new Blob([JSON.stringify(p, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "az-vocabulary-tien-do-" + C.localDate() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // Trả về { ok, progress, errors }. Chỉ JSON.parse — không bao giờ thực thi nội dung nhập.
  function parseImport(text) {
    if (typeof text !== "string" || text.length > 5e6) return { ok: false, errors: ["File quá lớn hoặc không phải văn bản"] };
    let p;
    try { p = JSON.parse(text); } catch (e) { return { ok: false, errors: ["File không phải JSON hợp lệ"] }; }
    const v = C.validateProgress(p);
    return v.ok ? { ok: true, progress: Object.assign(C.emptyProgress(), p), errors: [] } : { ok: false, errors: v.errors };
  }
  const hasData = p => !!(p && (p.history.length || p.active || Object.keys(p.words).length));

  root.AZVStore = { load, save, clear, freeUsed, markFreeUsed, academy, saveAcademySession, deviceId, exportFile, parseImport, hasData };
})(typeof self !== "undefined" ? self : this);
