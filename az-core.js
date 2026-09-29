/* AZ Core — module dùng chung cho trang chủ và các trang học Vocab Arena.
 * - Tự chọn cấp độ + số từ/buổi theo bài test đầu vào (hồ sơ az_vocab_profile / az_vocab_tests)
 * - Đua top Tuần / Tháng / Quý: cộng dồn XP từ mọi lộ trình, gửi về Apps Script (tab "AZ Leaderboard"), tối đa 300 XP/ngày
 * - Dải Top 3 + bảng xếp hạng đầy đủ
 * - 📒 Sổ từ của tôi (từ đã học, trạng thái, tải CSV)
 * - ✍️ Từ của tôi: học viên tự nhập từ, ôn bằng mini-game chọn đáp án + lặp lại ngắt quãng — KHÔNG tính điểm xếp hạng
 * Trang học khai báo window.AZ_COURSE = { id, key, name } trước khi nạp file này.
 */
(function(){
  "use strict";
  var API = "https://script.google.com/macros/s/AKfycbzD1v2aekzEeyMBQ-2uD-2TRHBN9xX0__V6aAU5YZ4BFhlO4D9WEZtXr7CcwM4Gc2j1/exec";
  var XP_KEYS = ["azvocab_v1_communication1500", "azvocab_v2_toeic_a2b2", "azvocab_v2_ielts1000", "azvocab_v1_career9"];
  var DAILY_CAP = 300;
  var MASTERED_IVL = 21;
  var COURSE = window.AZ_COURSE || null;

  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  function lsJSON(k){ try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch(e){ return null; } }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function el(html){ var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function onReady(fn){ if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }

  var profile = lsJSON("az_vocab_profile");
  var tests = lsJSON("az_vocab_tests") || [];
  var lastTest = tests.length ? tests[tests.length - 1] : null;

  /* ---------- mốc thời gian theo giờ Việt Nam ---------- */
  function vnParts(){ var d = new Date(Date.now() + 7 * 3600e3); return { y:d.getUTCFullYear(), m:d.getUTCMonth() + 1, d:d.getUTCDate() }; }
  function isoWeek(y, m, d){
    var t = new Date(Date.UTC(y, m - 1, d)), day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { y:t.getUTCFullYear(), w:Math.ceil(((t - y0) / 864e5 + 1) / 7) };
  }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function keys(){
    var p = vnParts(), iw = isoWeek(p.y, p.m, p.d);
    return { day:"D" + p.y + "-" + pad(p.m) + "-" + pad(p.d), week:"W" + iw.y + "-" + pad(iw.w), month:"M" + p.y + "-" + pad(p.m), quarter:"Q" + p.y + "-" + Math.ceil(p.m / 3) };
  }

  /* ---------- danh tính ẩn danh cho bảng xếp hạng (băm SĐT, không gửi SĐT) ---------- */
  var uid = lsGet("az_core_uid");
  function ensureUid(cb){
    if(uid) return cb(uid);
    var phone = profile && profile.phone;
    if(phone && window.crypto && crypto.subtle && window.TextEncoder){
      crypto.subtle.digest("SHA-256", new TextEncoder().encode("az-vocab|" + phone)).then(function(buf){
        uid = "u" + Array.prototype.map.call(new Uint8Array(buf).slice(0, 8), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
        lsSet("az_core_uid", uid); cb(uid);
      }).catch(function(){ uid = "r" + Math.random().toString(36).slice(2, 12); lsSet("az_core_uid", uid); cb(uid); });
    } else { uid = "r" + Math.random().toString(36).slice(2, 12); lsSet("az_core_uid", uid); cb(uid); }
  }
  function shortName(full){
    var p = String(full || "").trim().split(/\s+/).filter(Boolean);
    if(p.length <= 1) return p[0] || "Học viên";
    return p.slice(p.length >= 3 ? -2 : -1).join(" ") + " " + p[0].charAt(0).toUpperCase() + ".";
  }
  function displayName(){ return lsGet("az_core_nick") || shortName(profile && profile.name); }

  /* ---------- theo dõi XP từ mọi lộ trình → điểm đua top ---------- */
  function totalXp(){ return XP_KEYS.reduce(function(s, k){ var m = lsJSON(k + "_meta"); return s + ((m && m.xp) || 0); }, 0); }
  function trackXp(){
    var cur = totalXp(), seen = lsGet("az_core_xp_seen");
    if(seen === null){ lsSet("az_core_xp_seen", String(cur)); return; }
    seen = +seen || 0;
    if(cur > seen){
      var k = keys(), led = lsJSON("az_core_xpday") || {};
      if(led.k !== k.day) led = { k:k.day, v:0 };
      var allow = Math.max(0, Math.min(cur - seen, DAILY_CAP - led.v));
      led.v += allow; lsSet("az_core_xpday", JSON.stringify(led));
      if(allow) lsSet("az_core_xp_pending", String((+lsGet("az_core_xp_pending") || 0) + allow));
    }
    lsSet("az_core_xp_seen", String(cur));
  }
  function flushXp(useBeacon){
    var pending = +lsGet("az_core_xp_pending") || 0;
    if(!pending || !profile || !profile.phone) return;
    ensureUid(function(id){
      var body = JSON.stringify({ source:"AZ-Vocab-XP", uid:id, name:displayName(), level:profile.level || "", delta:pending });
      lsSet("az_core_xp_pending", "0");
      try{
        if(useBeacon && navigator.sendBeacon) navigator.sendBeacon(API, new Blob([body], { type:"text/plain;charset=utf-8" }));
        else fetch(API, { method:"POST", mode:"no-cors", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body:body }).catch(function(){});
      }catch(e){}
      try{ sessionStorage.removeItem("az_core_lb"); }catch(e){}
    });
  }
  trackXp();
  setInterval(trackXp, 4000);
  setInterval(function(){ flushXp(false); }, 30000);
  document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "hidden"){ trackXp(); flushXp(true); } });
  window.addEventListener("pagehide", function(){ trackXp(); flushXp(true); });
  setTimeout(function(){ flushXp(false); }, 2500);

  /* ---------- CSS dùng chung ---------- */
  var CSS = ''
  + '.azc-strip{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;background:var(--paper-2);border:1.5px solid var(--line);border-radius:18px;padding:10px 14px;box-shadow:0 2px 0 var(--line);cursor:pointer;font-family:var(--font-body);color:var(--ink);text-align:left;font-size:13.5px}'
  + '.azc-strip:hover{border-color:var(--red)}'
  + '.azc-strip .t{font-family:var(--font-display);font-weight:800;font-size:14px;white-space:nowrap}'
  + '.azc-strip .ppl{flex:1;min-width:0;display:flex;gap:10px;flex-wrap:wrap}'
  + '.azc-strip .ppl span{white-space:nowrap}'
  + '.azc-strip .me{font-size:12.5px;color:var(--ink-soft);width:100%}'
  + '.azc-btn{flex:none;border:1.5px solid var(--line);background:var(--paper-2);color:var(--ink);width:38px;height:38px;border-radius:12px;cursor:pointer;font-size:16px;display:inline-flex;align-items:center;justify-content:center}'
  + '.azc-btn:hover{border-color:var(--red)}'
  + '.azc-auto{margin:8px 0 0;font-size:12.5px;color:var(--ink-soft)}.azc-auto b{color:var(--red)}'
  + '.azm{position:fixed;inset:0;z-index:300;display:none;background:rgba(20,12,8,.55);backdrop-filter:blur(3px);align-items:flex-end;justify-content:center}'
  + '.azm.open{display:flex}'
  + '.azm-box{width:100%;max-width:560px;max-height:92vh;overflow:auto;background:var(--paper);color:var(--ink);border-radius:24px 24px 0 0;padding:18px 18px calc(22px + env(safe-area-inset-bottom));font-family:var(--font-body);box-shadow:0 -10px 40px rgba(0,0,0,.35)}'
  + '@media(min-width:640px){.azm{align-items:center}.azm-box{border-radius:24px}}'
  + '.azm-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.azm-head h3{flex:1;margin:0;font:800 20px var(--font-display)}'
  + '.azm-x{width:38px;height:38px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper-2);color:var(--ink-soft);cursor:pointer;font-size:16px}'
  + '.azm-tabs{display:flex;gap:6px;margin-bottom:12px}.azm-tabs button{flex:1;border:1.5px solid var(--line);background:var(--paper-2);color:var(--ink-soft);border-radius:12px;padding:9px 6px;font:700 13.5px var(--font-body);cursor:pointer}'
  + '.azm-tabs button.on{background:var(--red);border-color:var(--red);color:#fff}'
  + '.azm-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--line);font-size:14px}'
  + '.azm-row .rk{width:30px;text-align:center;font:800 15px var(--font-display);color:var(--ink-soft)}.azm-row .nm{flex:1;min-width:0;font-weight:700}.azm-row .nm small{display:block;font-weight:500;color:var(--ink-soft);font-size:11.5px}.azm-row .xp{font:800 15px var(--font-display);color:var(--red);font-variant-numeric:tabular-nums}'
  + '.azm-row.me{background:var(--red-bg);border-radius:12px}'
  + '.azm-note{font-size:12.5px;color:var(--ink-soft);line-height:1.55;margin:10px 0 0}'
  + '.azm-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.azm-chips button{border:1.5px solid var(--line);background:var(--paper-2);color:var(--ink);border-radius:99px;padding:6px 12px;font:700 12.5px var(--font-body);cursor:pointer}.azm-chips button.on{border-color:var(--red);color:var(--red);background:var(--red-bg)}'
  + '.azm-input{width:100%;min-height:46px;border-radius:12px;border:1.5px solid var(--line);background:var(--paper-2);color:var(--ink);padding:10px 12px;font:500 15px var(--font-body);box-sizing:border-box}.azm-input:focus{outline:none;border-color:var(--red)}'
  + 'textarea.azm-input{min-height:96px;resize:vertical}'
  + '.azm-grid{display:grid;gap:8px}.azm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}'
  + '.azm-primary{width:100%;min-height:52px;border:0;border-radius:16px;background:var(--red);color:#fff;font:800 16px var(--font-display);cursor:pointer;box-shadow:0 5px 0 var(--red-ink)}'
  + '.azm-primary:disabled{opacity:.5;cursor:default}'
  + '.azm-ghost{min-height:44px;border:1.5px solid var(--line);border-radius:14px;background:var(--paper-2);color:var(--ink);font:700 14px var(--font-body);cursor:pointer;padding:0 14px}'
  + '.azm-sec{font:800 15px var(--font-display);margin:16px 0 8px}'
  + '.azm-word{display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid var(--line);font-size:14px}.azm-word .w{font-weight:800}.azm-word .m{flex:1;min-width:0;color:var(--ink-soft)}.azm-word .dot{width:9px;height:9px;border-radius:50%;flex:none}'
  + '.azm-word .sm{font-size:11.5px;color:var(--ink-soft);white-space:nowrap}.azm-word button{border:0;background:none;cursor:pointer;font-size:15px;color:var(--ink-soft)}'
  + '.azm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.azm-stats div{background:var(--paper-2);border:1.5px solid var(--line);border-radius:14px;padding:10px;text-align:center}.azm-stats b{display:block;font:800 20px var(--font-display)}.azm-stats span{font-size:11.5px;color:var(--ink-soft)}'
  + '.azq-card{background:var(--paper-2);border:1.5px solid var(--line);border-radius:20px;padding:20px;text-align:center;margin-bottom:12px}.azq-card .mn{font:800 24px/1.3 var(--font-display)}.azq-card .ex{font-size:13.5px;color:var(--ink-soft);margin-top:6px}'
  + '.azq-bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin-bottom:12px}.azq-bar i{display:block;height:100%;background:var(--ember,#c47f0e);border-radius:99px;transition:width .2s linear}'
  + '.azq-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.azq-opts button{min-height:54px;border:2px solid var(--line);border-radius:14px;background:var(--paper-2);color:var(--ink);font:700 15px var(--font-body);cursor:pointer;box-shadow:0 3px 0 var(--line)}'
  + '.azq-opts button.ok{border-color:#1e9e5a;background:rgba(30,158,90,.14)}.azq-opts button.no{border-color:var(--red);background:var(--red-bg)}'
  + '.azq-rate{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.azq-rate button{min-height:52px;border-radius:14px;border:1.5px solid var(--line);background:var(--paper-2);color:var(--ink);font:700 13.5px var(--font-body);cursor:pointer}.azq-rate button small{display:block;font-weight:500;color:var(--ink-soft);font-size:11px}'
  + '.azq-meta{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);margin-bottom:8px;font-weight:700}';
  var SKIN = ''
  /* Giao diện trang học đồng bộ với trang chủ (chỉ áp cho trang học) */
  + ':root{--paper:#fffaf3;--paper-2:#fffdf9;--paper-3:#fdf3e4;--ink:#241a12;--ink-soft:#6b5c50;--line:#f0e3cf;--red:#e0102b;--red-ink:#8f0a1c;--red-bg:#fde6e8;--gold:#e0102b;--ember:#c47f0e;--tier1:#1e7a4c}'
  + '@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#241a16;--paper-2:#2d2119;--paper-3:#33251c;--ink:#fbeee2;--ink-soft:#cbb6a6;--line:#4a382c;--red:#ff5a68;--red-ink:#b3202f;--red-bg:#3d1c1f;--gold:#ff5a68;--ember:#f0a83d;--tier1:#5fd394;color-scheme:dark}}'
  + ':root[data-theme="dark"]{--paper:#241a16;--paper-2:#2d2119;--paper-3:#33251c;--ink:#fbeee2;--ink-soft:#cbb6a6;--line:#4a382c;--red:#ff5a68;--red-ink:#b3202f;--red-bg:#3d1c1f;--gold:#ff5a68;--ember:#f0a83d;--tier1:#5fd394;color-scheme:dark}'
  + ':root[data-theme="light"]{--paper:#fffaf3;--paper-2:#fffdf9;--paper-3:#fdf3e4;--ink:#241a12;--ink-soft:#6b5c50;--line:#f0e3cf;--red:#e0102b;--red-ink:#8f0a1c;--red-bg:#fde6e8;--gold:#e0102b;--ember:#c47f0e;--tier1:#1e7a4c;color-scheme:light}'
  + 'body{background:var(--paper)!important}#globeCanvas,#cuteBg,.cute-bg,#notifyBtn,#xpPill,#leaderboardBtn{display:none!important}'
  + '.azc-amb{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}.azc-amb i{position:absolute;border-radius:50%;filter:blur(70px)}.azc-amb .a{width:440px;height:440px;top:-130px;right:-70px;background:var(--red);opacity:.08}.azc-amb .b{width:380px;height:380px;bottom:-150px;left:-110px;background:var(--tier1);opacity:.08}'
  + '.masthead{border-bottom:1.5px solid var(--line)!important;padding-bottom:14px}.mark{border-radius:14px!important;box-shadow:0 3px 0 var(--red-ink)}'
  + '.music-vol-row{display:none!important}html.azc-music .music-vol-row{display:flex!important}'
  + '#scoreboard,.scoreboard,.stack>.progress-track{display:none!important}'
  + '.panel,.card,.home-hero{background:var(--paper-2)!important;border:1.5px solid var(--line)!important;border-radius:22px!important;box-shadow:0 2px 0 var(--line)!important}'
  + '.home-cta,.hero-cta{border-radius:18px!important;min-height:60px;font-family:var(--font-display);box-shadow:0 6px 0 var(--red-ink)!important;background:var(--red)!important;color:#fff!important;width:100%}'
  + '.mode-btn{border-radius:16px!important}'
  + '@media(max-width:520px){.eyebrow{display:none}.masthead{gap:8px}.masthead{flex-wrap:wrap;row-gap:10px}.masthead-text{min-width:0;flex:1 1 calc(100% - 64px)}.title{font-size:19px!important;line-height:1.2!important}.masthead>.mark~*:not(.masthead-text){flex:0 0 auto}}';

  function injectCss(){
    var s = document.createElement("style"); s.textContent = CSS + (COURSE ? SKIN : ""); document.head.appendChild(s);
  }

  /* ---------- modal chung ---------- */
  var modal, modalBox;
  function openModal(title, bodyNode){
    if(!modal){
      modal = el('<div class="azm" role="dialog" aria-modal="true"><div class="azm-box"></div></div>');
      modalBox = modal.firstChild;
      modal.addEventListener("click", function(e){ if(e.target === modal) closeModal(); });
      document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeModal(); });
      document.body.appendChild(modal);
    }
    modalBox.innerHTML = '<div class="azm-head"><h3>' + title + '</h3><button class="azm-x" type="button" aria-label="Đóng">✕</button></div>';
    modalBox.querySelector(".azm-x").addEventListener("click", closeModal);
    modalBox.appendChild(bodyNode);
    modal.classList.add("open"); document.documentElement.style.overflow = "hidden";
    modalBox.scrollTop = 0;
  }
  function closeModal(){ if(modal){ modal.classList.remove("open"); document.documentElement.style.overflow = ""; if(qTimer){ clearInterval(qTimer); qTimer = null; } } }

  /* ---------- Bảng xếp hạng ---------- */
  var PERIOD = { week:"Tuần này", month:"Tháng này", quarter:"Quý này" };
  function fetchBoard(cb){
    try{ var c = JSON.parse(sessionStorage.getItem("az_core_lb") || "null"); if(c && Date.now() - c.t < 60000) return cb(c.d); }catch(e){}
    ensureUid(function(id){
      fetch(API + "?lb=1&me=" + encodeURIComponent(id)).then(function(r){ return r.json(); }).then(function(d){
        try{ sessionStorage.setItem("az_core_lb", JSON.stringify({ t:Date.now(), d:d })); }catch(e){}
        cb(d);
      }).catch(function(){ cb(null); });
    });
  }
  var MEDAL = ["🥇", "🥈", "🥉"];
  function renderStrip(node){
    node.innerHTML = '<span class="t">🏆 Top tuần</span><span class="ppl">Đang tải bảng xếp hạng…</span>';
    fetchBoard(function(d){
      if(!d || !d.week){ node.innerHTML = '<span class="t">🏆 Đua top tuần</span><span class="ppl">Học để ghi tên mình lên bảng xếp hạng!</span>'; return; }
      var top = d.week.top.slice(0, 3);
      node.innerHTML = '<span class="t">🏆 Top tuần</span><span class="ppl">' +
        (top.length ? top.map(function(p, i){ return '<span>' + MEDAL[i] + ' ' + esc(p.n) + ' <b>' + p.xp + '</b></span>'; }).join("") : '<span>Chưa ai ghi điểm tuần này — vào học để giành 🥇!</span>') +
        '</span><span class="me">' + meLine(d.week) + ' · Xem bảng Tuần / Tháng / Quý ›</span>';
    });
  }
  function meLine(b){
    if(b.me) return 'Bạn đang hạng <b>' + b.me.rank + '</b> với ' + b.me.xp + ' XP';
    return 'Bạn chưa có điểm kỳ này';
  }
  function openBoard(){
    var body = el('<div><div class="azm-tabs"><button type="button" data-p="week" class="on">Tuần</button><button type="button" data-p="month">Tháng</button><button type="button" data-p="quarter">Quý</button></div><div class="azm-list">Đang tải…</div>' +
      '<p class="azm-note">Điểm = XP từ các lộ trình học (học từ mới, ôn đúng, chơi game), tối đa ' + DAILY_CAP + ' XP/ngày. Từ tự nhập không tính điểm. Tên hiển thị: <b>' + esc(displayName()) + '</b> · <a href="#" class="azc-nick" style="color:var(--red)">đổi biệt danh</a></p></div>');
    var list = body.querySelector(".azm-list"), data = null, cur = "week";
    function draw(){
      if(!data){ list.innerHTML = '<p class="azm-note">Chưa tải được bảng xếp hạng. Kiểm tra kết nối mạng rồi thử lại.</p>'; return; }
      var b = data[cur];
      list.innerHTML = '<p class="azm-note" style="margin:0 0 6px">' + PERIOD[cur] + ' · ' + (b.total || 0) + ' người tham gia</p>' +
        (b.top.length ? b.top.map(function(p, i){ return '<div class="azm-row"><span class="rk">' + (MEDAL[i] || (i + 1)) + '</span><span class="nm">' + esc(p.n) + (p.l ? '<small>' + esc(p.l) + '</small>' : '') + '</span><span class="xp">' + p.xp + '</span></div>'; }).join("")
          : '<p class="azm-note">Chưa có ai ghi điểm kỳ này.</p>') +
        '<div class="azm-row me"><span class="rk">' + (b.me ? b.me.rank : "–") + '</span><span class="nm">Bạn · ' + esc(displayName()) + '</span><span class="xp">' + (b.me ? b.me.xp : 0) + '</span></div>';
    }
    Array.prototype.forEach.call(body.querySelectorAll(".azm-tabs button"), function(bt){
      bt.addEventListener("click", function(){ cur = bt.dataset.p; Array.prototype.forEach.call(body.querySelectorAll(".azm-tabs button"), function(x){ x.classList.toggle("on", x === bt); }); draw(); });
    });
    body.querySelector(".azc-nick").addEventListener("click", function(e){
      e.preventDefault();
      var box = el('<div class="azm-grid" style="margin-top:10px"><input class="azm-input" id="azcNickInput" maxlength="18" placeholder="Biệt danh (tối đa 18 ký tự)" /><button class="azm-primary" type="button">Lưu biệt danh</button></div>');
      box.querySelector("input").value = displayName();
      box.querySelector("button").addEventListener("click", function(){
        var v = box.querySelector("input").value.trim().slice(0, 18);
        if(v){ lsSet("az_core_nick", v); lsSet("az_core_xp_pending", String((+lsGet("az_core_xp_pending") || 0))); }
        openBoard();
      });
      e.target.parentNode.appendChild(box);
    });
    openModal("🏆 Đua top học từ", body);
    fetchBoard(function(d){ data = d; draw(); });
  }
  function mountStrip(){
    var strip = el('<button class="azc-strip" type="button" aria-label="Xem bảng xếp hạng"></button>');
    strip.addEventListener("click", openBoard);
    if(COURSE){
      var mh = document.querySelector(".masthead");
      if(mh && mh.parentNode) mh.parentNode.insertBefore(strip, mh.nextSibling);
    } else {
      var hero = document.querySelector(".hero");
      if(!hero) return;
      strip.style.marginBottom = "22px";
      hero.parentNode.insertBefore(strip, hero.nextSibling);
    }
    renderStrip(strip);
  }

  /* ---------- Tự chọn cấp độ + số từ theo bài test ---------- */
  var LEVEL_MAP = {
    giaotiep:{ "A1.1":"A1", "A2.1":"A2", "B1.1":"B1", "B1.2":"B1", "C1":"B1" },
    toeic:{ "A1.1":"A2", "A2.1":"A2", "B1.1":"B1", "B1.2":"B2", "C1":"B2" },
    ielts:{ "A1.1":"B1", "A2.1":"B1", "B1.1":"B1", "B1.2":"B2", "C1":"C1" },
    career:{ "A1.1":"A1", "A2.1":"A2", "B1.1":"B1", "B1.2":"B2", "C1":"C1" }
  };
  var SIZE_BY_TIME = { "5":15, "15":20, "30":30, "45":50 };
  function autoSetup(){
    if(!COURSE || !profile || !profile.level) return;
    var manualKey = "az_core_manual_" + COURSE.id;
    document.addEventListener("click", function(e){
      if(e.isTrusted && e.target.closest && e.target.closest("#levelRow .level-chip, .size-chip, .size-btn")) lsSet(manualKey, "1");
    }, true);
    var lv = (LEVEL_MAP[COURSE.id] || {})[profile.level];
    var size = SIZE_BY_TIME[lastTest && lastTest.time] || 20;
    var hero = document.querySelector(".home-hero");
    if(hero && !lsGet(manualKey)){
      setTimeout(function(){
        var chip = lv && document.querySelector('#levelRow .level-chip[data-level="' + lv + '"]');
        if(chip && !chip.classList.contains("active")) chip.click();
        var sb = document.querySelector('.size-chip[data-size="' + size + '"], .size-btn[data-size="' + size + '"]');
        if(sb && !sb.classList.contains("active")) sb.click();
      }, 300);
    }
    if(hero){
      var note = el('<p class="azc-auto">🎯 Theo bài test của bạn: cấp độ <b>' + (lv || "tất cả") + '</b> · <b>' + size + ' từ</b>/buổi. Muốn đổi? Mở “Tuỳ chỉnh”.</p>');
      var cta = hero.querySelector(".home-cta, .hero-cta");
      if(cta && cta.parentNode) cta.parentNode.insertBefore(note, cta.nextSibling); else hero.appendChild(note);
      if(lsGet(manualKey)) note.innerHTML = '⚙️ Bạn đang dùng tuỳ chỉnh riêng. <a href="#" style="color:var(--red)">Về lộ trình theo bài test</a>';
      var back = note.querySelector("a");
      if(back) back.addEventListener("click", function(e){ e.preventDefault(); lsSet(manualKey, ""); location.reload(); });
    }
    // Chuyển "Số từ mỗi buổi" từ thẻ chính vào phần tuỳ chỉnh cho gọn
    var sp = document.querySelector(".home-hero .size-picker");
    var cw = document.getElementById("customizePanel") || document.getElementById("customizeWrap");
    if(sp && cw){
      var box = el('<div class="panel" style="margin-bottom:14px"><h2>Độ dài mỗi buổi</h2></div>');
      box.appendChild(sp); cw.insertBefore(box, cw.firstChild);
    }
  }

  /* ---------- 📒 Sổ từ của tôi ---------- */
  function todayNum(){ return Math.floor(Date.now() / 864e5); }
  function openNotebook(){
    var st = lsJSON(COURSE.key) || {}, words = window.WORDS || [], byW = {};
    words.forEach(function(w){ byW[w.w] = w; });
    var rows = [];
    Object.keys(st).forEach(function(k){
      var s = st[k]; if(k === "recentWords" || !s || typeof s !== "object" || !byW[k]) return;
      if(!(s.ivl > 0 || s.correct > 0 || s.wrong > 0)) return;
      var status = s.ivl >= MASTERED_IVL ? "done" : ((s.wrong || 0) >= 2 && (s.wrong || 0) >= (s.correct || 0)) ? "weak" : "learn";
      rows.push({ w:k, m:byW[k].m, lvl:byW[k].lvl, s:s, status:status });
    });
    var custom = lsJSON("az_custom_words") || [];
    var COLORS = { done:"#1e9e5a", learn:"#e2a022", weak:"#e0102b" }, LABEL = { done:"Đã thuộc", learn:"Đang nhớ", weak:"Hay sai" };
    var cnt = { done:0, learn:0, weak:0 }; rows.forEach(function(r){ cnt[r.status]++; });
    var body = el('<div><div class="azm-stats"><div><b>' + cnt.done + '</b><span>🟢 Đã thuộc</span></div><div><b>' + cnt.learn + '</b><span>🟡 Đang nhớ</span></div><div><b>' + cnt.weak + '</b><span>🔴 Hay sai</span></div></div>' +
      '<div class="azm-chips"><button type="button" class="on" data-f="all">Tất cả (' + rows.length + ')</button><button type="button" data-f="done">Đã thuộc</button><button type="button" data-f="learn">Đang nhớ</button><button type="button" data-f="weak">Hay sai</button></div>' +
      '<input class="azm-input" type="search" placeholder="🔎 Tìm từ hoặc nghĩa…" style="margin-bottom:8px" /><div class="azm-wl"></div>' +
      '<div class="azm-grid2" style="margin-top:14px"><button class="azm-ghost" type="button" data-act="csv">⬇️ Tải file CSV</button><button class="azm-ghost" type="button" data-act="mine">✍️ Từ của tôi (' + custom.length + ')</button></div>' +
      '<p class="azm-note">Sổ từ của lộ trình <b>' + esc(COURSE.name) + '</b>. “Đã thuộc” = ôn đúng liên tục tới mốc nhớ 21 ngày.</p></div>');
    var filter = "all", q = "", wl = body.querySelector(".azm-wl");
    function draw(){
      var list = rows.filter(function(r){ return (filter === "all" || r.status === filter) && (!q || (r.w + " " + r.m).toLowerCase().indexOf(q) >= 0); })
        .sort(function(a, b){ return (a.s.due || 0) - (b.s.due || 0); });
      wl.innerHTML = list.length ? list.slice(0, 400).map(function(r){
        var d = (r.s.due || 0) - todayNum(), when = r.status === "done" ? "đã thuộc" : d <= 0 ? "ôn hôm nay" : "ôn sau " + d + " ngày";
        return '<div class="azm-word"><span class="dot" style="background:' + COLORS[r.status] + '"></span><span class="w">' + esc(r.w) + '</span><span class="m">' + esc(r.m) + '</span><span class="sm">' + when + '</span><button type="button" data-say="' + esc(r.w) + '" aria-label="Nghe">🔊</button></div>';
      }).join("") : '<p class="azm-note">Chưa có từ nào ở mục này. Học một buổi là sổ sẽ có từ ngay!</p>';
    }
    body.querySelector(".azm-chips").addEventListener("click", function(e){
      var b = e.target.closest("button"); if(!b) return; filter = b.dataset.f;
      Array.prototype.forEach.call(body.querySelectorAll(".azm-chips button"), function(x){ x.classList.toggle("on", x === b); }); draw();
    });
    body.querySelector('input[type="search"]').addEventListener("input", function(e){ q = e.target.value.trim().toLowerCase(); draw(); });
    wl.addEventListener("click", function(e){ var b = e.target.closest("[data-say]"); if(b) say(b.dataset.say); });
    body.querySelector('[data-act="csv"]').addEventListener("click", function(){
      var lines = [["Từ", "Nghĩa", "Cấp độ", "Trạng thái", "Số lần đúng", "Số lần sai", "Khoảng ôn (ngày)"]].concat(rows.map(function(r){ return [r.w, r.m, r.lvl || "", LABEL[r.status], r.s.correct || 0, r.s.wrong || 0, r.s.ivl || 0]; }));
      var csv = "﻿" + lines.map(function(l){ return l.map(function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
      a.download = "so-tu-" + COURSE.id + "-" + keys().day.slice(1) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    });
    body.querySelector('[data-act="mine"]').addEventListener("click", openMine);
    draw();
    openModal("📒 Sổ từ của tôi", body);
  }
  function say(t){
    try{ var u = new SpeechSynthesisUtterance(t); u.lang = "en-US"; var v = speechSynthesis.getVoices().filter(function(x){ return /^en[-_]US/i.test(x.lang); })[0]; if(v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(e){}
  }

  /* ---------- ✍️ Từ của tôi: tự nhập + ôn ngắt quãng (không tính điểm) ---------- */
  function loadMine(){ return lsJSON("az_custom_words") || []; }
  function saveMine(a){ lsSet("az_custom_words", JSON.stringify(a)); }
  function dueMine(a){ var now = Date.now(); return a.filter(function(c){ return (c.due || 0) <= now; }); }
  function parseBulk(txt){
    return txt.split(/\n+/).map(function(line){
      var m = line.split(/\s*(?:\t| - | – | — |:|=)\s*/);
      return m.length >= 2 ? { w:m[0].trim(), m:m.slice(1).join(" - ").trim() } : null;
    }).filter(function(x){ return x && x.w && x.m; });
  }
  function openMine(){
    var mine = loadMine(), due = dueMine(mine);
    var body = el('<div>' +
      '<button class="azm-primary" type="button" data-act="review"' + (mine.length < 2 ? " disabled" : "") + '>🎮 Ôn bằng game · ' + (due.length ? due.length + " từ đến hạn" : mine.length + " từ") + '</button>' +
      '<p class="azm-note" style="margin-top:6px">Chọn đúng từ theo nghĩa trong 10 giây, rồi tự đánh giá độ nhớ để hệ thống hẹn ngày ôn lại. Từ tự nhập <b>không tính điểm xếp hạng</b>.</p>' +
      '<div class="azm-sec">Thêm từ mới</div>' +
      '<div class="azm-grid"><div class="azm-grid2"><input class="azm-input" data-f="w" placeholder="Từ / cụm từ tiếng Anh" /><input class="azm-input" data-f="m" placeholder="Nghĩa tiếng Việt" /></div>' +
      '<input class="azm-input" data-f="s" placeholder="Câu ví dụ (không bắt buộc)" /><button class="azm-ghost" type="button" data-act="add">➕ Thêm từ</button></div>' +
      '<div class="azm-sec">Dán nhanh nhiều từ</div>' +
      '<textarea class="azm-input" data-f="bulk" placeholder="Mỗi dòng một từ, dạng:&#10;take off - cất cánh&#10;deadline - hạn chót"></textarea>' +
      '<button class="azm-ghost" type="button" data-act="bulk" style="width:100%;margin-top:8px">📋 Thêm tất cả</button>' +
      '<div class="azm-sec">Danh sách (' + mine.length + ')</div><div class="azm-ml"></div></div>');
    var ml = body.querySelector(".azm-ml");
    function draw(){
      mine = loadMine();
      ml.innerHTML = mine.length ? mine.slice().reverse().map(function(c){
        var d = Math.ceil(((c.due || 0) - Date.now()) / 864e5);
        return '<div class="azm-word"><span class="w">' + esc(c.w) + '</span><span class="m">' + esc(c.m) + '</span><span class="sm">' + (d <= 0 ? "đến hạn" : "ôn sau " + d + " ngày") + '</span><button type="button" data-say="' + esc(c.w) + '">🔊</button><button type="button" data-del="' + c.id + '" aria-label="Xoá">🗑️</button></div>';
      }).join("") : '<p class="azm-note">Chưa có từ nào. Gặp từ hay trong lớp, phim hay bài đọc thì thêm vào đây nhé!</p>';
    }
    function addMany(list){
      if(!list.length) return 0;
      var cur = loadMine(), seen = {}; cur.forEach(function(c){ seen[c.w.toLowerCase()] = 1; });
      var added = 0;
      list.forEach(function(x){ if(seen[x.w.toLowerCase()]) return; seen[x.w.toLowerCase()] = 1; cur.push({ id:Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w:x.w, m:x.m, s:x.s || "", ivl:0, ease:2.5, reps:0, due:0, created:Date.now() }); added++; });
      saveMine(cur); return added;
    }
    body.querySelector('[data-act="add"]').addEventListener("click", function(){
      var w = body.querySelector('[data-f="w"]'), m = body.querySelector('[data-f="m"]'), s = body.querySelector('[data-f="s"]');
      if(!w.value.trim() || !m.value.trim()){ (w.value.trim() ? m : w).focus(); return; }
      addMany([{ w:w.value.trim(), m:m.value.trim(), s:s.value.trim() }]); w.value = m.value = s.value = ""; w.focus(); openMine();
    });
    body.querySelector('[data-act="bulk"]').addEventListener("click", function(){
      var ta = body.querySelector('[data-f="bulk"]'), n = addMany(parseBulk(ta.value));
      if(n){ openMine(); } else ta.focus();
    });
    body.querySelector('[data-act="review"]').addEventListener("click", function(){ startReview(); });
    ml.addEventListener("click", function(e){
      var b = e.target.closest("[data-say]"); if(b) return say(b.dataset.say);
      var d = e.target.closest("[data-del]"); if(d){ saveMine(loadMine().filter(function(c){ return c.id !== d.dataset.del; })); openMine(); }
    });
    draw();
    openModal("✍️ Từ của tôi", body);
  }

  var qTimer = null;
  function startReview(){
    var all = loadMine(), pool = dueMine(all);
    if(!pool.length) pool = all.slice();
    pool.sort(function(){ return Math.random() - .5; });
    pool = pool.slice(0, 20);
    var i = 0, right = 0, combo = 0;
    var distractPool = all.map(function(c){ return c.w; }).concat((window.WORDS || []).slice(0, 3000).map(function(w){ return w.w; }));
    function next(){
      if(i >= pool.length) return finish();
      var c = pool[i], opts = [c.w], guard = 0;
      while(opts.length < 4 && guard++ < 200){ var x = distractPool[Math.floor(Math.random() * distractPool.length)]; if(x && opts.indexOf(x) < 0) opts.push(x); }
      opts.sort(function(){ return Math.random() - .5; });
      var body = el('<div><div class="azq-meta"><span>Câu ' + (i + 1) + '/' + pool.length + '</span><span>🔥 Combo ' + combo + '</span></div><div class="azq-bar"><i style="width:100%"></i></div>' +
        '<div class="azq-card"><div class="mn">' + esc(c.m) + '</div>' + (c.s ? '<div class="ex">' + esc(c.s.replace(new RegExp(c.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "___")) + '</div>' : '') + '</div>' +
        '<div class="azq-opts">' + opts.map(function(o){ return '<button type="button">' + esc(o) + '</button>'; }).join("") + '</div><div class="azq-after"></div></div>');
      var left = 100, bar = body.querySelector(".azq-bar i"), done = false;
      qTimer = setInterval(function(){ left -= 1; bar.style.width = left + "%"; if(left <= 0){ clearInterval(qTimer); qTimer = null; pick(null); } }, 100);
      function pick(btn){
        if(done) return; done = true; if(qTimer){ clearInterval(qTimer); qTimer = null; }
        var ok = btn && btn.textContent === c.w;
        Array.prototype.forEach.call(body.querySelectorAll(".azq-opts button"), function(b){ b.disabled = true; if(b.textContent === c.w) b.classList.add("ok"); else if(b === btn) b.classList.add("no"); });
        say(c.w);
        var after = body.querySelector(".azq-after");
        if(ok){
          right++; combo++;
          after.innerHTML = '<p class="azm-note" style="text-align:center;margin:4px 0 8px">✅ Chuẩn! Bạn nhớ từ này thế nào?</p><div class="azq-rate"><button type="button" data-r="again">😵 Chưa biết<small>ôn lại sau 10 phút</small></button><button type="button" data-r="hard">🤔 Chưa chắc<small>ôn lại sớm</small></button><button type="button" data-r="easy">😎 Dễ<small>giãn lịch ôn</small></button></div>';
          after.addEventListener("click", function(e){ var b = e.target.closest("[data-r]"); if(b){ rate(c, b.dataset.r); i++; next(); } });
        } else {
          combo = 0; rate(c, "again");
          after.innerHTML = '<p class="azm-note" style="text-align:center;margin:4px 0 8px">' + (btn ? "❌ Chưa đúng" : "⏰ Hết giờ") + ' — đáp án: <b>' + esc(c.w) + '</b>. Từ này sẽ quay lại sau 10 phút.</p><button class="azm-primary" type="button">Tiếp tục →</button>';
          after.querySelector("button").addEventListener("click", function(){ i++; next(); });
        }
      }
      body.querySelector(".azq-opts").addEventListener("click", function(e){ var b = e.target.closest("button"); if(b) pick(b); });
      openModal("🎮 Ôn từ của tôi", body);
    }
    function finish(){
      var body = el('<div style="text-align:center"><div style="font-size:54px">🎉</div><p style="font:800 22px var(--font-display);margin:6px 0">Đúng ' + right + '/' + pool.length + ' từ</p><p class="azm-note">Lịch ôn đã được cập nhật theo độ nhớ của bạn. (Từ tự nhập không tính điểm xếp hạng.)</p><div class="azm-grid2" style="margin-top:14px"><button class="azm-ghost" type="button" data-a="list">✍️ Từ của tôi</button><button class="azm-primary" type="button" data-a="again">Ôn tiếp</button></div></div>');
      body.querySelector('[data-a="list"]').addEventListener("click", openMine);
      body.querySelector('[data-a="again"]').addEventListener("click", startReview);
      openModal("🎮 Ôn từ của tôi", body);
    }
    next();
  }
  // Lặp lại ngắt quãng kiểu SM-2 rút gọn
  function rate(card, r){
    var all = loadMine(), c = all.filter(function(x){ return x.id === card.id; })[0]; if(!c) return;
    var now = Date.now(), DAY = 864e5;
    if(r === "again"){ c.reps = 0; c.ivl = 0; c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2); c.due = now + 10 * 60e3; }
    else if(r === "hard"){ c.ivl = Math.max(1, Math.round((c.ivl || 0) * 1.2)); c.ease = Math.max(1.3, (c.ease || 2.5) - 0.15); c.reps = (c.reps || 0) + 1; c.due = now + c.ivl * DAY; }
    else { c.ivl = c.ivl ? Math.round(c.ivl * (c.ease || 2.5) * 1.3) : 3; c.ease = (c.ease || 2.5) + 0.1; c.reps = (c.reps || 0) + 1; c.due = now + c.ivl * DAY; }
    saveMine(all);
  }

  /* ---------- gắn vào trang ---------- */
  onReady(function(){
    injectCss();
    if(COURSE){
      document.body.insertBefore(el('<div class="azc-amb" aria-hidden="true"><i class="a"></i><i class="b"></i></div>'), document.body.firstChild);
      var mh = document.querySelector(".masthead"), anchor = document.getElementById("themeBtn");
      if(mh){
        var b1 = el('<button class="azc-btn" type="button" title="Sổ từ của tôi" aria-label="Sổ từ của tôi">📒</button>');
        var b2 = el('<button class="azc-btn" type="button" title="Từ của tôi" aria-label="Từ của tôi">✍️</button>');
        b1.addEventListener("click", openNotebook); b2.addEventListener("click", openMine);
        mh.insertBefore(b1, anchor || null); mh.insertBefore(b2, anchor || null);
      }
      // Nhạc nền: thanh âm lượng chỉ hiện khi đang bật nhạc
      var mb = document.getElementById("musicBtn");
      function syncMusic(){ document.documentElement.classList.toggle("azc-music", !!(mb && mb.classList.contains("active"))); }
      if(mb){ mb.addEventListener("click", function(){ setTimeout(syncMusic, 0); }); syncMusic(); }
      autoSetup();
    }
    mountStrip();
    window.AZCore = { openBoard:openBoard, openNotebook:COURSE ? openNotebook : null, openMine:openMine };
  });
})();
