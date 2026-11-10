# Spot A Fish — quy tắc cho Claude (đọc đầu tiên)

Ngữ cảnh đầy đủ: `HANDOFF.md`. Nhật ký tính năng: `docs/gdd/changelog.md`.

- Người dùng nói tiếng Việt → trả lời tiếng Việt, văn bản thường.
- **Hỏi trước** khi commit, push, release, xoá. Chỉ commit/release khi người dùng yêu cầu.
- Không bao giờ đăng: `SpotAFish_PrimaryContent/`, `SpotAFish_UnityProject/`, `fish-packs/`, `fish-assets/`, `*.mov`. Được phép commit: `Added Assets/`, `Fish Asset 3D/`, cá/âm thanh Unity đã convert (`public/models/unity`, `public/sfx`).
- Không dùng ChatGPT để tạo asset. Làm trên GitHub cá nhân `thuannvathena`.
- Trước release: `npx tsc --noEmit`, `node scripts/check-public.mjs`, cập nhật changelog, cây git sạch.
- Báo cáo trung thực cái đã đo/kiểm và cái chưa; animation phải đo bằng số theo từng frame, không chỉ nhìn vài ảnh.
- Đừng đổi lại những thứ đã được xác nhận ổn (camera win, easing bay cung của cá, v.v.).
- Cạm bẫy hay gặp: comment `//` cuối dòng nuốt phần còn lại của câu lệnh một dòng trong `game/src/main.js`.
- Sau khi sửa `game/src/main.js` chạy `npm run spike:prepare`; test trình duyệt thêm `?v=N` để tránh cache; cửa sổ mất focus thì game tự pause.
