# ⛩️ D-Comic-Reader (MangaFlow)

Ứng dụng đọc truyện tranh online hiện đại, mượt mà, tối ưu hóa cho cả Desktop và Mobile (PWA), lấy dữ liệu trực tiếp từ **TruyenQQ** (có dự phòng **NetTruyen**).

---

## ✨ Tính Năng Nổi Bật

- **⚡ Crawler & Proxy Tốc Độ Cao**:
  - Parse HTML bằng **Cheerio**, sử dụng HTTP/HTTPS **Keep-Alive Pool**, nén `gzip`/`brotli`, LRU cache kèm **Request Coalescing** (chống trùng lặp request).
  - Image Proxy stream bất đồng bộ an toàn trên cả Local Node.js và Vercel Serverless, bảo vệ chống SSRF và hỗ trợ `ETag` / `304`.
- **📜 Trình Đọc Mượt 60fps & Dễ Dùng**:
  - **Tap-to-Toggle HUD**: chạm giữa màn hình để ẩn/hiện thanh công cụ trên & dưới vùng ngón cái.
  - **2 Chế Độ Đọc**: Cuộn dọc liên tục (**Webtoon** với preloader giới hạn luồng qua `IntersectionObserver`) và Lật trang (**Paged** hỗ trợ Trái→Phải, Phải→Trái cho Manga, vuốt ngang & chạm 3 vùng).
  - **Tự Động Lưu & Khôi Phục Vị Trí Đọc**: mở lại chương cũ nhảy đúng tới trang đang đọc dở.
  - **Cài Đặt Cá Nhân Hóa**: Đổi độ rộng khung ảnh, khoảng cách trang, chủ đề (`Dark` / `OLED` / `Sepia`), độ sáng màn đọc, tốc độ tự động cuộn (`deltaTime` ổn định mọi tần số quét).
  - **Danh Sách Chương Phân Nhóm (Chunked)**: mở truyện 1.000+ chương không giật lag.
- **❤️ Theo Dõi, Lịch Sử & Backup**:
  - Huy hiệu **MỚI** cho truyện có chap chưa đọc, hoàn tác khi bỏ thích, lọc nhanh, kiểm tra chap mới nhẹ nhàng, Export/Import JSON backup.

---

## 🚀 Chạy Cục Bộ & Deploy

### 1. Chạy trên Windows (Nhanh nhất)
Nhấp đúp vào file `Mo Web Doc Truyen.bat` (tự cài dependencies nếu thiếu và mở trình duyệt tại `http://localhost:3000`).

### 2. Chạy bằng lệnh Node.js
```bash
npm install
npm start
```
- Máy tính: `http://localhost:3000`
- Điện thoại (cùng Wi-Fi): `http://[IP_CUA_BAN]:3000`

### 3. Deploy lên Vercel
Dự án tự động phục vụ giao diện tĩnh từ thư mục `public/` và Serverless Function tại `api/manga.js` (dùng chung core `lib/` với `server.cjs`).

---

## 🛠️ Cấu Trúc Mã Nguồn

```text
d-comic-reader/
├── api/
│   └── manga.js                 # Vercel Serverless Function entry
├── lib/
│   ├── api-handler.js           # Router API dùng chung (Local & Vercel)
│   ├── cache.js                 # LRU TTL Cache + Request Coalescing
│   ├── http-client.js           # Keep-Alive Pool + Gzip/Br + Redirect + SSRF Guard
│   ├── image-proxy.js           # Async Image Proxy + ETag + Size/MIME Guard
│   └── sources/
│       ├── genres.js            # Danh mục 46 thể loại chuẩn
│       ├── index.js             # Source Orchestrator + Fallback
│       ├── truyenqq.js          # Adapter TruyenQQ (Cheerio/slim)
│       └── nettruyen.js         # Adapter NetTruyen fallback (Cheerio/slim + Mirror Race)
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── assets/cover-fallback.svg
│   ├── css/                     # tokens.css, base.css, views.css, reader.css
│   └── js/                      # main.js, state.js, api.js, router.js, utils.js, views/
├── server.cjs                   # Local HTTP Server (Gzip/Brotli + ETag + Static)
├── Mo Web Doc Truyen.bat
└── package.json
```
