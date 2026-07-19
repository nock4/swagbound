# Swagbound — Emotional Spine: Findings & Fix Plan

_2026-07-18. Produced from two research passes run blind to each other: an internal
beat-by-beat diagnosis of all 27 canonical arc beats, and a comparative craft teardown
of EarthBound, Mother 3, Undertale, Omori, Disco Elysium, Night in the Woods, and
Kentucky Route Zero. They converged on the same core finding, which is why it's trusted._

---

## The finding, in one sentence

**You start the story after the friendship is already lost, and you never once show it
intact — so every emotional peak asks the player to grieve a bond they were only told
about.**

The game's real engine is not Bosch vs Milady. It is **MiFella's guilt.** Every beat that
carries voltage is a MiFella beat. Bosch is the camera pointed at MiFella; Milady is the
essay MiFella's guilt is printed on. All four of the problems you named are symptoms of
that one displacement.

---

## What is already working (protect these)

- **Beat 19, the "Strawberry" whisper** (museum-frank): the only 5/5 in the game. A
  specific, humble, physical memory — MiFella ate cake off the floor to make Bosch laugh —
  defeats a perfect copy. This is the model for the whole game. Everything Swagbound wants
  to say, it says _dramatically_ exactly once, here.
- **The MiFella heartbeat**: beats 5, 8, 16, 21, 25 are all 4/5 and all MiFella. The arc
  has a pulse; it's his.
- **The Bosch Derivative** (beat 5) and **"Let us finish MiFella for you"** (beat 20) are
  the two best villain moments — a thing wearing your face that fails a love-test, and an
  intent aimed at someone you love.
- **Mechanic-as-theme** beats (pray-don't-hit-the-chorus; recognition-breaks-the-crowd)
  are good instincts.

---

## The four problems, located in your actual beats

### 1. Bosch feels empty — he's a camera
He has a _situation_ (the Swag Deck won't edit, so he notices), one _trait_ (he stops to
fix the crooked family picture — the best characterization in the script, and it's tiny),
and a _want_ spoken exactly once at the Act 1 button (beat 8: "Tell them the first picture
was wrong. Come with us."). He has **no wound** — no loss, fear, or flaw shown, only
described. Root cause: no present-tense relationship is ever dramatized, so his want lives
entirely inside other people's beats.

_Also: beat 8 gives Bosch a spoken "BOSCH:" line, which breaks the silent-protagonist
rule the rest of the design holds. Pick one and be consistent._

### 2. No warm beats — warmth is 100% retrospective
Every warm thing in the game is _reported_, never played: the cake, the fallen corner, the
crooked picture. There is **not one scene of Bosch and MiFella simply being friends.** The
only lightness that happens on-screen is beat 14 (a child laughs at the wrong slogan). The
friendship the whole arc grieves was never shown to exist.

### 3. Villain isn't scary — you honored "faceless" so completely the finale is a debate with weather
The script literally defines the antagonist as "not a person... a habit with
infrastructure" (beat 21) and has it announce "I am the agreement" (beat 26). The threat
that actually lands is _always_ MiFella-as-betrayer or the copy-with-your-face — never
Milady-as-concept. Your strongest villain vector, the Bosch Derivative, appears once (beat
5) and is abandoned.

### 4. Scenes feel flat — your dead scenes are almost all act-openings and gates
Every act begins by explaining itself instead of dropping you into a moment. And the
"someone is recognized and breaks the synchronized chorus" turn is the _same turn_ six
times (beats 13, 14, 23, 24, 25, 26); it's dramatically exhausted by Act 4.

**The 5 worst dead scenes to rewrite first:**
1. `north-route-gate-warning` (#4) — a two-sentence verbatim reprise of #3. Cut or fold.
2. `deadletter-arrival` (#17) — Act 3 opens on a triple info-dump, no person on screen.
3. `endgame-return` (#22) — Act 4 opens by narrating its own quest structure.
4. `relay-gate-returnless-king` (#3) — flat bureaucratic obstacle; Bosch "refuses" off-screen.
5. `postwick-arrival` (#9, tied with recruit-cloak #10) — arrival exposition + recruit function; Act 2 opens without a scene.

---

## The fix plan (prioritized by leverage)

### TIER 1 — The keystone: stage the cake night _(fixes all four problems at once)_
Write a **present-tense, playable cold-open vignette of Bosch and MiFella as friends,
before the photograph.** The ruined birthday cake; MiFella eating the fallen corner to
make Bosch laugh; the strawberry; the crooked picture; trading cards; a good song on.
Warm, low-stakes, a few minutes, then the photograph is taken and the world tilts.

Why it's the keystone (both research tracks named it independently):
- Gives Bosch a **wound** — the player _loses_ something they held, instead of hearing about it.
- Gives Milady something **concrete to corrupt.**
- Converts four existing "peaks" (beats 8, 16, 19, 21) from clever concepts into _earned
  payoffs_ — "Strawberry" detonates because the player was at the cake.
- Creates the game's first genuine warm beat, which becomes the ammunition for the dread.

### TIER 2 — Build the warm world, then corrupt the exact same spots
- One authoring pass making LSW / signal-town **genuinely warm on first visit** — hangout
  lines with no plot function, an arcade high-score rivalry, a "remember when."
- Reserve **one mixtape track as the LSW theme**; place it only in warm/home contexts;
  distort or silence it later. (You have the music layer + Track Lab; this is placement.)
- **Revisit those exact NPCs corrected** in later acts — same people, subtly wrong lines,
  MiFella's spot empty. This is your dread engine, and it's cheap: flag-gated dialogue/tile
  swaps on revisit. The player, via the Swag Deck, becomes the _detector_ — dread you
  participate in.

### TIER 3 — Make Bosch's interior visible without breaking his silence
- **The Swag Deck is Bosch's soul.** Act-evolving inspect text on the one un-editable
  object: Act 1 "Your cards. Nobody else's." → Act 3 "One card is bent at the corner, the
  way MiFella used to bend them." Delivers want + wound with zero dialogue.
- **Want/wound voiced by others**, EarthBound-style, in barks — never by Bosch: a
  neighbor, "You and MiFella were always trading those. Haven't seen him around"; "You keep
  checking your deck like something's gonna be missing."
- **Call-home on the town phone**: one LSW contact returning a wordless comfort line + a
  small heal + the LSW theme; it gets _harder_ to reach as the corrections deepen
  (homesickness turned into rising dread).
- **Resolve the silence rule**: convert beat 8's spoken line to a silent-nod / withheld
  beat, or commit to Bosch speaking everywhere. Not both.

### TIER 4 — Give the faceless villain a body
- **Recur the Bosch Derivative** — your best villain vector, used once. One per act, each a
  more-overwritten copy.
- **MiFella = your Pokey.** Milady stays faceless machinery; MiFella is the face that
  speaks for it. One MiFella encounter per act, each more overwritten. (You already have
  the betrayal→accountability arc — lean all the way in.)
- **Records-on-YOU**: menu/save/phone hooks where the record-machine relabels a party
  member's name to "Subject 4," lists Bosch as a duplicate on the save screen, or reads
  your playtime back in a registry voice. Omnipresence for near-zero content cost.
- **Make Milady's pitch seductive**: voice the four fuels (anonymity / network-state /
  psy-ops / financial-nihilism) as genuinely tempting offers, through MiFella. A villain is
  scary when its case sounds _good_.

### TIER 5 — Make scenes turn; kill the monotony
- **Rewrite the 5 dead act-openings/gates** above. Open each act on a _person in a moment_,
  not an explanation. Bury exposition inside a verb (walk a corrected street; file a card
  and watch it come back wrong).
- **Retire the "recognition breaks the chorus" turn** after its 2nd–3rd use. For Act 4,
  find a new turn: **complicity** — force the player to use a Milady system to win, then
  show the cost. The scene turns from victory to complicity.
- **Add a dark-night-before-dawn.** Act 4 currently ramps upward unbroken; Bosch never
  loses, never bottoms out. Give him a real low before the finale.
- **Cut the mixtape to silence** for the first time all game at the finale's turn. After
  placing music so generously, the one _absence_ will hit harder than any track.

---

## Also worth doing
There is no written story bible — the Obsidian vault holds Milady _research_ clippings, and
the content JSON _is_ the spine. Consider a one-page emotional-spine bible (Bosch's
want/wound, MiFella's arc, the warm-world→corruption engine) so future scenes get specced
against it. This document can seed it.

---

## Recommended first move
Build **Tier 1, the cake-night cold open.** It's the keystone; everything else compounds
off it. It can ship as a short playable LSW-morning vignette (a warm interactive beat + a
light cutscene) wired ahead of the existing `signal-town-cold-signal-open`, then
pixel-verified like any other opening beat.

---

## Staging: how non-playable moments carry this (NOT via dialogue)

The trap in everything above is that it becomes more text boxes. "MiFella eats the fallen
corner" as a *narration line* is the exact retrospective-telling the diagnosis condemns.
Emotion has to be **staged**, not captioned. Silent film had no dialogue and broke hearts;
the tools are **blocking, camera, music, color, timing, props, player action, and silence.**

**The principle — a channel budget per beat.** For each emotional beat, name the
non-dialogue channel that carries it and treat a dialogue line as a last resort. If a
beat's only channel is a text box, it isn't staged, it's narrated.

**Engine support (shipped 2026-07-18).** The cutscene runner previously had only
`dialogue`, `faceActor`, `moveActor`, `show/hideActor`, `wait`, `sound`, `warp` — so
scenes could only talk. Three non-verbal ops were added (schema in `eb-schemas`, dispatch
in `cutsceneRunner.ts`, host in `chunkedWorldScene.ts`; unit-tested + pixel-verified):

- `music` — cue a mixtape track (`play`, with `cue` + `fadeMs`) or cut to silence (`stop`,
  with `fadeMs`). The mixtape can finally be driven from a scene.
- `camera` — `focus`/`pan` to a world point or actor (optional `zoom`), `follow` to restore
  the player, `shake` (`intensity`, `ms`). The eye can move.
- `fx` — `fadeOut`/`fadeIn`/`flash` (camera post-effects, `color`/`ms`) and a persistent
  `tint`/`clearTint` (canvas-safe baked-image overlay, `color`/`alpha`/`ms`). Light and
  color as emotion.

All three are fire-and-forget; hold on them with `wait`. A staged cutscene auto-restores
the camera to the player and clears its tint/music override on completion, so a scene never
strands on black or off-player. AUTHORING RULE: end a fade/tint cutscene on a *visible*
frame (fade back in before the final `wait`).

**The cake night, budgeted by channel (dialogue in the minority):**

| Beat | Carried by | Op(s) | Dialogue? |
|---|---|---|---|
| Cold open on black; warm track fades up | music | `music play` (LSW theme) + `wait` | - |
| Fade to a golden-hour LSW kitchen | color + light | `fx fadeIn`, `fx tint #ffb020` | - |
| MiFella bursts in, a little hop | blocking | `moveActor` (fast) + `faceActor` | - |
| Push in on the lopsided cake | camera | `camera focus`/`pan` + `zoom` on the cake prop | - |
| Cake→Bosch→cake (comic beat) | blocking + timing | `faceActor` x3 + `wait` | - |
| A corner drops; MiFella crosses, crouches, it's gone | blocking + prop | `moveActor` + `hideActor` (the corner) | - |
| Bosch hop-laughs; one sting | blocking + sfx | `moveActor` (hop) + `sound` | - |
| The one seed line | dialogue | `dialogue` | *"Strawberry. You hate the frosting."* |
| Player straightens the crooked picture | player action | (release control ~3s; interact) | - |
| Shutter click; white FLASH; music cuts | fx + music + sfx | `sound` + `fx flash #ffffff` + `music stop` | - |
| Hold on white; fade to the cold present | color | `fx tint` drains warm→cold, `fx fadeIn` | - |

That is ~one spoken line for a scene that today would be six narration boxes. "MiFella
eats the corner" becomes a thing you *watch* and then *do*; the photograph — the inciting
evil of the whole game — lands as a white flash and a sudden silence, not a sentence.

The same three ops upgrade the rest of the plan: the corrupted-revisit (color drains on
screen), the villain's body (`fx` glitch/`camera shake` on the Derivative), records-on-you,
and the finale's first-ever cut to silence (`music stop`).
