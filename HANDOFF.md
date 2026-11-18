# Fishy Find (Spot A Fish): tài liệu bàn giao

Mục đích: đọc file này ở máy mới / account mới (hoặc khi port sang Unity) để nắm game đang như thế nào mà không mất ngữ cảnh. **Cập nhật lần cuối 2026-11-18** theo bản `latest`. Quy tắc làm việc ngắn gọn nằm ở `CLAUDE.md`; nhật ký chi tiết từng tính năng nằm ở `docs/gdd/changelog.md`; luật chơi và số liệu nằm ở `docs/gdd/` (đã đối chiếu với code ngày 18/11).

> **Câu mở đầu gợi ý cho Claude ở account mới:** "Đọc `CLAUDE.md` rồi `HANDOFF.md` ở gốc repo spot-a-fish rồi làm tiếp. Trả lời tôi bằng tiếng Việt, hỏi trước khi làm việc không thể hoàn tác (commit / push / release / xoá)."

---

## 1. Dự án là gì

- **Fishy Find** (tên cũ Spot A Fish): game prototype, bể cá 3D (Three.js) + giao diện Phaser 4, có level editor và tài liệu VitePress (GDD).
- Người chơi tap đúng cá giống hai tank mục tiêu; cá sai (hoặc sứa, bạch tuộc) vào Backup (7 ô); đầy Backup thì thua (có Play On). Xong đủ tank thì thắng, có animation win, màn WELL DONE (coin) rồi sang level mới. 60 level.
- Repo: GitHub cá nhân `thuannvathena/spot-a-fish` (origin) và `x-saola/fishy-find` (remote `saola`, riêng tư, chỉ để push). Cả hai luôn nhận cùng nhánh `main`.
- Trang (GitHub Pages): https://thuannvathena.github.io/spot-a-fish/ (`/demo/` là game, `/docs/` là tài liệu, `/editor/` là level editor; mỗi version release có URL riêng). `Play Now` trỏ `/demo/`, nên sau khi push phải chạy `npm run release:latest` thì bản chơi mới cập nhật.

## 2. Quy tắc làm việc (xem `CLAUDE.md`)

- Người dùng nói tiếng Việt: trả lời tiếng Việt, văn bản thường.
- **Hỏi trước** khi commit, push, release, xoá. Chỉ commit / release khi người dùng yêu cầu.
- **Không bao giờ đăng:** `SpotAFish_PrimaryContent/`, `SpotAFish_UnityProject/`, `fish-packs/`, `fish-assets/`, `*.mov`. Được commit: `Added Assets/`, `Fish Asset 3D/`, `public/ui/bf/` (art UI hiện tại, cùng một nhà), cá và âm thanh đã convert.
- ChatGPT để tạo asset thì được.
- Trước release: `npx tsc --noEmit`, `node scripts/check-public.mjs` (hoặc `--tracked`), cập nhật changelog, cây git sạch.
- Báo cáo trung thực cái đã đo và cái chưa; animation phải đo bằng số theo từng frame. Đừng đổi lại những thứ đã được xác nhận ổn (camera win, easing bay cung của cá...). Đừng làm xuất hiện lại lỗi cũ đã sửa (cá giật teleport, cá/decor chồng nhau).

## 3. Chạy lại

```bash
git clone https://github.com/thuannvathena/spot-a-fish.git
cd spot-a-fish
npm install
cd game && npm install && cd ..
npm run dev          # build game + vite ở http://localhost:8080
```

| Lệnh | Việc |
|---|---|
| `npm run dev` | build game rồi chạy dev server (cổng 8080); thêm `-- --host` để thử trên điện thoại cùng Wi-Fi |
| `npm run spike:prepare` | chỉ build lại game (dùng sau **mỗi lần** sửa `game/src/main.js`; thêm `?v=N` vào URL để tránh cache) |
| `npx tsc --noEmit` | kiểm tra TypeScript (phần UI Phaser trong `src/`) |
| `npm run check:public` | kiểm tra file nào sẽ lộ ra khi đăng |
| `npm run release:latest` | đăng bản `latest` lên Pages (cần đang ở `main`, đồng bộ với origin, cây sạch) |
| `npm run release` | release có version |
| `npm run docs:dev` / `docs:build` | tài liệu VitePress |

Memory của Claude Code nằm cục bộ (`~/.claude/projects/.../memory`), không theo account: file này và `CLAUDE.md` là nguồn ngữ cảnh chính. Không có trên GitHub (copy tay nếu cần): hai thư mục Unity ở mục 2, `*.mov`, `Added Assets/Assets from Bubble Fish/` (khoảng 1 GB, art tham khảo của dự án chị em, vẫn bị `.gitignore` chặn).

## 4. Cấu trúc repo

```
game/src/main.js        ← ~5.200 dòng: toàn bộ game 3D (Three.js), AI cá, sự kiện, win, âm thanh. File chính
game/src/template.html  ← HTML + CSS vỏ game; các phần tử ẩn mà UI Phaser đọc trạng thái từ đó
game/src/levelcfg.js    ← luật mở khoá + mặc định (UNLOCK, EVENT_UNLOCK)
game/src/levels.json    ← 60 level (sinh từ bảng thiết kế bằng game/tools/csv-to-levels.mjs)
game/editor/            ← level editor (xem trước game trực tiếp)
game/tools/             ← wr-sim.mjs (bot ước tính tỉ lệ thắng), csv-to-levels, export-levels
src/scenes/Hud.ts       ← HUD Phaser (2 camera, mờ dần UI)
src/ui/bf.ts            ← các pop-up (Pause, Out of space, Buy, Well Done, Level failed...), confetti, coin
src/ui/panels.ts        ← intro level, chữ thắng, booster, chữ khen
src/ui/kit.ts           ← lớp vẽ UI, vật liệu
public/models/fish/     ← 49 cá 3D (model.fbx + tex.jpg) + list.json
public/models/<name>/   ← model của artist: octopus, jelly, clam, clay_pot, stone_pillar, stone_statue, anchor, coral_1..3, glass_bottle
public/ui/bf/           ← art UI hiện tại của các pop-up và nút (91 file)
public/ui/new/          ← nút tròn booster, huy hiệu level, ổ khoá
public/ui/tanks/        ← bể đích, Backup, lồng, bong bóng
public/ui/load/         ← logo và màn loading
public/sfx/             ← âm thanh .m4a (39 file)
Fish Asset 3D/          ← file nguồn của artist (cá, decor)
Added Assets/           ← art / âm thanh nguồn do artist giao
scripts/                ← release.sh, check-public.mjs, prep-fish.py, plan-levels.py, make-levels-doc.py...
docs/gdd/               ← GDD (changelog.md luôn cập nhật)
docs/guide/             ← hướng dẫn editor, deploy, asset workflow
```

## 5. Kiến trúc và điểm vào trong `game/src/main.js`

- Cảnh Three.js chính + renderer **overlay ortho `ov`** (tank backup/target 3D, sprite cá bay, bong bóng, confetti) + canvas Phaser HUD (2 camera: lớp nền có blur và `setAlpha`, pop-up ở camera thứ hai).
- **Cá:** `MODEL3D`, `buildStaticFish`, `modelVariant` (bản đổi màu: xoay màu trong OKLab `oklabTurn`, danh sách góc xấu `HUE_BAD`, lọc hồng/tím + xanh lá `hueToxic`), `makeModelThumb` (thumbnail lưu `THUMB`). AI: `updateThing`, `randomPoint0`, `separate` (đẩy tách mềm, bị giới hạn), `colBodies` / `themeBoxes` (hộp va chạm của decor, mỗi bộ phận một hộp với tàu đắm), `COL_STEP` = 0,045.
- **Decor:** mỗi bộ theme trong `themeG[0..4]`; `place`, `replaceDecor` → `decorOverflow`, `separateDecor`, `clearPotZone`, `hideOverflowDecor`, `randomizeDecor` (mỗi level xếp lại ngẫu nhiên); `loadDecorModel(dir, sway)` nạp model của artist (san hô đung đưa bằng shader).
- **Sự kiện:** `evStart`, `evUpdate`, `evPin` (kéo cá theo quỹ đạo), `evCool` (`EV_COOL` = 20 s yên lặng sau mỗi sự kiện), cho ăn `feedStart` / `feedUpdate` / `feedPick` (mỗi cá chọn một viên và cắn), `swarmStart` (600 cá, 18 s), `startle`.
- **Bạch tuộc / mực:** `squidUpdate`, `octoAnim`, `sprayInk` (`INK_N` 10 đốm, `INK_DUR` 9 s), `inkOpenWater` (chỉ phun ở nước thoáng).
- **Pipe:** `tubeStart`, `tubeUpdate`, `FISH_CAP` = 40.
- **Win:** `vortexStep`, `winPrep`, `winTitleUpdate`, `wellOpen` / `wellClaim` (màn WELL DONE), `COIN_FLY`, `ffHintTick` (dòng "tap to fast forward"), `startRinse`, `makeCurtain`, `nextLevel`.
- **Booster:** `boostUse` (miễn phí lần đầu, rồi đếm, hết thì mở pop-up mua), `hint`, `clearTank`, `clearBackup`, `boostNo` (không dùng được: thông báo + nút lắc).
- **Âm thanh:** `Snd`, `SFX_MAP`, `SAMPLES` (xem `docs/gdd/sounds.md`).
- **Nước:** `glassWater`, `surfU` / `VORT`, `scatter` (gợn sóng chỉ khi bấm ở/ gần mặt nước), lens.
- **Hook kiểm tra:** `window.__qa` (`decorFit`, `fishClip`, `overlapAudit`, `jitter`, `octRelease`, `fishRelease`; xem `docs/qa.md`) và `window.__ff` (`newLevel`, `devWin`, `devEvent`, `showPlayOn`, `showLose`, `sprayInk`, `modelVariant`, `feed`, `THUMB`, `SPECIES`, `G`, `orbit`, ...).

## 6. Số liệu và quyết định thiết kế cần nhớ

- **Mở khoá:** Backup L3, Hint L4, Clear Tank L7, Clear Backup L9, bạch tuộc L11, pipe L16, sò L21, bầy cá L31; sứa từ L8; tank bounty từ L25.
- **Sự kiện theo level:** conga L1, waltz L3, swirl L6, ngọc trai L9, squabble L12, cho ăn L15, đá rơi L21; 20 s yên lặng sau mỗi sự kiện.
- **Mỗi 10 level đổi** theme (6 kiểu hall), hình bể (cylinder, bowl, box, hex, flower, heart) và bộ decor (5 bộ).
- **Cá:** 49 loài, kích thước 1,4, tốc độ 0,85 × 0,85 (`FISH_SLOW`); trần 40 cá trong bể một lúc.
- **Coin:** bắt đầu 900; thắng +30/60/90; giá Hint 300, Clear Backup 900, Clear Tank 1500 (3 lượt mỗi gói); Play On lần đầu miễn phí, sau đó 900 coin hoặc quảng cáo (tối đa 5 lần/ngày mỗi loại). Quảng cáo chưa nối (bấm là nhận thưởng ngay).
- **Va chạm:** không thứ gì nhìn thấy được trong bể được chồng lên nhau; cá bị đẩy ra khỏi vật đặc tối đa 0,045 mỗi khung hình; khi tạm dừng không gì di chuyển.
- Win: camera win và easing bay cung đã được chốt (đừng đổi).
- Tự hạ độ phân giải: mặc định 2.0 → 1.5 khi tụt FPS; `?res=2` hoặc `?hq=1` giữ nét; `?fps=1` hiện FPS.

## 7. Cạm bẫy đã gặp (đừng lặp lại)

1. **Comment `//` cuối dòng nuốt phần còn lại của câu lệnh một dòng** trong `game/src/main.js` (đã làm hỏng build nhiều lần). Dùng `/* */` hoặc đặt comment trên dòng riêng.
2. Additive blending trong three.js nhân màu với alpha một lần nữa: xuất `vec4(màu, alpha)`.
3. Khi kiểm thử win bằng cách đóng băng thời gian (`__winScale` ≈ 0), vệt cá bị kéo thành khối đen: đó là do đóng băng.
4. Cửa sổ preview mất focus (hoặc tab bị ẩn) thì game **tự pause** và mở pop-up Pause; bấm Resume trước khi đo. Khi kiểm thử, bấm vào mép ngoài của trang để lấy focus.
5. Cache trình duyệt: thêm `?v=N` vào URL.
6. **Hộp va chạm của một vật nhiều phần có thể phình rất to** (tàu đắm với cột buồm nghiêng từng thành một hộp 3 × 2,3 × 2,4 giữa bể nhỏ và làm cá giật). Với vật mới, kiểm ở hình bể nhỏ nhất.
7. Một hàm vẽ trung gian làm rơi mất tham số (`__ff.cageCanvas` từng bỏ `t` và canvas đích, nên nước trong pop-up đứng im). Khi bọc một hàm, truyền đủ tham số.
8. Lỗi "Page build failed" của Pages thỉnh thoảng thoáng qua: chạy lại bản build bằng `gh api -X POST repos/thuannvathena/spot-a-fish/pages/builds`.

## 8. Trạng thái còn lại / chưa kiểm chứng

- **Chưa chơi trên điện thoại thật:** cảm giác chạm, camera hai ngón, hiệu năng (nhất là các level nhiều cá 55-60), âm thanh.
- Ở level rất đông cá (55-60) vẫn còn một vài cặp cá đè nhau thoáng qua trong sự kiện; chưa truy hết các cú nhảy vị trí lớn lúc có sự kiện hoặc giờ ăn.
- Màu cá đổi (look-alike): đã lọc các góc bạn khoanh và cặp hồng/tím + xanh lá, nhưng `blue_chunker` chỉ còn rất ít màu tốt; cá nhiều màu vẫn bị xoay mọi màu cùng một góc.
- Popup **Levels** (lưới chọn level) vẫn là HTML kiểu cũ; các khung HTML cũ của Pause, Lose, Play On, Buy vẫn nằm trong `template.html` dưới lớp Phaser (làm vùng bấm).
- Chưa có analytics; số liệu tỉ lệ thắng của bot (`wr-sim.mjs`) chỉ là ước đoán.

## 9. Quy trình release (khi người dùng yêu cầu)

1. `npx tsc --noEmit` và `node scripts/check-public.mjs` phải sạch.
2. Cập nhật `docs/gdd/changelog.md` (và các trang GDD nếu luật chơi đổi).
3. Cây git sạch (commit trước, chỉ khi người dùng bảo), `main` đồng bộ với origin.
4. `npm run release:latest` (bản latest) hoặc `npm run release` (bản có version). Đợi khoảng một phút cho Pages cập nhật.
