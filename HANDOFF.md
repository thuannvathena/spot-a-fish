# Spot A Fish — tài liệu bàn giao (handoff)

Mục đích: dán/đọc file này ở account mới (hoặc máy mới) để tiếp tục dev game mà không mất ngữ cảnh. Viết ngày 2026-11-10, tổng hợp toàn bộ các phiên làm việc đến thời điểm này.

> **Câu mở đầu gợi ý cho Claude ở account mới:** "Đọc `HANDOFF.md` ở gốc repo spot-a-fish rồi làm tiếp theo đó. Trả lời tôi bằng tiếng Việt, hỏi trước khi làm việc không thể hoàn tác (commit/release/xoá)."

---

## 1. Dự án là gì

- **Spot A Fish**: game prototype, bể cá 3D (Three.js) + giao diện Phaser 4 (HUD), có level editor và tài liệu VitePress (GDD).
- Người chơi tap vào đúng cá giống hai tank mục tiêu; cá sai vào Backup (7 ô); đầy Backup thì thua (có Play On). Xong đủ tank thì thắng và có animation win.
- Repo (public, tài khoản **cá nhân**): https://github.com/thuannvathena/spot-a-fish
- Trang (GitHub Pages): https://thuannvathena.github.io/spot-a-fish/ (gồm play, editor, docs; mỗi version release có URL riêng)
- Thư mục làm việc: thư mục `spot-a-fish` (clone của repo trên).
- Nhánh: `main`. Commit gần nhất: `7942420 Blur the top row and target plates on the lose screen`.

## 2. Quy tắc làm việc mà người dùng đã đặt ra (giữ nguyên ở account mới)

1. **Ngôn ngữ:** người dùng nói tiếng Việt → trả lời tiếng Việt, văn bản thường (không cần format nặng).
2. **Hỏi trước khi làm việc không hoàn tác hoặc đưa ra ngoài:** commit, push, release, xoá, đăng lên GitHub. **Chỉ commit/release khi người dùng yêu cầu.**
3. **Hai thư mục Unity KHÔNG được đăng lên repo:** `SpotAFish_PrimaryContent/` và `SpotAFish_UnityProject/` (đã ở `.gitignore`), nhưng được dùng để phát triển. Cũng không đăng clip `Lose Anim.mov` (đã xoá) và `win animation idea.mov` (đã gitignore). `New Win Anim.mov` (clip tham chiếu animation win, ở gốc dự án) hiện **chưa được theo dõi** (untracked) — không nên commit.
4. **Được commit:** `Added Assets/` và `Fish Asset 3D/`.
5. **Đã chấp nhận publish** cá/âm thanh có nguồn gốc từ Unity (model đã convert sang `.glb`, `.m4a`).
6. **Không dùng ChatGPT để tạo asset nữa** (Gemini là lựa chọn nếu cần).
7. Làm trên **GitHub cá nhân** (`thuannvathena`), không phải GitHub công ty.
8. Trước khi release phải chạy `node scripts/check-public.mjs` (kiểm tra không lộ file không được đăng). Release cần **cây git sạch**.
9. Báo cáo trung thực: cái gì đã kiểm tra bằng số liệu/ảnh, cái gì chưa. Người dùng rất khó chịu khi tôi báo "ổn" dựa trên ảnh chụp thưa. Với animation, **đo vị trí/độ mờ bằng số theo từng frame** thay vì chỉ nhìn vài ảnh.
10. Cảnh báo trong phiên: đừng tự đổi những thứ đã được xác nhận là ổn (ví dụ camera win đã đúng, đừng "cải tiến" lại).

## 3. Chạy lại trên máy/account mới

```bash
git clone https://github.com/thuannvathena/spot-a-fish.git
cd spot-a-fish
npm install
cd game && npm install && cd ..
npm run dev          # build game + mở vite ở http://localhost:8080
```

Lệnh hữu ích (`package.json`):

| Lệnh | Việc |
|---|---|
| `npm run dev` | build game rồi chạy dev server (cổng 8080) |
| `npm run spike:prepare` | chỉ build lại `game` (dùng sau khi sửa `game/src/main.js`) |
| `npx tsc --noEmit` | kiểm tra TypeScript (HUD Phaser: `src/`) |
| `npm run check:public` | kiểm tra file nào sẽ lộ ra khi đăng |
| `npm run release:latest` | đăng bản `latest` lên Pages |
| `npm run release` | release có version (dùng cùng plugin prototype-builder) |
| `npm run docs:dev` / `docs:build` | tài liệu VitePress |

**Cần cài ở account mới:** plugin **prototype-builder** (các lệnh `/prototype-builder ...`, ví dụ `release_demo`) và các skill Phaser trong `.claude/skills` (có sẵn trong repo). Cần đăng nhập `gh` bằng tài khoản `thuannvathena`.

### Việc phải làm TRƯỚC khi chuyển máy

- **Có rất nhiều thay đổi chưa commit** (xem mục 9). Nếu chuyển sang máy khác, phải commit + push trước, nếu không sẽ mất. Chuyển account trên cùng máy thì cây làm việc vẫn còn nguyên.
- Các file không có trên GitHub, phải copy tay nếu cần: `SpotAFish_PrimaryContent/`, `SpotAFish_UnityProject/`, `New Win Anim.mov`, `win animation idea.mov`, `Added Assets/Sound/` (chưa commit nhưng được phép commit; bản `.m4a` đã convert nằm ở `public/sfx/`), `fish-packs/` (gitignore, tạo lại bằng `scripts/unity-fish-pack.py`).
- Bộ nhớ của Claude Code nằm cục bộ ở `~/.claude/projects/-Users-thuannv-prototypes-spot-a-fish/` — không theo account. Vì vậy file này là nguồn ngữ cảnh chính. Gợi ý: sao chép mục 2 vào một `CLAUDE.md` ở gốc repo để mọi phiên đọc tự động.

## 4. Cấu trúc repo

```
game/src/main.js        ← ~3200 dòng: toàn bộ game 3D (Three.js). File chính.
game/src/template.html  ← HTML + CSS của HUD DOM (backup/target là điểm neo layout, ẩn)
game/src/levelcfg.js    ← cấu hình level (tank: L>=5, clear: L>=6 ...)
game/src/levels.json    ← 15 level (L16/L17 đã xoá)
game/editor/            ← level editor (có xem trước game trực tiếp, bảng cá)
src/scenes/Hud.ts       ← HUD Phaser: 2 camera, blur, mờ dần giao diện trên
src/ui/panels.ts        ← vẽ panel: level intro, win text + confetti, booster, overlay
src/ui/kit.ts           ← Layer, vật liệu UI
public/models/unity/    ← 22 cá Unity (fish_NN.glb) + list.json + eyes.json + swarm_fish.glb
public/sfx/             ← âm thanh .m4a
public/ui/tanks/        ← ảnh bể/bong bóng
scripts/                ← release.sh, check-public.mjs, unity-fish-*.py, ...
docs/gdd/               ← GDD (changelog.md luôn cập nhật; overview/rules/art-audio/roadmap/levels)
docs/guide/             ← hướng dẫn editor, deploy, asset workflow
```

`docs/gdd/changelog.md`, mục **latest (main)**, là nhật ký chi tiết từng tính năng — luôn cập nhật khi thêm tính năng.

## 5. Kiến trúc & điểm vào trong `game/src/main.js`

- Cảnh chính Three.js + renderer **overlay ortho `ov`** (tank backup/target 3D, sprite cá bay, bong bóng, confetti) + canvas Phaser HUD (2 camera: lớp base trên camera chính có blur và `setAlpha`; popup ở camera thứ hai).
- **Cá:** tất cả là model 3D (22 cá Unity + `blue_white_babe`). `buildModelFish`, `registerUnity`, `loadUnity`, `makeModelThumb` (thumbnail một lần mỗi loài/biến thể màu, lưu `THUMB`). Cá Unity có mắt là hình trên texture; chớp mắt bằng shader `uBlink`.
- **Pipe/tube:** `tubeStart`, `tubeUpdate`, `tubeStarved`, `FISH_CAP = 40`. Đợt cá 7–11 con; chỉ bơm khi tank đã thưa, hoặc quá hạn (8 s hoặc xong thêm 1 tank), hoặc thật sự kẹt.
- **Booster (vô hạn):** Hint → Clear Tank (tank cần nhiều cá nhất, cá thật nhảy ra từ nước) → Clear Backup (`clearBackup(win)`).
- **Win:** `celebrate()`, `celUpdate`, `vortexStep`, `winCam`, `makeVortex`, `startRinse`, `makeCurtain`, `nextLevel`.
- **Swarm (L9+):** `swarmStart/Update`, `makeSwarmHouse` (hang đá 3D), `SWARM` (cá Unity 414 tam giác tô xám).
- **Âm thanh:** `Snd` (Web Audio, `SFX_MAP`, BGM duck/fade).
- **Nước:** `glassWater` (nước chảy trên kính), `surfU`/`VORT` (mặt nước), pass lens `lensMat` (bẻ cong qua kính, chỉ ở desktop).
- **Hook debug:** `window.__ff` (có `celebrate`, `newLevel`, `feed`, `feedStart`, `swarmStart`, `swarm`, `tube`, `THUMB`, `SPECIES`, `MODEL3D`, `UNITY`, `ov`, `cam`, `G`, ...), `window.__winScale` (hệ số thời gian cho win; đặt ~0 để đóng băng), `window.__fps`, `window.__blink`.

## 6. Đã làm xong (tóm tắt theo chủ đề)

- Toàn bộ cá thành model 3D; bỏ cá 2D, cá voi, cá mập, level 16/17. Âm thanh tích hợp theo danh sách của người dùng (quy tắc BGM).
- Ba booster vô hạn, popup Play On khi Backup đầy, nước chảy trên kính khi thua (đã được khen "đẹp"), hiệu ứng vỡ tank.
- Intro level (bong bóng + chữ, không hiện ở level 1), camera tutorial, chỉ giữ emoji 💢/👆/❓, blur hàng trên/plate khi thua, booster mờ khi camera chuyển động, mắt chớp chậm hơn, decor nằm trong kính.
- **Animation win (đã chốt, người dùng báo "ok ổn rồi"):** tối đa 10 cá xoắn ốc 2–3 sợi (hình nón, rộng đáy hẹp đỉnh), camera rộng rồi tiến gần dần lên miệng bể, cá nhảy cung ra quanh bong bóng 3D, bong bóng nổ, cá văng và rơi xuống nước, "LEVEL COMPLETE" + confetti + nhạc; rèm hồ cá **đóng sau chữ 2 s**, level mới dựng sau rèm, chạm để bỏ qua; sau level cuối quay về level 1. Không hiện sao. Khi thắng: cá còn trong Backup nhảy về bể trước; giao diện trên, hai tank đích và Backup cùng mờ dần. Cá win bao quanh bằng xoáy nước (bong bóng + hạt cát quay quanh trục, lõi khí, phễu lõm trên mặt) và bắn nước khi trồi lên.
- Xô thức ăn (feed) bay lên và biến mất gọn.
- **Swarm:** cá 3D tô xám (từ `Fish_2` Unity, ~414 tam giác), cố định **500 con**, cùng chiều xoáy, chui ra/vào hang đá 3D. Thời lượng mỗi con 18 s ở level 9 → tối đa 26 s, cộng ≤3 s so le (tổng ~21–29 s).
- **Sửa lỗi pipe:** không tự bơm ngay khi vào level; toast "New fish are coming out" chỉ hiện khi cá thật sự ra; bơm quá hạn để không bị khoá khi dùng booster liên tục.
- Script phụ: `scripts/unity-fish-pack.py` (gom mọi file của một con cá Unity vào `fish-packs/Fish_N/`, thư mục đó gitignore).

## 7. Con số & quyết định thiết kế cần nhớ

- Level 1: 4 tank, không Backup/Hint; tank 3D từ level 5; Clear Backup từ level 6; tube từ level 7; swarm từ level 9.
- Pipe đợt đầu **không được tới sau tank đầu tiên**. Điều kiện bơm: `due` (đủ số tank) và (`sparse` ≤ 58% × 40 con, hoặc `overdue`), hoặc `tubeStarved` (không còn cá cần bắt). Tank đầy 40 → nắp pipe `hold`, nhưng cá mục tiêu vẫn ra.
- Win: `WIN = { brk: 1.0, burst: 4.6, cover: 5.6 }`, rèm +2 s sau chữ. Camera `dist = base * (1 + .3*out - .52*inn)` (đừng đổi — bản "lùi xa quá" đã bị người dùng chê).
- `rOrb`/quỹ đạo cá quanh bong bóng giữ gọn trong khung; easing bay cung phải là smoothstep chuẩn (bản `*.55` từng làm cá vọt ra ngoài rồi giật về).
- Tự hạ độ phân giải: mặc định 2.0 → 1.5 khi tụt FPS; `?res=2` hoặc `?hq=1` giữ nét; `?fps=1` hiện FPS/res.
- Số liệu ước (chỉ là đoán): người chơi quen mất ~3–5 s để thấy và tap trúng 1 con; lần đầu 8–15 s. Chưa có analytics.

## 8. Cạm bẫy đã gặp (đừng lặp lại)

1. **Comment `//` cuối dòng nuốt phần còn lại của câu lệnh một dòng** (đã xảy ra nhiều lần, làm hỏng build hoặc vô hiệu hoá camera win). Luôn đặt comment ở cuối dòng sau toàn bộ lệnh, hoặc dùng dòng riêng.
2. **Additive blending trong three.js nhân màu với alpha một lần nữa** → nếu đã nhân sẵn alpha vào màu thì hiệu ứng gần như vô hình. Xuất `vec4(màu, alpha)`.
3. Khi kiểm thử win bằng cách đóng băng thời gian (`__winScale≈0`), dải vệt cá bị kéo dài thành khối đen — đó là hiện tượng do đóng băng, không có khi chạy thật.
4. Cửa sổ preview mất focus thì game **tự pause** (popup "Paused"); bấm Resume trước khi đo.
5. Cache trình duyệt: thêm `?v=N` vào URL. Cmd+Shift+R bị app chụp màn hình chiếm.
6. TypeScript/Phaser 4: `addBlur(quality, x, y, strength, color, steps)`; `fillPoints` cần `Phaser.Math.Vector2`.
7. Sandbox từng chặn `npx gltfpack`/`pip install meshoptimizer`; dùng bộ giảm tam giác tự viết trong `scripts/unity-fish-to-glb.py` (`--ratio`, tối thiểu ~414 tam giác cho mỗi con vì bảo vệ đường nối UV).
8. Lỗi "Page build failed" của Pages từng xuất hiện thoáng qua; chạy lại `gh api -X POST repos/thuannvathena/spot-a-fish/pages/builds`.
9. Thumbnail cá FBX (`blue_white_babe`) có thể bị chụp lúc clip bơi đang chớp mắt; đã thêm `openEyes()` nhưng **chưa xác nhận đó là nguyên nhân** của ảnh "mắt nhắm" người dùng gặp.

## 9. Trạng thái chưa commit / chưa kiểm chứng / việc còn lại

**Chưa commit (tất cả từ sau `7942420`):** thay đổi ở `.gitignore`, `docs/gdd/changelog.md`, `game/editor/main.js`, `game/src/levelcfg.js`, `game/src/levels.json`, `game/src/main.js`, `game/src/template.html`, `src/scenes/Hud.ts`, `src/ui/panels.ts`; file mới `.claude/launch.json`, `public/sfx/`, `Added Assets/Sound/`, `scripts/unity-fish-pack.py`, `public/models/unity/swarm_fish.glb`. Cũng có `fish-assets/` và `fish-assets.zip` (không phải do tôi tạo trong các phiên này — kiểm tra trước khi commit) và `New Win Anim.mov` (không commit).

**Chưa kiểm chứng:**
- Hiệu năng **trên điện thoại thật**: swarm 500 con × ~414 tam giác (~319k tam giác/khung hình, desktop 60 fps), 40 cá ~64k tam giác, hạt xoáy nước.
- Chuyển động thật của xoáy nước, hang swarm (cửa hang có nhìn rõ không), cá chui vào hang lúc kết thúc. Mới xem ảnh tĩnh.
- Âm thanh trên điện thoại.
- Chuỗi "No thanks" của Play On.
- Pipe trong một lượt chơi thật liên tục (đã mô phỏng, chưa chơi trọn level 8 với booster).
- Ảnh "cá mắt nhắm" ở plate mục tiêu: chưa tái hiện được; cần biết level nào.
- Xử lý khi Backup đầy 7 con ở thời điểm thắng.

**Còn mở / đề xuất:**
- Làm rong/đồ trang trí nghiêng theo chiều dòng xoáy (đã đề xuất, chưa làm).
- Tắt tự hạ độ phân giải trên desktop (đã đề xuất, chưa được trả lời).
- Hai tank đích đã mờ cùng giao diện khi thắng (người dùng chỉ nhắc Backup; nếu muốn giữ hai tank đích thì đảo một dòng `hudAl()` trong `tankFx.update`).
- Thêm log "thời gian đến lần tap đúng" nếu muốn số liệu thật (người dùng nói "ước chừng trước").
- Giảm số/tam giác swarm cho máy yếu nếu giật.

## 10. Quy trình release (khi người dùng yêu cầu)

1. `npx tsc --noEmit` và `node scripts/check-public.mjs` phải sạch.
2. Cập nhật `docs/gdd/changelog.md`.
3. Cây git sạch (commit trước — chỉ khi người dùng bảo).
4. `npm run release:latest` (bản latest) hoặc `/prototype-builder release_demo` (bản có version, ví dụ `v0.1.0`).
5. Kiểm tra Pages build; nếu lỗi thoáng qua thì chạy lại build.
