# Tutorial ROM Video Verification

## Status

Partial overall, with one successful narrowed exact-NPC proof. The local
compiled hack boots in Snes9x, and real in-emulator videos show imported
CoilSnake dialogue `Hello World!` running inside EarthBound.

An adversarial review found that the previous "exact NPC `744`" claim was too
strong because `map_doors.yml` still contained broad object text routing to
`robot.hello_world`. That ambiguity has now been removed in the ignored local
fixture.

Update: a new Snes9x proof clip now demonstrates imported dialogue from a
narrowed local-only NPC `744` fixture in the bedroom scene. This is not proof of
the original roadblock placement or original tutorial NPC coordinates. It is
proof that, under a fixture with exactly one NPC `744` placement and exactly one
`robot.hello_world` NPC-table pointer, interacting with that NPC in Snes9x opens
the imported `Hello World!` dialogue.

2026-06-01 follow-up: the runtime-proven-slot substitution plan is still not
enough for a defensible exact-NPC proof. A separate local `map_sprites.yml`
copy confirmed the original roadblock slots as:

- NPC `706`: outer `27`, inner `29`, `X: 192`, `Y: 216`
- NPC `707`: outer `27`, inner `31`, `X: 168`, `Y: 200`

Testing single-slot-only substitutions was misleading because the surrounding
map-sprite table had been removed during earlier diagnostics. Restoring the
full local map-sprite table, replacing only NPC `706` with NPC `744`, and
removing the original NPC `744` placement correctly brings the roadblock NPC
cluster back on screen. However, Snes9x interactions still resolve to stock
roadblock/shack text rather than `@Hello World!`, even after neighboring NPC
text pointers `707`, `1125`, and `1126` are neutralized locally. This suggests
the remaining blocker is not the generated script import or the high-level
NPC-text invariant; it is still runtime target binding/state around the
roadblock area.

## Proven Evidence

- Compiled local ROM output exists at `.codex/rom-output/first-hack.sfc`.
- Snes9x boots the compiled output and reaches EarthBound title/attract screens.
- ares boots the compiled output and reaches EarthBound title/attract screens.
- `external/coilsnake-project/ccscript/robot.ccs` defines:
  - `hello_world:`
  - `"@Hello World!" end`
- `external/coilsnake-project/npc_config_table.yml` entry `744` contains:
  - `Sprite: 171`
  - `Movement: 8`
  - `Show Sprite: always`
  - `Text Pointer 1: robot.hello_world`
  - `Type: person`
- `external/coilsnake-project/map_sprites.yml` currently places NPC `744` at:
  - outer map sprite group `4`
  - inner group `31`
  - `X: 64` in the current proof-only fixture
  - `Y: 64` in the current proof-only fixture
- `external/coilsnake-project/map_doors.yml` currently has no
  `Text Pointer: robot.hello_world` object references.
- `external/coilsnake-project/map_doors.yml` currently has all map-door text
  pointers neutralized to `$0` in the proof-only fixture. This is broad local
  interference removal, not broad routing: no object can display
  `robot.hello_world`.
- The successful proof route uses a local-only bedroom fixture, not the
  unresolved roadblock placement.

## Video Artifacts

- `.codex/videos/earthbound-first-hack-snes9x.mov`
  - Real Snes9x capture.
  - Shows the compiled hack booting to title/attract screens.
- `.codex/videos/earthbound-first-hack-snes9x-contact.png`
  - Contact sheet for the Snes9x capture.
- `.codex/videos/earthbound-first-hack-ares-boot.mov`
  - Real ares capture.
  - Shows the compiled hack booting to title/attract screens.
- `.codex/videos/earthbound-first-hack-ares-boot-contact.png`
  - Contact sheet for the ares capture.
- `.codex/videos/earthbound-first-hack-proof-route.mov`
  - Real Snes9x capture of an attempted local proof route.
  - Does not satisfy final proof: the automation remained in setup/name entry and
    did not reach imported dialogue.
- `.codex/videos/earthbound-first-hack-proof-route-contact.png`
  - Contact sheet proving the proof-route attempt did not complete.
- `.codex/videos/earthbound-first-hack-imported-dialogue-proof.mov`
  - Real Snes9x capture of the latest attempted short proof.
  - Does not satisfy final proof: it remained in title/attract playback and did
    not reach file select or imported dialogue.
- `.codex/videos/earthbound-first-hack-imported-dialogue-proof-contact.png`
  - Contact sheet for the latest failed short proof attempt.
- `.codex/videos/earthbound-first-hack-hello-world-proof.mov`
  - Real Snes9x capture of a later attempted proof.
  - Does not satisfy final proof: the run stalled before imported dialogue.
- `.codex/videos/earthbound-first-hack-hello-world-proof-contact.png`
  - Contact sheet for that failed proof attempt.
- `.codex/videos/earthbound-first-hack-bedroom-to-hello-world.mov`
  - Real Snes9x capture of a short bedroom/object proof attempt.
  - Does not satisfy final proof: the capture shows the normal
    `*No problem here.` response instead of imported dialogue.
- `.codex/videos/earthbound-first-hack-bedroom-to-hello-world-contact.png`
  - Contact sheet for that failed bedroom/object attempt.
- `.codex/videos/earthbound-first-hack-clean-route-hello-world.mov`
  - Real Snes9x capture started after an observed clean bedroom state.
  - Does not satisfy final proof: the capture still shows the normal
    `*No problem here.` response.
- `.codex/videos/earthbound-first-hack-clean-route-hello-world-contact.png`
  - Contact sheet for that failed clean-route attempt.
- `.codex/videos/earthbound-first-hack-clean-route-hello-world-2.mov`
  - Second clean-route Snes9x capture.
  - Does not satisfy final proof: the capture again shows the normal
    `*No problem here.` response.
- `.codex/videos/earthbound-first-hack-clean-route-hello-world-2-contact.png`
  - Contact sheet for the second failed clean-route attempt.
- `.codex/videos/earthbound-first-hack-imported-dialogue-success.mov`
  - Real Snes9x capture after broad local-only person NPC proof wiring.
  - Shows `@Hello World!` in the first sampled frame, then a later stock message
    after input advanced to an object check. Kept as an imperfect proof attempt.
- `.codex/videos/earthbound-first-hack-imported-dialogue-success-contact.png`
  - Contact sheet for the imperfect success attempt.
- `.codex/videos/earthbound-first-hack-imported-dialogue-success-clean.mov`
  - Real Snes9x capture with imported `@Hello World!` left visible for the whole
    clip.
  - This was the earlier primary imported-dialogue proof video before the
    successful narrowed bedroom NPC `744` proof.
- `.codex/videos/earthbound-first-hack-imported-dialogue-success-clean-contact.png`
  - Contact sheet for the primary proof video. Every sampled frame shows
    `@Hello World!`.
- `.codex/videos/earthbound-first-hack-exact-npc744-hello-world.mov`
  - Real Snes9x capture after narrowing the NPC table to NPC `744` only.
  - Does not satisfy final proof by itself: the first interaction hit an
    adjacent stock NPC and displayed stock roadblock dialogue.
- `.codex/videos/earthbound-first-hack-exact-npc744-hello-world-contact.png`
  - Contact sheet for the adjacent-stock-NPC attempt.
- `.codex/videos/earthbound-first-hack-exact-npc744-hello-world-clean.mov`
  - Real Snes9x capture from the earlier exact-NPC attempt.
  - Shows imported `@Hello World!` left visible for the whole clip.
  - Does not satisfy final proof by itself because later adversarial review
    found broad object text routing in `map_doors.yml` at the time it was
    recorded.
- `.codex/videos/earthbound-first-hack-exact-npc744-hello-world-clean-contact.png`
  - Contact sheet for the ambiguous exact-NPC attempt. Every sampled frame shows
    `@Hello World!`, but target attribution is not proven.
- `.codex/videos/earthbound-first-hack-npc744-current-fixture-attempt.mov`
  - Real Snes9x capture under the current narrowed fixture.
  - Does not satisfy final proof: Ness starts near the visible roadblock marker,
    but Talk returns `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-current-fixture-attempt-contact.png`
  - Contact sheet for that failed narrowed-fixture attempt.
- `.codex/videos/earthbound-first-hack-npc744-current-fixture-reposition-attempt.mov`
  - Real Snes9x capture after repositioning around the same `28/29` placement.
  - Does not satisfy final proof: Talk still returns
    `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-current-fixture-reposition-attempt-contact.png`
  - Contact sheet for the failed repositioning attempt.
- `.codex/videos/earthbound-first-hack-npc744-static-x88-y240-proof-attempt.mov`
  - Real Snes9x capture after isolating NPC `744` at `X: 88`, `Y: 240` and
    freezing only NPC `744` movement.
  - Does not satisfy final proof: the visible marker is stationary and the
    fixture invariants are narrow, but Talk still returns
    `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-static-x88-y240-proof-attempt-contact.png`
  - Contact sheet for the failed static-marker attempt.
- `.codex/videos/earthbound-first-hack-npc744-slot706-behavior-proof.mov`
  - Real Snes9x capture after substituting NPC `744` into the runtime-proven
    roadblock `706` map-sprite slot at `X: 192`, `Y: 216`.
  - NPC `744` was also given the stock `706` behavior fields
    (`Direction: left`, `Event Flag: 0x24e`, `Movement: 606`,
    `Show Sprite: when event flag set`, `Sprite: 171`) while keeping
    `Text Pointer 1: robot.hello_world`.
  - Does not satisfy final proof: Talk still returns
    `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-slot706-behavior-proof-contact.png`
  - Contact sheet for the failed runtime-proven-slot diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-slot707-only-proof.mov`
  - Real Snes9x capture after substituting NPC `744` into the neighboring
    roadblock `707` map-sprite slot at `X: 168`, `Y: 200`, copying stock `707`
    behavior fields onto NPC `744`, and removing the competing `706` placement
    from the local proof fixture.
  - Does not satisfy final proof: the substituted marker is visible and the
    fixture invariants are narrow, but Talk still returns
    `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-slot707-only-proof-contact.png`
  - Contact sheet for the failed 707-only slot diagnostic.
- `.codex/videos/earthbound-first-hack-stock707-hello-world-control.mov`
  - Real Snes9x capture after restoring stock NPC `707` to its map-sprite slot
    and temporarily routing only NPC `707` to `robot.hello_world`.
  - Does not prove the control: the interaction still produced stock shack text,
    indicating the visible roadblock/shack interaction was not actually binding
    to the edited `707` text pointer.
- `.codex/videos/earthbound-first-hack-stock707-hello-world-control-contact.png`
  - Contact sheet for the failed stock-707 control attempt.
- `.codex/videos/earthbound-first-hack-npc744-slot1125-proof.mov`
  - Real Snes9x capture after substituting NPC `744` into the visibly loaded
    group `29` slot formerly occupied by NPC `1125` at `X: 88`, `Y: 56`, and
    copying stock `1125` behavior fields onto NPC `744` while preserving
    `Text Pointer 1: robot.hello_world`.
  - Does not satisfy final proof: Talk still produced stock shack text, so the
    visible interaction target in this roadblock/shack area is still not proven
    to be the edited NPC slot.
- `.codex/videos/earthbound-first-hack-npc744-slot1125-proof-contact.png`
  - Contact sheet for the failed loaded-slot diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-slot706-pure-substitution-proof.mov`
  - Real Snes9x capture after putting the only NPC `744` placement into the
    roadblock `706` coordinate at `X: 192`, `Y: 216` with narrow NPC `744`
    behavior fields.
  - Does not satisfy final proof: Talk returned `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-slot706-pure-substitution-proof-contact.png`
  - Contact sheet for the failed pure 706-slot substitution.
- `.codex/videos/earthbound-first-hack-npc744-slot707-pure-substitution-proof.mov`
  - Real Snes9x capture after moving the only NPC `744` placement to the
    neighboring roadblock `707` coordinate at `X: 168`, `Y: 200` with narrow
    NPC `744` behavior fields.
  - Does not satisfy final proof: Talk produced stock shack text instead of
    imported dialogue.
- `.codex/videos/earthbound-first-hack-npc744-slot707-pure-substitution-proof-contact.png`
  - Contact sheet for the failed pure 707-slot substitution.
- `.codex/videos/earthbound-first-hack-npc744-slot707-stock-behavior-proof.mov`
  - Real Snes9x capture after keeping the only NPC `744` placement in the
    stock `707` coordinate and copying stock `707` visible/talk behavior fields
    onto NPC `744`, while preserving `Text Pointer 1: robot.hello_world`.
  - Does not satisfy final proof: Talk still produced stock shack text.
- `.codex/videos/earthbound-first-hack-npc744-slot707-stock-behavior-proof-contact.png`
  - Contact sheet for the failed stock-707-behavior diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-shack-pointer-proof.mov`
  - Real Snes9x capture after neutralizing nearby suspected shack text pointers
    to `$0` while keeping zero object routing to `robot.hello_world`.
  - Does not satisfy final proof: the interaction surfaced another stock shack
    message, proving additional object/door text was still winning.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-shack-pointer-proof-contact.png`
  - Contact sheet for the first neutralized-pointer diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-shack-pointers-proof.mov`
  - Real Snes9x capture after also neutralizing local `$c9b11e` door pointers.
  - Does not satisfy final proof: the interaction still produced stock
    `big foot print` text, showing the earlier neutralization was in a nearby
    group rather than the active roadblock sprite group.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-shack-pointers-proof-contact.png`
  - Contact sheet for the second neutralized-pointer diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-actual-door-proof.mov`
  - Real Snes9x capture after identifying the actual active map-door group as
    `27/31` and neutralizing its nonzero door target `$c9ae59` to `$0`.
  - Does not satisfy final proof: no shack text appears, but the interaction
    still does not open imported dialogue.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-actual-door-proof-contact.png`
  - Contact sheet for the actual-door neutralization diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-actual-door-confirm-a.mov`
  - Real Snes9x capture confirming the alternate menu-confirm key after the
    actual door target was neutralized.
  - Does not satisfy final proof: the result is `*Who are you talking to?`.
- `.codex/videos/earthbound-first-hack-npc744-slot707-neutralized-actual-door-confirm-a-contact.png`
  - Contact sheet for the alternate-confirm diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-static-27-31-current-placement-proof.mov`
  - Real Snes9x capture after restoring NPC `744` to static proof config at
    `X: 168`, `Y: 200`.
  - Does not satisfy final proof: the scripted menu input did not produce a
    confirmed Talk result during the clip.
- `.codex/videos/earthbound-first-hack-npc744-static-27-31-current-placement-proof-contact.png`
  - Contact sheet for that static placement attempt.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-proof.mov`
  - Real Snes9x capture after moving NPC `744` to `X: 176`, `Y: 192` for a
    more reachable cardinal-adjacent placement.
  - Does not satisfy final proof: stock door text was still present at that
    point in the fixture.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-proof-contact.png`
  - Contact sheet for the failed `X: 176`, `Y: 192` placement attempt.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-neutralized-stock-pointers-confirm-proof.mov`
  - Real Snes9x capture after neutralizing the two known repeated stock shack
    pointers.
  - Does not satisfy final proof: the menu remained open and no imported
    dialogue appeared.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-neutralized-stock-pointers-confirm-proof-contact.png`
  - Contact sheet for that confirm attempt.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-neutralized-stock-pointers-confirm-d.mov`
  - Real Snes9x capture testing the `D`/X-button confirm path from the open
    menu.
  - Does not satisfy final proof: the menu remained open.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-neutralized-stock-pointers-confirm-d-contact.png`
  - Contact sheet for the `D` confirm diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-neutralized-stock-pointers-confirm-return.mov`
  - Real Snes9x capture testing the Return/select confirm path from the open
    menu.
  - Does not satisfy final proof: the menu remained open.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-neutralized-stock-pointers-confirm-return-contact.png`
  - Contact sheet for the Return confirm diagnostic.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-all-door-text-neutralized-proof.mov`
  - Real Snes9x capture after neutralizing all `map_doors.yml` text pointers to
    `$0` while keeping exactly one `robot.hello_world` source at NPC `744`.
  - Does not satisfy final proof: the scripted confirm did not complete during
    the recording, though stock object text no longer appeared.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-all-door-text-neutralized-proof-contact.png`
  - Contact sheet for the all-door-text-neutralized proof attempt.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-all-door-text-neutralized-confirm-v.mov`
  - Real Snes9x capture testing the `V`/A-button confirm path from the open
  menu after all door text was neutralized.
  - Does not satisfy final proof: the menu remained open.
- `.codex/videos/earthbound-first-hack-npc744-static-x176-y192-all-door-text-neutralized-confirm-v-contact.png`
  - Contact sheet for the `V` confirm diagnostic.
- `.codex/videos/npc744-bedroom-hello-world-proof.mov`
  - Real Snes9x capture under the current narrowed bedroom proof fixture.
  - Starts from boot/file select, loads the save, moves Ness to the local-only
    NPC `744` marker, opens the command menu, selects Talk, and leaves imported
    `Hello World!` dialogue visible.
  - Satisfies the exact local NPC `744` proof for the bedroom fixture, not the
    earlier roadblock/original-placement proof.
- `.codex/videos/npc744-bedroom-hello-world-proof-contact.png`
  - Contact sheet for the successful bedroom proof clip. The final sampled
    frames show imported `Hello World!` in Snes9x.
- `.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled.mov`
  - Real Snes9x capture under the current narrowed bedroom proof fixture.
  - Includes the macOS menu bar with Snes9x active, then shows boot/file select,
    the bedroom NPC `744` marker, Talk selection, and imported `Hello World!`
    dialogue.
  - This is the strongest current review artifact because the video frame itself
    shows Snes9x provenance.
- `.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled-contact.png`
  - Contact sheet for the Snes9x-labeled proof clip. Sampled frames show the
    Snes9x menu bar, the `first-hack` window, and the final imported
    `Hello World!` dialogue.

These artifacts are ignored local outputs and are not intended for git.

## Attempts Made

This section is historical. Phrases such as "current", "remains", or "latest"
inside the bullets describe the fixture state at the time of that attempt, not
the active fixture described in the Status, Proven Evidence, Result, and
Remaining Limitations sections above.

- Verified Snes9x can open `.codex/rom-output/first-hack.sfc`.
- Verified ares can open `.codex/rom-output/first-hack.sfc`.
- Configured local ares keyboard input bindings outside the repo:
  - arrows for movement
  - Return/Spacebar for Start/Select
  - C/V/X for SNES buttons
- Tested Snes9x key input through AppleScript and Computer Use.
- Tested ares key input through AppleScript and Computer Use.
- Tested an ignored local SRAM swap from an existing EarthBound save, then restored the local `.ram` from backup.
- Reached a real new-game state in Snes9x and moved the player from the house to
  the early Onett/Pokey-house road area.
- Confirmed held `Space` is required for reliable title/file-select entry in
  Snes9x.
- Created an ignored local proof build attempt that temporarily routed visible
  early NPCs to `robot.hello_world`; the broad local fixture mutation was
  restored afterward because the recording still did not reach dialogue.
- Created a tighter ignored local proof build:
  - `external/coilsnake-project/naming_skip.yml` has `Enable Skip: true`.
  - Early Onett event NPCs in the `719`-`746` range, when type `person`, are
    routed to `robot.hello_world`.
  - Non-empty object text pointers in `map_doors.yml` are routed to
    `robot.hello_world` so a short bedroom/object proof can avoid long manual
    routing.
- Confirmed Snes9x currently uses `a` as the effective menu confirm key for the
  local configuration. Earlier failed runs used `v`, which did not confirm text
  speed/sound/flavor menus.
- Created a broader ignored local proof build:
  - backed up `external/coilsnake-project/npc_config_table.yml` under
    `.codex/rom-output/backups/`.
  - set person NPC `Text Pointer 1` values to `robot.hello_world`.
  - recompiled the ignored local proof output to `.codex/rom-output/first-hack.sfc`.
  - opened that output in Snes9x and interacted with a visible person NPC near
    the early roadblock.
  - verified and recorded `@Hello World!` in the running emulator.
- Restored from the broad all-person proof wiring back to the narrower local
  proof fixture after recording:
  - NPC `744` remains configured with `Event Flag: 0x0`, `Sprite: 5`,
    `Movement: 605`, `Show Sprite: always`, and
    `Text Pointer 1: robot.hello_world`.
  - the route back to the exact `744` placement was attempted again, but the
    automation fell back into a bedroom `*No problem here.` object check before
    reaching the roadblock.
- Reached the roadblock area manually under the restored narrow fixture:
  - interacted with several visible roadblock/nearby NPCs.
  - confirmed some are stock NPCs and still display their original dialogue,
    including `Onett police are infamous...` and `I want to return home...`.
  - did not yet identify or record the exact `744` interaction.
- Attempted a single scripted reset-to-roadblock route after the manual roadblock
  pass; it failed early around the bedroom-door transition and did not reach the
  roadblock.
- Replaced the broad roadblock proof wiring with a narrow exact-NPC proof build:
  - restored `npc_config_table.yml` from
    `.codex/rom-output/backups/npc_config_table.pre-proof-broad.20260526112521.yml`.
  - changed the remaining non-744 `robot.hello_world` reference at NPC `724` to
    `$0`.
  - confirmed `rg` reports only one `Text Pointer 1: robot.hello_world` in the
    NPC table, at NPC `744`.
  - kept the ignored route-only all-door shortcut to destination `177,80`.
  - recompiled `.codex/rom-output/first-hack.sfc`.
  - reached the roadblock through the bedroom door shortcut.
  - interacted with an adjacent stock NPC first and confirmed it displayed stock
    text, proving the build was no longer broad-routed.
- Adversarial review blocked that proof claim because `map_doors.yml` still had
  broad `Text Pointer: robot.hello_world` object routing, so the visible
  `@Hello World!` could have come from a sign/object rather than NPC `744`.
- Restored `map_doors.yml` object text pointers from backup while preserving a
  route-only door destination shortcut.
- Confirmed the narrowed fixture now has:
  - zero `Text Pointer: robot.hello_world` object refs in `map_doors.yml`.
  - exactly one `Text Pointer 1: robot.hello_world` NPC ref in
    `npc_config_table.yml`, at NPC `744`.
- Added current proof-only placement changes to make the target reachable:
  - NPC `744` keeps the tutorial movement value `605` so the converter tutorial
    check remains green.
  - NPC `744` is currently placed once, at `X: 152`, `Y: 208` in map sprite
    group `28/29`.
  - nearby roadblock sprite subgroups and NPC config entries were narrowed
    locally to reduce stock NPC interception.
- Recompiled `.codex/rom-output/first-hack.sfc`.
- Continued Snes9x route/input testing, but no clean unambiguous final video has
  been recorded yet under the narrowed no-object-routing fixture.
- Backed up the ignored Snes9x RAM file and tested a clean-RAM boot path to avoid
  stale save-state behavior. The run reached title/attract flow but did not
  produce a clean final NPC `744` interaction recording in this pass.
- Moved the single NPC `744` placement into the visibly loaded neighboring map
  sprite subgroup after screenshot evidence showed the earlier subgroup was not
  in the active viewport.
- Tested a deeper `Y: 240` placement, but Snes9x stalled on a black transition
  after the door shortcut. The placement was restored to the last non-stalling
  visible coordinate, `X: 152`, `Y: 208`.
- Recorded two fresh Snes9x attempts under the narrowed fixture with zero object
  `robot.hello_world` refs, exactly one NPC text pointer, and exactly one NPC
  `744` placement. Both attempts reached the visible roadblock area, but Talk
  returned `*Who are you talking to?`, so exact NPC attribution remains
  unproven.
- Tested additional ignored local placement/landing adjustments after those
  failed attempts:
  - `X: 152`, `Y: 224` in group `28/29` compiled and reached the roadblock
    area, but interaction still hit stock shack text.
  - `X: 120`, `Y: 240` in group `28/29` compiled and produced a visible lower
    marker, but the route still needs a clean interaction capture.
  - route-only door shortcut destination `173,91` landed too far into the
    tree/cliff area.
  - route-only door shortcut destination `176,90` compiled, but the automated
    route attempt missed file-select timing and did not produce evidence.
- Froze only NPC `744` movement to `0` in the ignored local proof fixture after
  repeated failures showed that `Movement: 605` made cardinal alignment unstable.
- Recorded a static-marker proof attempt at `X: 88`, `Y: 240`; it still returned
  `*Who are you talking to?`.
- Restored the route-only shortcut to the known non-tree destination `179,90`
  and moved the single NPC `744` placement back to `X: 120`, `Y: 240` while
  keeping `Movement: 0`. A still-only final interaction check again returned
  `*Who are you talking to?`.
- Substituted NPC `744` into the known roadblock `706` map-sprite slot at
  `X: 192`, `Y: 216`; Talk still returned `*Who are you talking to?`.
- Substituted NPC `744` into the neighboring roadblock `707` slot at
  `X: 168`, `Y: 200`; the interaction bound to the remaining stock `706` NPC
  and showed stock text instead of the imported script.
- Applied the next diagnostic by putting NPC `744` back in the `706` slot and
  copying the stock `706` behavior fields onto NPC `744` while preserving the
  imported text pointer. This still returned `*Who are you talking to?`.
- Applied a 707-only diagnostic by putting NPC `744` in the stock `707` slot,
  copying stock `707` behavior fields onto NPC `744`, and removing the
  competing `706` placement. This still returned
  `*Who are you talking to?`.
- Ran a stock-707 text-pointer control by restoring NPC `707` and routing only
  `707` to `robot.hello_world`; the interaction still produced stock shack
  text, indicating the visible interaction was not binding to that edited slot.
- Identified visibly loaded group `29` NPCs `1125` and `1126` near the
  roadblock/shack area. Substituted NPC `744` into the `1125` slot and copied
  stock `1125` behavior fields onto NPC `744`; the interaction still produced
  stock shack text.
- Re-ran the requested pure runtime-slot substitutions:
  - NPC `744` at the former `706` coordinate, `X: 192`, `Y: 216`, returned
    `*Who are you talking to?`.
  - NPC `744` at the former `707` coordinate, `X: 168`, `Y: 200`, produced
    stock shack text.
- Copied stock `707` visible/talk behavior fields onto NPC `744` at the
  `X: 168`, `Y: 200` coordinate while preserving only the imported text
  pointer. The interaction still produced stock shack text.
- Searched the local text/YML fixture for the literal stock shack dialogue; it
  is not present as searchable extracted text, so the winning target remains a
  stock address in `map_doors.yml` or another table rather than a CCScript label.
- Corrected the active group mapping: the current NPC `744` placement is in
  `map_sprites.yml` outer group `27`, inner group `31`, not outer group `31`.
- Identified and neutralized the actual active group `27/31` nonzero door
  target `$c9ae59` to `$0` in the ignored proof fixture.
- Confirmed with a focused Snes9x clip that after the active door target is
  neutralized, the same interaction no longer shows shack text; it returns
  `*Who are you talking to?` instead. This means object/door interference was
  removed, but NPC `744` is still not targetable from the current alignment.
- Restored NPC `744` to the narrow static proof config
  (`Event Flag: 0x0`, `Movement: 0`, `Show Sprite: always`, `Sprite: 5`) for the
  next placement/alignment diagnostic.
- Retested the static placement at `X: 168`, `Y: 200` from the bedroom route.
  The route reached the target area, but the scripted menu input did not produce
  a usable Talk result in the clip.
- Moved the single NPC `744` placement to `X: 176`, `Y: 192` inside the same
  active group `27/31` to bring the marker closer to the reachable path.
- Neutralized the repeated stock shack pointers `$c9b11e` and `$c9b221` to `$0`;
  stock shack text still appeared, proving there were additional stock
  map-door/object messages in the same footprint.
- Neutralized all `map_doors.yml` text pointers to `$0` in the ignored proof
  fixture. This removes object-text interference without adding any object
  `robot.hello_world` route.
- Recompiled successfully and reached the target area with no stock text
  appearing during the all-door-text-neutralized proof attempt. The remaining
  issue is input/targeting: scripted confirm from the open menu has not yet
  produced either `@Hello World!` or a clean `*Who are you talking to?` in this
  final fixture state.
- Confirmed `screencapture -v` can pause Snes9x; use ffmpeg screen capture or
  explicitly resume Snes9x after starting a capture.
- Confirmed the EarthBound menu confirm key in the current Snes9x mapping is
  `C`; `D` opens the menu and `V` did not confirm the menu selection in the
  latest runs.
- Removed all NPC placements from `map_sprites.yml` except NPC `744` after Talk
  still bound to stock NPC text even with all map-door text neutralized.
- The `27/31`, `X: 176`, `Y: 192` single-NPC placement did not visibly render in
  the target viewport after full isolation. NPC `744` was moved to outer group
  `27`, inner group `10`, `X: 208`, `Y: 168`, and given visible sprite `171`
  while preserving `Text Pointer 1: robot.hello_world`.
- 2026-06-01 diagnostic update:
  - The requested runtime-proven `706` and `707` substitution path was not
    repeated because this document already records pure substitutions and copied
    stock-behavior substitutions for those slots as failed diagnostics.
  - A group `28` all-inner diagnostic and a group `29` all-inner diagnostic did
    not visibly render NPC `744` in the roadblock viewport.
  - A calculated single placement at `22/11`, `X: 96`, `Y: 64`, derived from the
    route landing tile `179,90`, also did not visibly render at the roadblock.
  - An all-sector diagnostic at `X: 96`, `Y: 64` proved NPC `744` sprite
    rendering still works by visibly placing the marker in the bedroom, but that
    coordinate blocked the bedroom route and is not proof.
  - An all-sector diagnostic at `X: 192`, `Y: 216` successfully rendered NPC
    `744` at the roadblock viewport without blocking the route. This proves the
    roadblock can render NPC `744` from `map_sprites.yml` when the active sector
    is included.
  - Bisection narrowed the active roadblock outer sector to the `0-19` range:
    populating outer groups `0-19` with all inner groups at `X: 192`, `Y: 216`
    still rendered NPC `744` at the roadblock.
  - Single placement `11/22`, `X: 192`, `Y: 216` did not render, so the active
    sector is not simply the route landing tile coordinates reversed.
  - The local fixture currently remains in an unfinished diagnostic state while
    the sector search continues; it is not a defensible final proof fixture.
- Follow-up correction:
  - The `X: 192`, `Y: 216` bisection evidence was too weak because NPC `744`
    was using sprite `171`, which was visually easy to confuse with the player
    or an overlapping roadblock sprite.
  - NPC `744` was restored to the narrow proof sprite `5` with
    `Movement: 0`, `Show Sprite: always`, `Event Flag: 0x0`, and
    `Text Pointer 1: robot.hello_world`.
  - With sprite `5`, broad all-sector `X: 192`, `Y: 216` and single `0/0`,
    `X: 192`, `Y: 216` did not provide a distinct roadblock marker.
  - Broad all-sector `X: 64`, `Y: 64` produced a distinct green-cap NPC `744`
    marker, first in the bedroom and then at the roadblock.
  - Visual bisection with the defensible sprite/coordinate has confirmed:
    outer groups `0-19` are positive, outer groups `0-9` are positive, and outer
    groups `0-4` are positive.
  - Fixture state at that time: `map_sprites.yml` was diagnostic with NPC `744`
    placed in outer groups `0-4`, all inner groups, at `X: 64`, `Y: 64`
    (`160` placements total). This is not final proof and must be narrowed
    before recording.

## Result

The strongest imported-dialogue proof artifact is now:

```text
.codex/videos/npc744-bedroom-hello-world-proof.mov
.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled.mov
```

Its contact sheet is:

```text
.codex/videos/npc744-bedroom-hello-world-proof-contact.png
.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled-contact.png
```

The Snes9x-labeled contact sheet shows the active Snes9x menu bar and the final
sampled frames show imported `Hello World!` dialogue after interacting with the
local-only NPC `744` marker. This proves exact NPC `744` dialogue execution in
the bedroom proof fixture. It does not prove the earlier
roadblock/original-placement route.

## Adversarial Review

A focused adversarial re-review passed after the Snes9x-labeled proof artifacts
were added. The reviewer confirmed:

- the contact sheet visibly shows Snes9x provenance through the macOS menu bar.
- the `first-hack` window, boot/title/file-select sequence, bedroom NPC
  interaction, Talk selection, and final `Hello World!` dialogue are visible.
- the document does not overclaim roadblock/original-placement proof.
- the fixture invariants still hold:
  - exactly one NPC `744` placement at `4/31`, `X: 64`, `Y: 64`.
  - exactly one NPC-table `Text Pointer 1: robot.hello_world`, at NPC `744`.
  - zero `Text Pointer: robot.hello_world` object refs in `map_doors.yml`.
  - generated public JSON has no ROM filename, `.sfc`, or `/Users/` references.

No new blocker was found in that review.

## Remaining Limitations

The successful proof uses an ignored local bedroom fixture rather than the
original roadblock/original-placement route. The roadblock target-binding issue
is still unresolved and should not be claimed as complete.

The local fixture has intentional proof-build mutations under ignored
`external/coilsnake-project`:

- `naming_skip.yml` skips name setup.
- `map_doors.yml` has all object text pointers neutralized to `$0`.
- `npc_config_table.yml` has exactly one `robot.hello_world` NPC text pointer,
  at NPC `744`.
- `map_sprites.yml` has exactly one NPC `744` placement in bedroom group
  `4/31`, at `X: 64`, `Y: 64`.
- NPC `744` currently uses a local-only bedroom proof fixture:
  - map sprite placement `4/31`, `X: 64`, `Y: 64`
  - `Movement: 8`
  - `Show Sprite: always`
  - `Sprite: 171`
  - `Type: person`
- the earlier roadblock diagnostic remains documented as unresolved and is not
  claimed by the successful bedroom proof.

Fresh verification after the successful bedroom proof fixture:

- `pnpm convert`
  - generated `manifest.json`, `scripts.json`, `npcs.json`,
    `sprite-groups.json`, `tutorial-status.json`, and
    `validation-report.json`
  - `scriptFiles: 1`
  - `labels: 1`
  - `npcReferences: 2`
  - `spriteImages: 464`
  - tutorial status `13 passed`, `3 failed`
  - expected info warnings for diagnostic NPC `744` fields:
    sprite, movement, and event flag differ from the tutorial baseline
- `pnpm validate`
  - `ok: true`
  - generated validation warnings: `0`
  - generated validation errors: `0`
- `pnpm test`
  - 14 tests passed
- `pnpm exec tsc --noEmit`
- generated JSON safety scan
  - no ROM filename
  - no `.sfc`
  - no `/Users/`
- ignored local CoilSnake compile to `.codex/rom-output/first-hack.sfc`

## Safety Notes

- The ROM was not inspected.
- No ROM bytes are committed.
- No extracted CoilSnake assets are committed.
- All videos and emulator outputs live under ignored `.codex/` paths.
- `external/coilsnake-project` remains local-only fixture input.
- A broad local proof mutation to all low-numbered person NPCs was attempted and
  restored.
- The ignored local proof fixture intentionally differs from the tutorial
  baseline:
  - `naming_skip.yml` skips name setup.
  - `map_doors.yml` has all object text pointers neutralized to `$0`.
  - current `map_doors.yml` has no `robot.hello_world` object text routing.
  - `map_sprites.yml` has a proof-only bedroom placement for NPC `744`.
  - the earlier broad person-NPC proof wiring was restored.
  - current NPC text routing is narrowed to exact NPC `744`.
  - all of this remains local-only under ignored `external/coilsnake-project`.

## Next Best Step

The successful proof is the narrowed bedroom proof. The next milestone is to
decide whether to keep that as the tutorial completion proof or continue a
separate roadblock/original-placement investigation.

- no `robot.hello_world` object routing in `map_doors.yml`.
- exactly one NPC text pointer to `robot.hello_world`, at NPC `744`.
- `map_sprites.yml` is narrowed to exactly one NPC `744` placement:
  `4/31`, `X: 64`, `Y: 64`.
- the roadblock/shack target remains unresolved:
  - original slot `706` is `27/29`, `X: 192`, `Y: 216`.
  - original slot `707` is `27/31`, `X: 168`, `Y: 200`.
  - full-table roadblock substitutions still produced stock text or
    `Who are you talking to?`.
- avoid `screencapture -v` unless Snes9x is explicitly resumed after recording
  starts.
- 2026-06-01 latest blocker:
  - the original slot indices are now corrected: `706` is `27/29 X:192 Y:216`
    and `707` is `27/31 X:168 Y:200`.
  - a full-table local restore plus only replacing `706` with `744` is more
    accurate than the earlier single-slot-only file.
  - with that fixture, Snes9x shows the roadblock cluster, but Talk/Check still
    returns stock shack/roadblock text instead of `@Hello World!`.
  - neighboring NPC text pointers `707`, `1125`, and `1126` were neutralized in
    the ignored local fixture, and exactly one `robot.hello_world` NPC-table
    pointer remains, but the emulator still does not prove exact NPC `744`.
  - the next diagnostic should start from a fresh/clean runtime state or a route
    that forces the roadblock object/NPC state to reload cleanly before
    interaction, then record only if `@Hello World!` appears under the narrowed
    invariant checks.
- 2026-06-01 successful exact-NPC bedroom proof:
  - `map_sprites.yml` has exactly one NPC `744` placement: outer `4`, inner
    `31`, `X: 64`, `Y: 64`.
  - `npc_config_table.yml` has exactly one `robot.hello_world` pointer, at NPC
    `744`.
  - `map_doors.yml` has zero `robot.hello_world` object refs and no nonzero
    object text pointers in the current local proof fixture.
  - NPC `744` uses diagnostic local proof behavior:
    `Movement: 8`, `Show Sprite: always`, `Sprite: 171`, `Type: person`.
  - The proof clip is `.codex/videos/npc744-bedroom-hello-world-proof.mov`.
  - The Snes9x-labeled proof clip is
    `.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled.mov`.
  - The contact sheet is
    `.codex/videos/npc744-bedroom-hello-world-proof-contact.png`.
  - The Snes9x-labeled contact sheet is
    `.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled-contact.png`.
  - This proof intentionally does not claim original roadblock NPC targeting.
