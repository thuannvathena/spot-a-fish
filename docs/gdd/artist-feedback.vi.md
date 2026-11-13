# Phản hồi của artist: kế hoạch và danh sách kiểm (bản tiếng Việt)

Mỗi gạch đầu dòng là một ý của artist. Trạng thái: `[ ]` chưa xong, `[x]` đã làm và đã kiểm, `[?]` cần chủ dự án quyết định.
Bản gốc tiếng Anh: `artist-feedback.md`.

## R. Đổi tên game thành "Fishy Find" (chủ dự án đã quyết)
- [x] R1 Logo mới "FISHY FIND", tạo bằng ChatGPT (chủ dự án cho phép riêng cho logo, thay cho quy tắc "không dùng ChatGPT" trong CLAUDE.md), nền trong suốt (vẽ trên nền một màu rồi xoá màu bằng script có sẵn)
- [x] R2 Tên người chơi nhìn thấy: tiêu đề trang, màn hình tải, tiêu đề tài liệu, trang giới thiệu, các pop-up có chữ "Spot A Fish"
- [x] R3 KHÔNG đổi (sẽ làm hỏng đường dẫn và dữ liệu lưu): tên repo và địa chỉ Pages `spot-a-fish`, khoá lưu `findfish_v1`, tên biến trong code. Đổi tên repo là việc của chủ dự án.

## A. Logo game / màn hình tải (logo mới bao gồm A1 đến A3)
- [x] A1 Chữ thứ hai (FIND): màu vàng cam thay cho hồng cam
- [x] A2 Bớt các ngôi sao lấp lánh quanh logo (rối quá)
- [x] A3 Con cá trong kính lúp chưa đẹp: vẽ con đẹp hơn trong logo mới
- [?] A4 Bỏ con cá thứ hai dưới thanh tải, thay bằng một icon `[?]` chọn icon nào (hiện dùng kính lúp)
- [x] A5 Phần fill của thanh tải sáng hơn (không cùng màu với khung), có lớp nền tối hơn dưới khung, chữ nằm trên thanh

## B. Icon: Level, Pause, Booster
- [x] B1 Icon quá to, che mất bong bóng của nút: thu nhỏ icon (hoặc bỏ bong bóng nếu không cần)
- [x] B2 Icon rung (vibration) trong Settings bị hỏng: kiểm và sửa

## C. Hướng dẫn lần đầu cho Booster (FTUE)
- [x] C1 Căn chữ vào giữa khung
- [x] C2 Sửa mũi tên chỉ của bong bóng thoại

## D. Màn hình tính năng mới
- [x] D1 Chưa có hiệu ứng cho chữ "NEW FEATURE" và tên tính năng
- [x] D2 Bỏ khung chữ (chỉ để chữ)
- [x] D3 Có nút "Continue" thay cho dòng "Tap to continue"

## E. Nền theme mỗi 10 level
- [x] E1 Có hai theme trông giống nhau: mỗi theme trong 6 theme phải có màu khác hẳn
- [x] E2 Khi đổi theme phải thấy rõ sự thay đổi (để người chơi cảm nhận được)

## F. Level Hard / Super Hard
- [x] F1 "LEVEL 10" và "LEVEL 20": các chữ số đè lên nhau
- [x] F2 Số level quá nhạt: chữ trắng có viền, huy hiệu tròn màu tím (Hard) / đỏ (Super Hard)

## G. Kiểu chữ (mọi pop-up và tiêu đề)
- [x] G1 Màu đang nhạt kiểu pastel viền trắng: làm sống động, thêm viền mảnh màu tối (nâu đen hoặc xanh đen)
- [x] G2 Chữ trắng có viền tối dày
- [x] G3 Một quy tắc chung cho bóng đen của chữ (pop-up Settings đang khác các chỗ còn lại)
- [x] G4 Không có hiệu ứng sóng, gợn trên chữ

## H. Bể đích (target) và ô Backup
- [x] H1 Bể đích: bỏ cây cỏ hai bên
- [x] H2 Backup: bỏ tia sáng chiếu xuống
- [x] H3 Cả hai: dựng 3D hơn, theo phong cách bể lớn bên dưới
- [x] H4 Hình nền phía sau trông phẳng / 2D

## I. Kết thúc đợt này
- [ ] I1 Kiểm từng mục trên màn hình cỡ điện thoại và màn hình rộng
- [ ] I2 Ghi changelog và phát hành

---

## Các yêu cầu bổ sung phát sinh sau đó (không có trong danh sách của artist)

Phần này là những việc chủ dự án nhắn thêm trong lúc làm bể đích và Backup. Chưa có trong bản gốc tiếng Anh.

### Bể đích (target)
- [x] Bể là hộp kính chữ nhật thật có độ sâu (vách sau, hai vách bên, nền cát, mặt nước), thành kính mỏng như bể lớn
- [x] Nắp và tấm hiển thị cá là **một**: nắp xoay mở lên trên bản lề ở thành sau, dựng thẳng 90°, mặt trong nắp là biển LED hiện cá cần tìm và số lượng; đóng thì chỉ thấy mặt nắp
- [x] Bản lề chỉ một chiếc ở giữa thành sau, đứng yên; có gờ miệng bể nối nắp với bể
- [x] Khi hoàn thành bể: nắp đóng trước, rồi bể mới xoáy; bể mới có nắp đóng rồi mở ra; restart level cũng có hoạt cảnh mở nắp
- [x] Biển LED: nền kính tối, lưới điểm LED, cá phát sáng, chữ số sáng; bật lên có nhấp nháy, đổi số thì chớp một lần
- [ ] Biển LED có lúc một bên mờ một bên sáng (chủ dự án thấy): chưa tái hiện được, đã thêm cơ chế tự vẽ lại để không kẹt ở trạng thái tối
- [x] Mặt nước sóng sánh, giọt nước bắn nhỏ và cùng màu nước
- [x] Cá bay (lên bể, xuống Backup, xuống bể lớn) được vẽ trên mọi lớp, trừ bể lớn
- [x] Cá trong bể to vừa phải, không lòi ra khỏi thành
- [x] Cá chạm nước thì chìm xuống theo quán tính rồi ngẩng lên (ở bể đích đã đo; ở bể lớn và màn thắng chưa xem bằng mắt)

### Backup (ô giam)
- [x] Hướng thiết kế: "buồng giam": khung thép, song sắt, nước đục hơn, đối lập với bể đích sáng
- [x] Mỗi ô là một buồng có song chắn trước kính; cá nằm sau song
- [x] Mặt nước có sóng và nhấp nhô khi có cá rơi vào; cảnh báo đỏ khi gần đầy
- [x] Con mực (sau này là bạch tuộc) chiếm 3 ô: nằm ngang trải qua ba ô, vẽ đè lên song của chính nó để không bị song cắt
- [x] Thành trên mỏng và dẹt hơn
- [x] Khung là một vòng liền, các cạnh cắt xéo 45° tại góc; đã bỏ đinh tán
- [x] Khung bị chê thô: đã thay bằng bộ phận khung thép do ChatGPT vẽ (góc, thanh ngang, thanh dọc, song), xoá nền bằng `scripts/key-cage.py`; chủ dự án cần xem lại hình dạng cuối
- [ ] Cá trong ô bị cắt bởi khung: đã thu nhỏ cá cho vừa chiều cao ô, cần chủ dự án xem lại

### Âm thanh
- [x] Đã gắn 17 file âm thanh mới; âm combo 1 đến 4 rồi giữ nguyên âm 4 cho đến khi gãy combo
- [x] `sfx_win_swirl` dời trễ cho khớp lúc cá bắt đầu xoắn; `sfx_win_bubble_pop` cho bóng nổ cuối màn thắng
- [x] Âm tổng thể giảm, BGM giảm, combo to lên
- [ ] Chưa nghe thử trong game: toàn bộ phần âm thanh mới gắn theo code

### Khác
- [x] Đổi tên hiển thị thành Fishy Find; hai gạch nút Pause không còn biến mất khi kéo camera; căn giữa số level và hai gạch
- [x] Màn rong rêu: ít cây hơn, ngắn hơn, không lòi ra ngoài kính
- [x] Icon booster to hơn một chút và căn giữa
- [x] Kính lúp trên thanh tải làm chữ "Finding fish" phồng lên như kính lồi; kính căn giữa thanh
