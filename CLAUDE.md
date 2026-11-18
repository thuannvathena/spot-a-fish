# Spot A Fish — quy tắc cho Claude (đọc đầu tiên)

Ngữ cảnh đầy đủ: `HANDOFF.md`. Nhật ký tính năng: `docs/gdd/changelog.md`.

- Người dùng nói tiếng Việt → trả lời tiếng Việt, văn bản thường.
- **Hỏi trước** khi commit, push, release, xoá. Chỉ commit/release khi người dùng yêu cầu.
- `public/ui/bf/` (art UI hiện tại, cùng một nhà) được phép commit và push, kể cả saola; chỉ chặn các thư mục cá Unity dưới đây.
- Không bao giờ đăng: `SpotAFish_PrimaryContent/`, `SpotAFish_UnityProject/`, `fish-packs/`, `fish-assets/`, `*.mov`. Được phép commit: `Added Assets/`, `Fish Asset 3D/`, cá đã convert (`public/models/fish`) và âm thanh (`public/sfx`).
- Dùng ChatGPT để tạo asset thì được (trước đây tạm tránh vì dùng chung account, không phải lệnh cấm). Làm trên GitHub cá nhân `thuannvathena`.
- **GDD/Documentation phải đi cùng mỗi thay đổi.** Không giới hạn ở danh sách dưới đây: BẤT KỲ thay đổi nào của game (kể cả loại mới sau này) đều phải được ghi vào GDD, và ghi chi tiết, kỹ lượng (hành vi, điều kiện, con số, ngoại lệ, test hook), đủ để Dev dựng lại bên Unity và QA kiểm được. Ví dụ gameplay, luật, số liệu, UI, âm thanh, level, editor, hiệu ứng, bố cục, công cụ: cập nhật `docs/gdd/*` (rules, core-loop, levels, sounds, art-audio, roadmap), `docs/qa.md`, `docs/guide/*`, `HANDOFF.md` và changelog trong CÙNG commit/release. QA/Dev dùng GDD để code lại bằng Unity và kiểm bug/logic, nên GDD sai hoặc cũ thì họ không có cơ sở làm việc. Số liệu trong GDD phải đo hoặc đọc từ code, không đoán; cái chưa đo thì ghi rõ là chưa đo. Khi người dùng nói "commit/release", tự kiểm GDD đã khớp thay đổi chưa trước khi làm.
- Trước release: `npx tsc --noEmit`, `node scripts/check-public.mjs`, cập nhật changelog, cây git sạch.
- Báo cáo trung thực cái đã đo/kiểm và cái chưa; animation phải đo bằng số theo từng frame, không chỉ nhìn vài ảnh.
- Đừng đổi lại những thứ đã được xác nhận ổn (camera win, easing bay cung của cá, v.v.).
- Cạm bẫy hay gặp: comment `//` cuối dòng nuốt phần còn lại của câu lệnh một dòng trong `game/src/main.js`.
- Sau khi sửa `game/src/main.js` chạy `npm run spike:prepare`; test trình duyệt thêm `?v=N` để tránh cache; cửa sổ mất focus thì game tự pause.
