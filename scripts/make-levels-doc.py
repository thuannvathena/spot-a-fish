"""Rewrites the level section (L.2) of docs/gdd/levels.md from game/src/levels.json and the bot win rates (game/tools/wr-sim.mjs --json <file>).
Usage: python3 scripts/make-levels-doc.py <wr.json>"""
import json, sys, csv, collections
L = json.load(open('game/src/levels.json'))[:60]; wr = {r['L']: r for r in json.load(open(sys.argv[1]))}
tw = {}
for r in csv.reader(open('Level-related/Spot-A-Fish - Level System (filled).csv', encoding='utf8')):
    if r and r[1].isdigit(): tw[int(r[1])] = r[4]
T = [sum(l['tanks']) for l in L]; secs = [t * 5 for t in T]; tot = round(sum(secs) / 60); bot = round(sum(r['time'] for r in wr.values()) / 60)
def tanks(t): c = collections.Counter(t); return '+'.join(f'{c[k]}×{k}' for k in (1, 2, 3) if c[k])
NOTE = {1: 'Tutorial', 3: 'Backup Slot', 4: 'Booster 1: Hint', 7: 'Booster 2: Tank Clear', 9: 'Booster 3: Backup Clear', 11: 'Feature 1: Squid', 16: 'Pump', 21: 'Feature 2: Shell', 31: 'Feature 3: Fish Swarm', 25: 'First bounty'}
rows = []
for i, l in enumerate(L, 1):
    t = l['tanks']; pump = l['tube']['enabled']; w = len(l['tube']['waves']) if pump else 0
    rows.append(f"| {i} | {l['difficulty']} | {tanks(t)} | {T[i-1]} | {l['startFish']} | {l['maxFish']} | " + (f"{w} / {l['tube']['extraFish']}" if pump else '–') + f" | {len(l['fishKeys']) + l['look']} | {l['decoyFish']} | {l['look']} | {l['urchin']} / {l['jelly']} | {l['squid']} / {l['clam']} / {int(bool(l['swarm']))} | {', '.join(l['bounty']) or '–'} | {wr[i]['sim']:.0f}% | {tw.get(i, '')} | {secs[i-1]} | {NOTE.get(i, '')} |")
head = "| L | Diff | Tanks (fish each) | To catch | Start fish | Total fish | Pipe (waves / fish) | Species (+ colour copies) | Wrong fish | Look-alikes | Urchin / jelly | Squid / clam / swarm | Bounty | Bot WR | Old target WR | Time (s) | New in this level |\n|" + "---|" * 17
text = f"""## L.2 Level table <Badge type="tip" text="Live" />

60 levels on one smooth ramp, made by `scripts/plan-levels.py --apply` (it writes `game/src/levels.json`; `scripts/make-levels-doc.py` writes this table). About {tot} minutes in total at 5 s per fish to catch. The Hard and Very Hard levels are the long ones (up to {max(secs)} s); the Easy levels between them are shorter, so long levels do not come one after another. The bot counts {bot} minutes because it also waits for the pipe and the swarm.

- **Unlocks:** Backup L3 (the first wrong fish come in the same level), Hint L4, Clear Tank L7, Clear Backup L9, squid L11, pipe L16, clam (shell) L21, swarm L31. Each unlock shows its pop-up in that level, and the pop-ups wait until the UI and the lids of the target tanks have finished.
- **Fish in the tank at once** (`startFish`) climbs from {L[0]['startFish']} (L1) to 40 (L59-60); the cap is 40 in the tank at once (`FISH_CAP`). The total of a level (`maxFish`) can be above 40 because the pipe pumps fish in later. A Hard level is 2 fish above the trend, the level after it goes back.
- **Wrong fish:** 6 in L1-4 and 7 from L5: the Backup holds 7, so L5 is the first level that can be lost (in L1-2 there is no Backup yet, so a wrong tap only makes the fish dart off). After that they are about 40-50% of the fish, and the crowd, not the length of the level, makes late levels hard. Every level keeps at least 6 fish over once every tank is full, so the win animation always has fish to play with. Two wrong fish of the same species never look alike: each copy after the first has its colours turned a little.
- **Colour noise:** none in L1-10 (the wrong fish come from other colour families than the targets). Colour copies of a target start in L11 (1), then 2 from L21, 3 from L31 and 4 from L46. Species the same colour family as a target also start in L11.
- **Fish to catch** grow from 4 (L1) to about {max(T)} at the longest levels. **Fish per tank** go from 1 (L1-7) to a mix of 1 and 2 (from L8) and 3 (from L18).
- **Pipe:** from L16. Each wave holds back the last fish of 1 target species (2 on Hard / Very Hard). On Hard and Very Hard levels the last wave comes when one tank is left, so the end of the level is a choke point. The pipe tells the player: two tanks before a wave its mouth glows, one tank before it glows more, bubbles rise and it shivers now and then, then it rumbles and opens. Levels 5, 10 and 15 have no pipe: their choke point is only that the last tanks are searched among mostly wrong fish.
- **New fish are met a few at a time:** 4 species at L1, 9 by L3, 24 by L10, 34 by L20, 41 by L30 and all 49 by L45 (the whale, the shark and the sea horse are wrong fish only). A level uses at most 30 species including colour copies.
- **Fish look and speed:** every fish is size 1.4 and speed 0.85 (bounty fish excepted).
- **Bounty tanks** (tiny / camo / fast, 1 fish each) only from L25: L25 tiny, L35 camo, L45 fast, L55 tiny + camo, L60 fast + camo.
- **Urchin and jelly:** first urchin in L8, first jellyfish in L10; none in a level that introduces a feature.
- **Themes and tank shapes:** 6 themes and 6 tank shapes (cylinder, bowl, rounded box, hexagon, flower, heart), 10 levels each.
- **Win rate:** the bot (`node game/tools/wr-sim.mjs`) plays each level thousands of times with a model of a player and reports the first-try win rate (no boosters, no Play On). It is a guess until real players are measured: it says about 100% up to L30 and about 69% at L60. The target win rates of the old design sheet are NOT met for about 30 levels: the ramp has far fewer fish in the middle levels. `game/tools/wr-tune-plan.mjs` can nudge colour copies, urchins and jellyfish towards those targets but it cannot close the gap.
- **Lose position:** the bot reports where in the level a lost run ended (`lossAt`, `lateShare` in `--json`); in the Hard levels it does not lose late, so the choke point at the end is not confirmed by the bot.

{head}
""" + '\n'.join(rows) + "\n"
s = open('docs/gdd/levels.md').read()
a = s.index('## L.2 Level table'); b = s.index('## L.3 Not decided yet')
s = s[:a] + text + '\n' + s[b:]
s = s.replace("- **L1 cannot be lost.** L2 introduces Backup.", "- **L1-4 cannot be lost:** they hold 6 wrong fish and the Backup holds 7. L3 is where the Backup itself appears; L5 is the first level that can be lost.")
open('docs/gdd/levels.md', 'w').write(s); print(tot, bot, max(secs))
