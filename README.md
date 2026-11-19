# ⛩️ D-Comic-Reader (MangaFlow PRO)

> High-End Dark Manga & Anime Web Reader crawled live in real-time from Hinettruyen.com.  
> Ứng dụng đọc truyện tranh trực tuyến hiện đại, mượt mà, tối ưu hóa toàn diện cho cả Laptop/PC và Điện thoại.

---

## ✨ Tính Năng Nổi Bật (Features)

- **⚡ Live Crawl 100% Real-time**: Tự động đồng bộ truyện mới nhất, hot nhất, tìm kiếm và danh sách hàng ngàn chương từ Hinettruyen mà không cần database lưu trữ thủ công.
- **🛡️ Bypass Image Proxy**: Giải quyết triệt để lỗi chặn ảnh 403 Forbidden / Hotlink protection bằng hệ thống proxy stream hình ảnh thông minh.
- **📱 Responsive & Tối Ưu Mobile/Desktop**:
  - Giao diện Dark Cyberpunk / Neon Manga sang trọng, sắc nét.
  - Tự động ẩn Header khi đọc truyện để toàn màn hình 100%.
  - Nút công cụ góc phải dạng **Speed Dial FAB** (bấm vào xổ ra / thu gọn icon tròn tối giản).
  - Thanh chuyển chương thông minh tự ẩn khi ở chương đầu/cuối và không bị che khuất.
  - Trạng thái tải chương truyện (Loading spinner) được căn giữa màn hình chuẩn xác.
- **🗂️ 42 Thể Loại Chuẩn**: Hỗ trợ đầy đủ các thể loại hot: Action, Manhwa, Manhua, Manga, Tu Tiên, Chuyển Sinh, Xuyên Không, Cổ Đại, Ngôn Tình, Hài Hước, Trinh Thám,...
- **🎲 Gacha Truyện Ngẫu Nhiên (Random)**: Giúp độc giả chọn nhanh một bộ truyện ngẫu nhiên khi chưa biết đọc gì.
- **❤️ Yêu Thích & Lịch Sử Đọc (Bookmarks & History)**: Tự động lưu truyện và chương đang đọc vào LocalStorage, hỗ trợ Export sao lưu và Import dữ liệu.
- **📜 Đa Chế Độ Đọc**:
  - Cuộn dọc liên tục (Webtoon Continuous Scroll).
  - Lật từng trang (Paged Mode).
  - Tự động cuộn trang (Auto-scroll rảnh tay với phím Space).
  - Toàn màn hình (Fullscreen với phím F).

---

## 🚀 Hướng Dẫn Deploy (Deployment Guide)

### 1. Deploy lên Vercel (Khuyên dùng - Nhanh & Miễn Phí 100%)
Dự án đã được cấu hình sẵn tệp `vercel.json` và Serverless Function `api/manga.js`.

1. Đẩy mã nguồn lên GitHub:
   ```bash
   git add .
   git commit -m "feat: complete manga reader web application"
   git push origin main
   ```
2. Truy cập [vercel.com](https://vercel.com) và đăng nhập bằng tài khoản GitHub.
3. Bấm **"Add New"** -> **"Project"** -> Chọn repository `d-comic-reader`.
4. Nhấn **"Deploy"** (không cần cấu hình thêm gì cả, Vercel sẽ tự động nhận diện và build).
5. Sau 1 phút, bạn sẽ có đường link trực tiếp (ví dụ: `https://d-comic-reader.vercel.app`) để truy cập trên mọi thiết bị!

---

### 2. Deploy lên Render.com hoặc Railway
Dự án sử dụng Node.js thuần (không cần dependencies nặng):
- **Build Command**: Để trống (hoặc `npm install` nếu cần).
- **Start Command**: `npm start` (chạy `node server.js`).
- Port: Tự động nhận diện qua biến môi trường `process.env.PORT`.

---

### 3. Chạy Cục Bộ Trên Máy Tính (Local Run)

#### Cách 1: Chạy bằng file .bat (Nhanh nhất trên Windows)
- Nhấp đúp vào file `Mo Web Doc Truyen.bat`.
- Server sẽ tự động khởi động và trình duyệt sẽ tự mở trang web tại `http://localhost:3000`.

#### Cách 2: Chạy bằng lệnh Node.js
```bash
# Khởi động server
node server.js
```
- Truy cập từ máy tính: `http://localhost:3000`
- Truy cập từ điện thoại (cùng mạng Wi-Fi): `http://[IP_CUA_BAN]:3000`

---

## 🛠️ Cấu Trúc Mã Nguồn (Project Structure)

```
d-comic-reader/
├── api/
│   └── manga.js             # Vercel Serverless Function API Handler
├── crawler.cjs              # Engine cào dữ liệu từ Hinettruyen & stream ảnh
├── server.js                # Server Node.js cục bộ & cloud platforms (Render/Railway)
├── index.html               # Giao diện chính MangaFlow PRO
├── style.css                # Toàn bộ stylesheet giao diện Dark Mode & Mobile
├── app.js                   # Logic ứng dụng, router, render, speed-dial FAB
├── package.json             # Cấu hình dự án & scripts khởi chạy
├── vercel.json              # Cấu hình định tuyến Serverless Vercel
├── .gitignore               # Tệp loại trừ khi đẩy lên Git
├── Mo Web Doc Truyen.bat    # Phím tắt nhấp đúp khởi động web trên Windows
└── README.md                # Tài liệu hướng dẫn sử dụng và triển khai
```

---

## 📜 Bản Quyền & Giấy Phép
Dự án được xây dựng phục vụ mục đích học tập và giải trí cá nhân. Dữ liệu truyện tranh và hình ảnh thuộc về các tác giả và trang nguồn Hinettruyen.com.
