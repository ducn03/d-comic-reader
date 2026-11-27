# D-Comic-Reader (MangaFlow)

Ứng dụng đọc truyện tranh online tối giản, tốc độ cao, tối ưu cho cả Desktop và Mobile (PWA), lấy dữ liệu trực tiếp từ **TruyenQQ** (có dự phòng **NetTruyen**).

---

## Tính Năng Chính (v4)

- **Crawler & Image Proxy Tối Ưu**:
  - Parse HTML bằng `cheerio/slim`, HTTP/HTTPS Keep-Alive Pool, nén `gzip`/`brotli`, LRU TTL Cache + Request Coalescing.
  - Image Proxy stream bất đồng bộ an toàn trên cả Local Node.js và Vercel Serverless, bảo vệ SSRF và cache Edge dài hạn.
- **Trình Đọc Mượt & Dễ Thao Tác**:
  - Phân biệt Tap và Scroll/Drag để không kích nhầm HUD khi cuộn; tự ẩn HUD thông minh khi cuộn xuống.
  - 2 chế độ đọc: Cuộn dọc (**Webtoon**, 6 luồng tải ảnh song song) và Lật trang (**Paged**, Trái→Phải / Phải→Trái, vuốt ngang & chạm 3 vùng).
  - Tự động lưu tiến độ theo trạng thái nghỉ (idle save) và khôi phục đúng trang đang đọc dở.
  - Tùy chỉnh độ rộng khung ảnh, khoảng cách trang, nền (`Tối` / `Đen OLED` / `Giấy ấm`), độ sáng, tốc độ tự cuộn (`deltaTime`).
- **Điều Hướng & Trạng Thái Chuẩn**:
  - Back không vòng lặp (`Home ↔ Detail ↔ Reader`), chuyển chương bằng `replaceState`.
  - Keep-Alive views bảo toàn trang, bộ lọc, cụm chương và vị trí cuộn khi di chuyển giữa các màn hình.
- **Theo Dõi & Lịch Sử**:
  - Đồng bộ 2 tầng toàn bộ danh sách theo dõi (lấy mốc phút/giờ từ trang mới cập nhật), sắp xếp chính xác theo thời gian ra chap mới, lọc truyện có chap mới, hoàn tác khi bỏ thích, Export/Import JSON.

---

## Chạy Cục Bộ & Deploy

### 1. Chạy trên Windows
Nhấp đúp vào file `Mo Web Doc Truyen.bat` (tự cài `node_modules` nếu thiếu và mở trình duyệt tại `http://localhost:3000`).

### 2. Chạy bằng lệnh Node.js
```bash
npm install
npm start
```
- Máy tính: `http://localhost:3000`
- Điện thoại (cùng Wi-Fi): `http://[IP_CUA_BAN]:3000`

### 3. Deploy lên Vercel
`server.cjs` tại root phục vụ trực tiếp static files từ `public/` và API `/api/manga` qua core `lib/` dùng chung với `api/manga.js`.
