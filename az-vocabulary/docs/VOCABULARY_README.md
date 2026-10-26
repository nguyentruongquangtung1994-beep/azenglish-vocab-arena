# AZ Vocabulary — hướng dẫn vận hành

Chương trình luyện từ vựng TOEIC / IELTS theo chủ đề của AZEnglish. Học viên nhìn từ, chọn nghĩa; thẻ **tự chuyển** sau khi chọn, **không hiện đúng/sai giữa lượt**; hết lượt mới chữa bài và ôn lại từ sai. Chạy độc lập trên GitHub Pages, không gọi AI hay TTS trả phí, không gửi dữ liệu học tập ra ngoài.

- Trang học: `vocabulary.html` · Trang biên tập: `vocabulary-editor.html`
- Link thật (sau khi gộp vào main): https://nguyentruongquangtung1994-beep.github.io/AZIELTS-trainer/vocabulary.html
- Vào từ Academy: thẻ **AZ Vocabulary** trong mục Chương trình (khách chưa đăng nhập cũng bấm vào học thử được).

## Cấu trúc file

| File | Vai trò |
|---|---|
| `vocabulary.html` | Trang học (màn chọn bài · lượt học · kết quả) |
| `assets/css/vocabulary.css` | Giao diện trắng · đỏ AZ #D7192D · navy Academy |
| `assets/js/vocabulary-core.js` | Lõi logic thuần: kiểm tra học liệu, tạo lượt, chấm, lượt ôn, lịch ôn 1/3/7 ngày, kiểm tra/gộp tiến độ |
| `assets/js/vocabulary-storage.js` | Lưu tiến độ trên thiết bị (localStorage), đọc phiên đăng nhập Academy |
| `assets/js/vocabulary.js` | Điều khiển giao diện |
| `assets/js/vocabulary-config.js` | Địa chỉ máy chủ tài khoản Academy (điền khi đóng gói) |
| `data/vocabulary-toeic.json`, `data/vocabulary-ielts.json` | Học liệu, tách khỏi giao diện |
| `vocabulary-editor.html` + `assets/js/vocabulary-editor.js` | Công cụ soạn học liệu (chỉ xuất file) |
| `tests/vocabulary.test.js` | Kiểm thử tự động (`node --test tests/`) |
| `tools/validate-vocabulary.js` | Kiểm tra học liệu (`node tools/validate-vocabulary.js`) |

Trong thư mục second brain còn có (không đưa lên web): `tools/seed/*.txt` (nguồn soạn ban đầu), `tools/seed_to_json.py`, `tools/dev_server.py`, `tools/build_deploy.py`.

## Mở thử trên máy (localhost)

```bash
cd "production/AZ Vocabulary"
python3 tools/dev_server.py
```

Mở http://localhost:8797/vocabulary.html. Máy chủ thử có sẵn `/api` **giả lập** đăng ký Academy để thử cổng mở khoá (không gửi đi đâu). Mở trực tiếp file `.html` bằng đúp chuột sẽ **không** tải được học liệu (trình duyệt chặn đọc file JSON) — trang sẽ báo rõ.

Trong app Claude: launch `az-vocabulary` (.claude/launch.json).

## Luồng học và mở khoá

1. Lần đầu: bấm **TOEIC** hoặc **IELTS** là học ngay 10 từ (tổng hợp, mọi mức, Anh → Việt, chuyển thẻ nhanh 0,35 giây).
2. Thẻ hiện ra → tự đọc từ tiếng Anh (giọng có sẵn của thiết bị, cao và tươi; nút **Nghe** để nghe lại; chiều Việt → Anh thì đọc sau khi chọn để không lộ đáp án). Mỗi từ có **đồng hồ 8 giây** (chỉnh 5/8/12 trong Tùy chỉnh; tab bị ẩn thì đồng hồ dừng). Chọn đáp án → tiếng "ting" nếu đúng, "bụp" nếu sai → khoá lựa chọn → tự chuyển thẻ. Hết giờ chưa chọn → ghi **Hết giờ**, tính như sai, vào danh sách ôn. Đáp án đúng vẫn chỉ hiện khi chữa bài cuối lượt. Nút loa trên thanh học để tắt/bật tiếng; Tùy chỉnh có 3 mức: Tiếng + đọc từ / Chỉ tiếng đúng sai / Tắt. Phím 1–4 dùng được. Trên điện thoại, 4 lựa chọn nằm ở nửa dưới màn hình cho dễ bấm bằng ngón cái.
3. Hết lượt: điểm, tỉ lệ, thời gian, số từ cần ôn, nhận xét; lọc **Tất cả / Từ chọn sai**; mỗi từ có phiên âm, từ loại, nghĩa, đáp án đã chọn, ví dụ + dịch, cách dùng, lưu ý dễ nhầm.
4. **Cổng mở khoá:** khách chưa đăng nhập được học miễn phí **1 lượt 10 từ** và xem trọn kết quả. Muốn ôn từ sai, học lượt mới, chọn lượt 20/30 từ hay ôn theo lịch → điền Họ tên + SĐT + Email + mật khẩu ngay trên trang. Hệ thống tạo **tài khoản AZIELTS Academy dùng thử 7 ngày** (tên đăng nhập = SĐT) bằng chính máy chủ Academy (lệnh `register`), nên lead vào tab **Tài khoản** của Google Sheet lớp học như học viên đăng ký ở Academy. Đã đăng nhập Academy còn hạn → mở toàn bộ, không hỏi lại.
5. Lượt ôn chỉ gồm từ sai, xáo lại; kết quả **lượt đầu giữ nguyên**, lượt ôn ghi riêng ("đã trả lời đúng khi ôn", không phải "đã nhớ lâu").
6. Lịch ôn: sai → gợi ý ôn sau 1 ngày; đúng lần đầu → sau 3 ngày; đúng ở lượt ôn theo lịch → 3 rồi 7 ngày. Chỉ là gợi ý trên trang, **không có thông báo nền**.

Cổng mở khoá là cổng giao diện: người rành kỹ thuật vẫn đọc được file JSON học liệu (học liệu tự soạn nên chấp nhận được). Cờ "đã dùng lượt miễn phí" lưu ở `localStorage["azv_free_used"]`.

## Tiến độ học viên

Lưu trong trình duyệt (`localStorage["azv_progress_v1"]`): lựa chọn bộ lọc, lượt đang học (thứ tự từ + thứ tự đáp án + câu đã trả lời), kết quả lượt đầu và lượt ôn, lịch ôn từng từ, ngày luyện. Tải lại trang giữa lượt → bấm **Tiếp tục**, không mất câu đã trả lời, không xáo lại đáp án, không ghi trùng. **Chưa đồng bộ giữa các thiết bị** — học viên dùng "Xuất / nhập tiến độ" (file JSON; khi nhập có kiểm tra cấu trúc và chọn Gộp hoặc Thay thế) và "Xoá toàn bộ tiến độ" (có xác nhận).

## Thêm / sửa từ

**Cách 1 — công cụ biên tập (khuyên dùng):**
1. Mở `vocabulary-editor.html` (localhost hoặc trên web), chọn TOEIC/IELTS → "Tải bản đang có trên web".
2. Thêm/sửa/xoá mục, bấm "Xem trước câu hỏi" để xem cả 2 chiều, "Kiểm tra toàn bộ".
3. "Xuất JSON" → được `vocabulary-toeic.json` hoặc `vocabulary-ielts.json`.
4. Thay file vào `data/` (trong second brain: `production/AZ Vocabulary/data/`), chạy `node tools/validate-vocabulary.js`, rồi đẩy lên GitHub (mục Triển khai).

Công cụ **không tự đăng lên web**, không chứa token hay mật khẩu.

**Quy tắc nội dung** (trình kiểm tra bắt phần cơ học; nghĩa và độ tự nhiên phải giáo viên duyệt):
- `id` ổn định, không đổi khi đã dùng: `toeic-<chủ-đề>-NN` / `ielts-<chủ-đề>-NN`.
- Đúng 3 `distractorsVi` và 3 `reverseDistractorsEn`: cùng loại từ, độ dài gần nhau, hợp lý nhưng khác nghĩa, không trùng, không đồng nghĩa với đáp án, không "tất cả đều đúng".
- Từ đa nghĩa: chọn 1 nghĩa mục tiêu và điền `contextLabel`; không đưa nghĩa đúng khác của từ vào phương án nhiễu.
- `reviewStatus`: `draft` → `reviewed` chỉ khi giáo viên đã duyệt thật; khi đó mới điền `reviewer` và `reviewedAt` (YYYY-MM-DD). Không điền tên người duyệt giả.
- Không dùng thẻ HTML trong nội dung (trình kiểm tra chặn). Mức Cơ bản/Trung cấp/Nâng cao là phân loại học liệu, **không** quy đổi điểm TOEIC/band IELTS.

Soạn lại cả bộ từ file dòng: sửa `tools/seed/*.txt` rồi `python3 tools/seed_to_json.py` (ghi đè `data/*.json`, mất sửa đổi làm bằng công cụ biên tập — chỉ dùng khi chưa sửa bằng công cụ).

## Thêm audio giáo viên thu

1. Thu từng từ thành file `.mp3` (hoặc `.m4a`), đặt tên theo id, ví dụ `audio/toeic/toeic-office-meetings-02.mp3`.
2. Đưa thư mục `audio/` lên gốc repo AZIELTS-trainer.
3. Điền `audioUrl` của mục đó: `audio/toeic/toeic-office-meetings-02.mp3` (đường dẫn tương đối, hoặc `https://…`).
4. Mục có `audioUrl` hợp lệ sẽ hiện nút **Nghe** trên thẻ (chiều Anh → Việt). Không bao giờ tự phát. Mục không có audio thì không hiện nút.

## Triển khai GitHub Pages

Quy ước: làm trên nhánh `feature/az-vocabulary`, Anh Tùng duyệt Pull Request rồi mới gộp vào `main` (GitHub Pages chạy từ `main`).

1. Đóng gói: `AZ_CLASS_API=<url /exec trong AZIELTS Writing Studio/codes/HUONG-DAN-LOP-HOC.md> python3 tools/build_deploy.py` → `deploy/` (tự chạy kiểm tra học liệu trước).
2. Academy: sửa `AZIELTS Academy/src/academy.html` → `AZ_CLASS_API=<url> python3 tools/build_portal.py` → `python3 tools/og_inject.py deploy/academy.html`.
3. Đẩy các file trong `deploy/` (giữ nguyên đường dẫn) + `academy.html` lên nhánh bằng `gh api … contents/<đường dẫn> -X PUT` (kèm `branch` và `sha` nếu file đã có).
4. Gộp Pull Request vào `main` → 1–2 phút sau link thật hoạt động.

Đường dẫn trong trang đều tương đối nên chạy được dưới `/AZIELTS-trainer/`.

## Giới hạn hiện tại

- Học liệu 200 mục là **bản thử AZ tự soạn, chưa được giáo viên duyệt**.
- Chưa có audio giáo viên thu: đang dùng giọng đọc của trình duyệt — chất lượng và giọng khác nhau theo máy (iPhone/Mac: Samantha; Android/Chrome: Google US English; Windows: Aria/Jenny), giọng đọc không thể hiện cảm xúc thật. Tiến độ chưa đồng bộ giữa thiết bị; không có thông báo nhắc ôn.
- Nhận diện đúng nghĩa không có nghĩa là đã dùng được từ khi nói/viết.
