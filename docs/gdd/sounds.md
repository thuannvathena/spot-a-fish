# Sounds / Âm thanh

**Trạng thái (18/11):** tất cả âm đều là file ghi âm trong `public/sfx/` (39 file `.m4a`: 38 hiệu ứng và nhạc nền `bgm_ap`), phát qua WebAudio. Âm nào không có file thì **không phát** (đã bỏ hết tiếng tổng hợp bằng code). Tên âm trong code là khoá của `SFX_MAP` ở đầu `game/src/main.js`; file gốc của âm thanh nằm ở `Added Assets/Sound/`.

## Bảng âm: khi nào phát

| Âm (khoá trong code) | File | Khi nào phát |
|---|---|---|
| Nhạc nền | `bgm_ap` | Chạy lại từ đầu mỗi level, nhỏ đi một nửa khi có pop-up, tắt dần khi hiện màn thắng / thua |
| Nút (`ui`) | `ui_button_click` | Mọi nút bấm |
| Bấm đúng cá (`ftap`) | `sfx_fish_tap` | Bấm trúng cá cần tìm |
| Combo (`combo`) | `sfx_combo_word_1..4` | Từ cá thứ 2 trong chuỗi: bước 1, 2, 3, 4 rồi giữ bước 4 đến khi gãy combo; chữ khen hiện đúng chỗ cá vừa bấm. Tiếng quá nhỏ nên được nâng âm lượng lên 3,6 lần |
| Cá vào bể đích (`totank`) | `sfx_fish_to_tank_or_vice_versa` | Cá bay vào bể đích hoặc được rút từ Backup |
| Bấm sai (`tobackup`, `bad`) | `sfx_bad` | Cá sai hoặc vật cản đáp xuống Backup |
| Bấm vào nước (`miss`, `tapwater`) | `sfx_tap_water` | Bấm chỗ trống; ống bắt đầu rung |
| Ống (`pipeopen`, `pipeclose`) | `sfx_pipe_open`, `sfx_pipe_close` | Ống sắp thả cá / thả xong hoặc tạm giữ |
| Ống thả cá (`spawn`) | `sfx_fish_spawn` | Mỗi con cá ra khỏi ống (âm lượng 0,7) |
| Nước bắn (`splash`) | `sfx_splash` | Cá nhảy ra khỏi mặt nước, cá rơi lại sau màn thắng, thả đá, ngọc trai chạm nước; nhiều tiếng cùng lúc gộp thành một (cách nhau ít nhất 0,16 giây) |
| Sò (`clamsnap`, `clamtap`) | `sfx_clam_snap`, `sfx_clam_tap_open` | Sò đớp cá; mỗi lần bấm sò và lúc sò mở |
| Ngọc trai (`pearl`) | `sfx_pearl_bounce` | Mỗi lần ngọc trai nảy |
| Mực phun (`squid`) | `sfx_squid` | Bạch tuộc phun mực |
| Bể đích xong (`tankdone`) | `sfx_tank_complete` | Một bể đích đầy và bay lên thanh tiến độ |
| Thanh tiến độ (`gaugehit`, `gaugefill`) | `sfx_bubble_hit_gauge`, `sfx_gauge_fill` | Bóng bay trúng thanh; thanh dâng lên |
| Gợi ý (`hint`) | `sfx_hint` | Bấm Hint |
| Bắt đầu level (`levelstart`) | `sfx_level_start` | Level mở ra |
| Thắng (`win`) | `sfx_win` | Chữ LEVEL COMPLETE hiện |
| Xoáy thắng (`swirl`) | `sfx_win_swirl` | Cá bắt đầu bơi xoắn lên lúc thắng (khoảng 1,1 giây); bị cắt khi người chơi chạm để tua nhanh |
| Bong bóng thắng (`winpop`) | `sfx_win_bubble_pop` | Bong bóng thắng vỡ; cũng dùng khi hiện pop-up tính năng mới (âm lượng 0,75) |
| Rèm (`curtainclose`, `curtainopen`) | `sfx_curtain_close`, `sfx_curtain_open` | Rèm đóng sau màn thắng / rèm mở sang level mới |
| Thua (`lose`) | `sfx_lose` | Màn Level failed |
| Kính vỡ (`bbreak`) | `sfx_backup_break` | Kính Backup vỡ lúc thua |
| Pop-up (`popopen`, `popclose`) | `sfx_popup_open`, `sfx_popup_close` | Mở / đóng pop-up (Pause, Levels, giới thiệu tính năng) |
| Play on (`playon`) | `sfx_play_on` | Mở pop-up Out of space |
| Mua booster (`coinspend`) | `sfx_coin_spend_earn` | Trừ coin khi mua booster |
| Booster hiện ra (`bearn`) | `sfx_booster_earn` | Booster mới hiện ra giữa màn hình sau khi mua hoặc nhận; cũng phát với chữ UNLOCKED! |
| Booster bay (`bfly`) | `sfx_booster_fly` | Mỗi booster bay vào nút của nó |
| Coin bay (`cfly`, `lastcfly`) | `sfx_last_coin_fly`, `sfx_coin_fly` | Mỗi đồng coin chạm bộ đếm: các đồng đầu phát `sfx_last_coin_fly`, đồng cuối phát `sfx_coin_fly` (hai file đang được đổi chỗ để thử) |

Đã nạp nhưng không có chỗ nào phát: `sfx_fish_to_backup` (cá vào Backup dùng `sfx_bad`).

**Không có tiếng (cố ý hoặc chưa có file):** `scatter` (cá tản ra), `land`, `good`, `complete`, `junk`, `plip`, `start`; sự kiện bầy cá, conga, squabble, cá cắn thức ăn, sứa, tank bounty, đổi hình bể, camera.

---

# Reference (cho tôi tra cứu, bạn không cần đọc)

- Nguồn gốc: các file gốc (`.ogg`, `.wav`, `.mp3`) nằm ở `Added Assets/Sound/` (và `Newly Added/`), đổi sang `.m4a` rồi để ở `public/sfx/`. Tên file khác nhau một chút: `sfx_combo_world_*` ở thư mục gốc là `sfx_combo_word_*` trong game; `sfx_win_anim_swirl` là `sfx_win_swirl`; `sfx_last_coin_fly_v2` là `sfx_last_coin_fly`; `sfx_clam_tap:open` là `sfx_clam_tap_open`.
- Âm lượng và tốc độ phát từng âm: xem `SFX_MAP` (ví dụ `ui` 0,8; `spawn` 0,7; `swirl` chỉ một giọng một lúc).
- Thêm âm mới: thêm file `.m4a` vào `public/sfx/`, thêm tên vào `SAMPLES` và một dòng vào `SFX_MAP`, rồi gọi `Snd.play('<khoá>')` ở chỗ cần.
