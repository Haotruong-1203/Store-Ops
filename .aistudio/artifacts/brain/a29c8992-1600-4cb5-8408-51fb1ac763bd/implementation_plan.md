# Kế hoạch triển khai: Thay thế Tab Check Giá bằng Tab Hủy Hàng & Quản lý Biên Bản Hủy

Thay thế hoàn toàn tab **Check giá** bằng tab **Hủy hàng**, bổ sung chức năng nhập số lượng hủy tạm thời để đối chiếu giấy in, tích hợp ô tìm kiếm nhanh, và thêm tab riêng **"Biên bản hủy hàng"** trong màn hình Dữ liệu để nạp file Excel (`.xlsx`/`.xls`/`.csv`).

---

## 1. Điểm Cần Người Dùng Xác Nhận (User Review Required)
- **Thư viện đọc file Excel**: Sẽ cài đặt thư viện `xlsx` (SheetJS) để đọc trực tiếp file `.xlsx`/`.xls` tiếng Việt chuẩn xác ngay trên trình duyệt mà không cần chuyển đổi sang CSV thủ công.
- **Dữ liệu ban đầu**: Hệ thống sẽ khởi tạo sẵn một danh sách biên bản hủy mẫu ban đầu để bạn kiểm tra ngay. Khi bạn gửi file hoặc danh sách mã/tên hàng cụ thể vào khung chat, hệ thống sẽ cập nhật danh sách chính xác đó ngay lập tức.
- **Lưu trữ số lượng nhập tạm thời**: Các số lượng hủy bạn nhập trên từng dòng sẽ được lưu tạm trong bộ nhớ phiên làm việc (hoặc `localStorage` của trình duyệt) để không bị mất khi bạn lỡ tay chuyển tab hoặc cuộn trang khi đối chiếu trên giấy in, đồng thời có nút **"Đặt lại / Xóa các số lượng đã nhập"** để reset khi làm đợt mới.

---

## 2. Các Thay Đổi Kiến Trúc & Giao Diện (Proposed Changes)

### Thư viện & Phụ thuộc
- Cài đặt thư viện `xlsx` để phân tích cú pháp file Excel (`.xlsx`, `.xls`) trong trình duyệt.

### Mô hình Dữ liệu (`src/types/index.ts` & `src/services/firebase.ts`)
- Định nghĩa kiểu dữ liệu `DestructionItem`:
  - `stt`: Số thứ tự gốc trên biên bản giấy
  - `id`: Mã định danh duy nhất
  - `barcode`: Mã vạch / Mã quét
  - `internalCode`: Mã nội bộ (nếu có)
  - `name`: Tên sản phẩm / vật tư
  - `defaultQuantity`: Số lượng trên chứng từ (nếu có)
  - `note`: Ghi chú
- Bổ sung hàm lưu trữ / đồng bộ danh sách biên bản hủy hàng trên Firestore và `localStorage`.

### Tab Hủy Hàng Mới (`src/screens/DestructionScreen.tsx`)
- **Header**: Tiêu đề "BIÊN BẢN HỦY HÀNG", nút quay lại màn hình chính, nút tùy chọn "Nhập mới / Xóa số lượng đã nhập", "Chỉ xem các mặt hàng đã nhập SL".
- **Thanh tìm kiếm & Thống kê trên đầu**:
  - Ô tìm kiếm nhạy theo Barcode, Mã nội bộ hoặc Tên sản phẩm.
  - Bộ đếm trực quan: Tổng số mặt hàng, số mặt hàng đã điền số lượng hủy, tổng số lượng đã nhập.
- **Bảng danh sách hàng đối chiếu (Chuẩn theo yêu cầu)**:
  - Cột `STT`: Giữ đúng thứ tự dòng để người dùng dò theo biên bản in.
  - Cột `Mã nội bộ / Barcode`: Hiển thị rõ mã nội bộ và barcode.
  - Cột `Tên hàng`: Rộng rãi, font chữ rõ ràng, dễ đọc.
  - Cột `Số lượng`: Ô nhập số (`input type="number"`) kèm nút tăng/giảm nhanh (+/-) và hỗ trợ gõ trực tiếp số lượng hủy.
  - Cột `Ghi chú`: Ô hiển thị hoặc cho phép sửa ghi chú nhanh.
  - *Đã loại bỏ hoàn toàn cột Tên nhân viên* theo đúng yêu cầu.

### Tab Dữ Liệu (`src/screens/OtherScreens.tsx` > `DataScreen`)
- Thêm tab thứ 3: **"Biên bản hủy hàng"** (bên cạnh "Item Bán Hàng" và "Item Đặt Hàng").
- Chức năng trong tab "Biên bản hủy hàng":
  - **Nút "Nhập file Excel (.xlsx / .xls / .csv)"**: Tự động nhận diện các cột `STT`, `Mã nội bộ / Barcode`, `Tên hàng`, `Số lượng`, `Ghi chú`.
  - **Nút "Xuất file Excel / CSV"**: Tải về biên bản đã nhập.
  - **Nút "Xóa biên bản"**: Xóa dữ liệu biên bản hiện tại để nạp đợt mới.
  - Thống kê tổng quan số lượng mặt hàng trong biên bản.

### Điều Hướng & Màn Hình Chính (`src/screens/HomeScreen.tsx` & `src/App.tsx`)
- Trong `HomeScreen.tsx`: Thay nút "CHECK GIÁ" bằng nút "HỦY HÀNG" với icon màu sắc nổi bật chuyên dụng (ví dụ `FileSpreadsheet` hoặc `ClipboardList`).
- Trong `App.tsx`: Cập nhật route màn hình từ `price` sang `destruction`, liên kết trạng thái và dữ liệu tương ứng.

---

## 3. Kế Hoạch Kiểm Tra & Xác Nhận (Verification Plan)

### Kiểm tra Tự động & Biên dịch
- Chạy `npm run lint` / `compile_applet` để đảm bảo không có lỗi cú pháp hoặc TypeScript errors.
- Kiểm tra module import của `xlsx` hoạt động mượt mà với cấu hình Vite & React 19.

### Kiểm tra Tính năng & Trải nghiệm (Manual / Browser Flow)
1. **Kiểm tra Màn hình chính**:
   - Nút "CHECK GIÁ" cũ đã biến mất hoàn toàn.
   - Nút "HỦY HÀNG" xuất hiện đúng vị trí và bấm vào mở màn hình biên bản hủy hàng.
2. **Kiểm tra Màn hình Hủy hàng**:
   - Bảng hiển thị đầy đủ 5 cột: `STT`, `Mã nội bộ / Barcode`, `Tên hàng`, `Số lượng`, `Ghi chú`. Không có cột tên nhân viên.
   - Thử gõ tìm kiếm theo tên hoặc mã barcode.
   - Thử nhập các số lượng hủy: kiểm tra ô nhập nhạy, mượt mà trên cả thiết bị di động.
   - Kiểm tra bộ đếm số lượng tổng và nút reset dữ liệu nhập tạm.
3. **Kiểm tra Tab Dữ liệu**:
   - Mở mục "Dữ liệu", kiểm tra xuất hiện tab "Biên bản hủy hàng".
   - Thử nghiệm import file Excel `.xlsx` mẫu để kiểm tra dữ liệu nạp vào đúng các cột.
