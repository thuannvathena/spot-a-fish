# Sounds / Âm thanh

**Trạng thái (12/11):** đã gắn xong toàn bộ file trong `Added Assets/Sound/Newly Added` (đổi sang m4a, để ở `public/sfx`). Âm nào không có file thì **không phát** (đã bỏ hết tiếng tổng hợp bằng code).

| Âm | File | Khi nào phát |
|---|---|---|
| Combo | `sfx_combo_word_1..4` | Ngay lúc bấm cá đúng, từ cá thứ 2 trong chain: 1, 2, 3, 4 rồi giữ nguyên âm 4 cho đến khi gãy combo (chữ khen hiện đúng chỗ cá vừa bấm) |
| Bấm sai | `sfx_bad` | Cá sai hoặc vật cản đáp xuống Backup; nước tràn lúc thua |
| Bấm vào nước | `sfx_tap_water` | Bấm chỗ trống; ống bắt đầu rung |
| Ống mở / đóng | `sfx_pipe_open` / `sfx_pipe_close` | Ống sắp thả cá / thả xong hoặc tạm giữ |
| Nước bắn | `sfx_splash` | Cá nhảy ra khỏi mặt nước, cá rơi lại sau màn thắng, thả đá, ngọc trai chạm nước |
| Sò | `sfx_clam_snap`, `sfx_clam_tap_open` | Sò đớp cá; mỗi lần bấm sò và lúc sò mở (dùng chung một file) |
| Ngọc trai | `sfx_pearl_bounce` | Mỗi lần ngọc trai nảy |
| Thanh tiến độ | `sfx_bubble_hit_gauge`, `sfx_gauge_fill` | Bóng bay trúng thanh; thanh dâng lên (trễ 0,1 s) |
| Xoáy thắng | `sfx_win_swirl` | Lúc cá bắt đầu bơi xoắn trong màn thắng (T = 0,3 s) |
| Rèm | `sfx_curtain_close` / `sfx_curtain_open` | Rèm đóng sau màn thắng / rèm mở sang level mới |

Không dùng (chưa có file): swarm, squabble, conga, hide, feed, nhím/sứa, bounty, title pop, tutorial, kết quả, camera, đổi hình bể, ambience, `sfx_combo_step`.

---

# Reference (cho tôi tra cứu, bạn không cần đọc) / Inventory

## Đã có file ghi âm (public/sfx)

| File | Phát khi |
|---|---|
| bgm_ap.m4a | Nhạc nền; chạy lại mỗi level, nhỏ đi khi có pop-up |
| ui_button_click.m4a | Mọi nút; cũng dùng cho bấm vào chỗ trống (miss) |
| sfx_fish_tap.m4a | Bấm đúng cá |
| sfx_fish_to_backup.m4a | Cá vào Backup |
| sfx_fish_to_tank_or_vice_versa.m4a | Cá vào bể đích / rút từ Backup; chữ khen hiện lúc cá vào bể. File này là tiếng vù/nước nên không đổi cao độ được (đã thử, không nghe ra; nốt chuông bằng code nghe dở nên bỏ) |
| sfx_fish_spawn.m4a | Ống đẩy cá ra |
| sfx_hint.m4a | Booster gợi ý |
| sfx_level_start.m4a | Bắt đầu level |
| sfx_squid.m4a | Mực phun mực |
| sfx_tank_complete.m4a | Hoàn thành một bể đích |
| sfx_win.m4a / sfx_lose.m4a | Thắng / thua (Out of Space! = thua) |
| sfx_backup_break.m4a | Kính Backup vỡ (thua) |
| sfx_popup_open.m4a / sfx_popup_close.m4a | Mở (Pause, Levels, Intro) / đóng pop-up; rèm màn thắng |
| sfx_play_on.m4a | Mở pop-up Play On |

## Đang là tiếng tổng hợp bằng code

`scatter`, `splash`, `land`, `complete`, `good`, `bad`. Có định nghĩa nhưng không bao giờ phát: `junk`, `plip`, `start` (lệnh gọi nằm trong comment), `ambient()` (tắt).
