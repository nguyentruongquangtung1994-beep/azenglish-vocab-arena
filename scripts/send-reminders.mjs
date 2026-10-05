// Gửi thông báo nhắc học (chạy bằng GitHub Actions mỗi 30 phút).
// Cần secrets: FIREBASE_SA (JSON service account), VAPID_PUBLIC, VAPID_PRIVATE.
import admin from "firebase-admin";
import webpush from "web-push";

const SITE = "https://nguyentruongquangtung1994-beep.github.io/azenglish-vocab-arena/";
const DRY = process.env.DRY_RUN === "1";
const WINDOW_MIN = 180;          // sau giờ hẹn tối đa 3 tiếng vẫn nhắc (phòng Actions chạy trễ)

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = admin.firestore();
webpush.setVapidDetails(SITE, process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

// Câu nhắc "mỏ hỗn, cà khịa" — {s} = số ngày chuỗi
const STREAK = [
  ["Chuỗi 🔥 {s} ngày sắp bay màu!", "Vô học 5 phút cứu chuỗi lẹ, đứt là Lumina khóc ròng á 😭"],
  ["{s} ngày công sức đó nha 😱", "Định để chuỗi toang thật hả? Vô cày 5 từ thôi mà!"],
  ["Ê chuỗi {s} ngày đang hấp hối kìa 🚑", "Một cú chạm là cứu được, chần chừ là mất trắng đó."]
];
const NORMAL = [
  ["Ủa alo, từ vựng gọi nè 📞", "Lướt TikTok cả tối rồi, giờ dành 5 phút cho tiếng Anh đi bạn ơi."],
  ["Lumina chờ mốc meo rồi đó 🦁", "Crush không rep thì học từ vựng, ít ra từ vựng không seen không rep 😌"],
  ["Đối thủ đang học, còn bạn thì sao? 👀", "Bảng vàng không tự leo được đâu, vô cày nhẹ 5 phút đi!"],
  ["Tiếng Anh nhớ bạn rồi đó 🥺", "25 từ hôm nay đang dỗi vì bị bơ kìa. Vô dỗ tụi nó đi!"],
  ["Hôm nay chưa học từ nào luôn á? 🤨", "Não đang trống chỗ đó, nạp 5 từ vô cho đầy đi bạn."],
  ["Bạn ơi, bạn có đang quên gì không? 🙃", "Gợi ý: là tiếng Anh. Đúng rồi đó, vô học liền!"]
];
const LATE = [
  ["Sắp ngủ mà chưa học từ nào? 🌚", "5 từ thôi rồi ngủ, mơ cũng nói tiếng Anh luôn."],
  ["Khuya rồi nha, Lumina vẫn đợi 🌙", "Học 5 phút rồi đi ngủ, sáng mai dậy thấy mình giỏi hẳn."]
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function localNow(tzMin){
  const d = new Date(Date.now() + tzMin * 60000);
  const z = (n) => String(n).padStart(2, "0");
  return { day: `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes(), hour: d.getUTCHours() };
}

const snap = await db.collection("push_subs").where("enabled", "==", true).get();
let sent = 0, skipped = 0, dead = 0;
for (const doc of snap.docs){
  const s = doc.data();
  if(!s.sub || typeof s.hh !== "number") { skipped++; continue; }
  const now = localNow(typeof s.tz === "number" ? s.tz : 420);
  const target = s.hh * 60 + (s.mm || 0);
  if(now.min < target || now.min > target + WINDOW_MIN || s.lastSentDay === now.day || s.lastLearnDay === now.day){ skipped++; continue; }
  const [title, body] = now.hour >= 21 ? pick(LATE) : (s.streak >= 2 ? pick(STREAK) : pick(NORMAL));
  const payload = JSON.stringify({ title: title.replace("{s}", s.streak || 0), body: body.replace("{s}", s.streak || 0), url: s.url || SITE });
  if(DRY){ console.log("DRY", doc.id, payload); sent++; continue; }
  try{
    await webpush.sendNotification(s.sub, payload, { TTL: 3600 * 3 });
    await doc.ref.update({ lastSentDay: now.day });
    sent++;
  }catch(e){
    if(e.statusCode === 404 || e.statusCode === 410){ await doc.ref.update({ enabled: false }); dead++; }
    else console.error("push lỗi", doc.id, e.statusCode || e.message);
  }
}
console.log(`Đã gửi ${sent} · bỏ qua ${skipped} · đăng ký hết hạn ${dead} · tổng ${snap.size}`);
