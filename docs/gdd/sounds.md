# Sounds: what to find / Âm thanh cần kiếm

**Bạn chỉ cần làm theo bảng này. / You only need this table.**
Mỗi dòng là một âm thanh cần kiếm. Lưu file `.m4a` đặt tên theo cột "File name" rồi gửi tôi, tôi sẽ gắn vào game.
Pri: **A** = làm trước (nghe nhiều nhất), **B** = làm sau, **C** = tuỳ chọn.

| # | Pri | Tiếng Việt | English | File name | Khi nào phát |
|---|---|---|---|---|---|
| 1 | A | Chữ combo Nice / Great / Super / Wow | Combo words | `sfx_combo_word.m4a` | Bấm đúng cá liên tiếp |
| 1b | A | Nốt tăng dần mỗi cá vào bể trong chain (một nốt ngắn, có cao độ rõ: giọt nước, marimba, bong bóng; khoảng 0,2-0,3 giây, nốt C5) | Combo step note: tonal, short; I pitch it up the major scale | `sfx_combo_step.m4a` | Mỗi cá vào bể đích trong chain |
| 2 | A | Nắp ống mở | Pipe lid opens | `sfx_pipe_open.m4a` | Ống sắp thả cá |
| 3 | A | Nắp ống đóng | Pipe lid closes | `sfx_pipe_close.m4a` | Sau khi cá ra hết |
| 4 | A | Nước bắn | Water splash | `sfx_splash.m4a` | Cá nhảy ra khỏi mặt nước (bay lên bể đích, màn thắng), thả đá, thả ngọc trai, thả mồi, nước tràn lúc thua. Cá rơi xuống bể từ Backup dùng `sfx_fish_to_tank`; cá vào bể đích nhỏ và bể đích xong không còn tiếng splash |
| 5 | A | Bấm vào nước, cá tản ra | Tap on water, fish scatter | `sfx_tap_water.m4a` | Bấm chỗ trống; ống bắt đầu rung |
| 6 | A | Bấm trúng vật cản | Wrong / bad hit | `sfx_bad.m4a` | Chạm vật cản; nước tràn lúc thua |
| 7 | A | Bấm vào con sò | Clam tapped | `sfx_clam_tap.m4a` | Mỗi lần bấm (đang dùng click nút) |
| 8 | A | Sò đớp cá | Clam snaps shut | `sfx_clam_snap.m4a` | Cá cần tìm bơi gần sò |
| 9 | A | Sò mở ra thả cá | Clam freed | `sfx_clam_open.m4a` | Bấm đủ số lần |
| 10 | B | Hang bầy cá hiện ra | Swarm cave pops up | `sfx_swarm_cave.m4a` | Bắt đầu sự kiện bầy cá |
| 11 | B | Bầy cá bơi qua | Swarm passes | `sfx_swarm_pass.m4a` | Trong lúc bầy chạy (nhẹ) |
| 12 | B | Hai cá đánh nhau | Squabble clash | `sfx_squabble.m4a` | Sự kiện đánh nhau |
| 13 | B | Cá xếp hàng conga / khiêu vũ | Conga / waltz | `sfx_conga_waltz.m4a` | Hai sự kiện đó |
| 14 | B | Ngọc trai bị húc | Pearl bounce | `sfx_pearl_bounce.m4a` | Sự kiện ngọc trai |
| 15 | B | Cá chui vào nhà | Fish hide | `sfx_hide.m4a` | Sự kiện trốn |
| 16 | B | Tay thả mồi | Feeding hand and pellets | `sfx_feed.m4a` | Sự kiện cho ăn |
| 17 | B | Nhím / sứa bị bấm | Urchin / jelly tapped | `sfx_obstacle_tap.m4a` | Vật cản chạy vào Backup |
| 18 | B | Bắt được cá thưởng | Bounty fish caught | `sfx_bounty.m4a` | Cá bounty |
| 19 | B | Chữ LEVEL N / chữ khen hiện ra | Title / cheer pop | `sfx_title_pop.m4a` | Đầu level (đang là tiếng code) |
| 20 | B | Bóng bay vào thanh tiến độ | Gauge fill | `sfx_gauge.m4a` | Tank xong (đang là tiếng code) |
| 21 | B | Hoàn thành bước hướng dẫn | Tutorial step done | `sfx_tutorial_ok.m4a` | Xoay, zoom, nghiêng lần đầu (đang là tiếng code) |
| 22 | C | Banner hoàn thành / sao điểm | Result banner, stars | `sfx_result.m4a` | Màn kết quả |
| 23 | C | Xoay, zoom bể | Camera swish | `sfx_camera.m4a` | Lúc kéo (rất nhỏ) |
| 24 | C | Đổi hình bể | Tank shape change | `sfx_shape_change.m4a` | Mỗi 10 level |
| 25 | C | Nền nước, bong bóng | Water ambience loop | `sfx_ambience.m4a` | Dưới nhạc nền (rất nhỏ) |

**Đã chốt, không cần kiếm:** chạm booster khoá dùng `ui_button_click`; Clear Tank, Clear Backup và bộ đếm combo x3/x4 không cần; cá chui ra từ ống dùng `sfx_fish_spawn`; mở/đóng Pause, Levels, Play On đã có tiếng.

**Đã gắn xong (đã kiểm tra khi chạy):** chạm ô booster khoá phát `ui_button_click` (không dùng được booster); pop-up New Feature và pop-up hướng dẫn booster mở phát `popopen`, đóng phát `popclose`.

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
