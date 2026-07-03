# Swagbound ↔ EarthBound — Act 1 arc mapping

**Principle (per the design call):** EarthBound's Act-1 **event structure and triggers
are the fixed skeleton**. We do NOT re-engineer EB's trigger points to fit Swagbound;
instead we **reshape Swagbound's beats and write Swagbound dialogue to slot into EB's
beats.** Seamless because the engine keeps doing exactly what it already does — only
the words (and the framing of each beat) change, delivered through the custom-dialogue
override layer (`content/custom-dialogue.json` → `swagbound-dialogue-library.json`).

This is "design-pressure, not costume" (the user's own rule): we borrow EB's *shape*
(cozy-then-violated, mundane-objects-as-RPG-infrastructure, hero-not-validated-too-early),
not its surface. Swagbound's distinct lane stays: provenance, the "leaked version,"
rumor/scene machinery, social classification, Detroit/internet/PFP texture.

## EarthBound Act-1 spine (the fixed triggers)
1. **Meteor crash** overnight near the hero's house (intro).
2. **Door knock** — neighbor (Pokey) wakes the hero; a hook pulls them out of bed.
3. **Travel to the crash site** — neighborhood walk; first random encounters; a road is gated.
4. **Buzz Buzz** at the site — exposition oracle "from ahead": names the threat, the quest.
5. **Starman Junior** — first boss.
6. **Return home + Sound Stone** — the carried key item is handed over; oracle exits humbly; quest = collect the 8 Sanctuary melodies.
7. **Morning: town gated** — police roadblock; the Sharks gang controls the route; can't leave.
8. **Arcade: Frank → Frankystein Mk2** — gang leader fight; points the way onward.
9. **Captain Strong / roadblock lifts** — the authority that gated the route is cleared.
10. **Giant Step → Titanic Ant** — first Sanctuary; boss; first "melody"/recognition milestone.
11. **Leave town north** — on to the next district (Act 2).

## Beat correspondence (EB trigger → Swagbound reframe)
| # | EB beat (kept) | Swagbound reframe (words/story change) | Dialogue source |
|---|---|---|---|
| 1 | Meteor crash overnight | At ~4am Bosch's phone mints "Swag is eternal" signed as him; the Route Brief "opens from outside the house" while he sleeps. The thing that "arrived overnight" = the **leaked version of Bosch**. | new (intro beat) |
| 2 | Pokey knocks, wakes hero | **MiFella** wakes Bosch: "you're trending before breakfast." Companion who pulls him out + tags toward the trouble (and is quietly doxx-aligned). **Biscuit (the dog)** is the household pet. | `interior:bosch-bedroom-v0`, `interior:home-hall-v0` (reattribute waker → MiFella) |
| 3 | Travel to the crash site (encounters, gated road) | Walk out through the neighborhood; first **AI-Slop** encounters (plausible-wrong Boschs) = the local critters. **Signal-Pet won't let you leave** without the Proof-Token Charm = "leave home with permission." | `interior:bosch-side-room-v0` (grab kit), `target:…:signal-pet-gate` |
| 4 | Buzz Buzz exposition | The **Bosch Terminal** ("the route is not neutral; a leaked version is moving through town ahead of your body…") — an oracle from *ahead*, not the future. Frames the act + names **Milady** as the engine. | `dialogue:archive-console-link` |
| 5 | Starman Junior (first boss) | First **Public-Version / AI-Slop manifestation** — a copy made flesh. | new (battle framing) |
| 6 | Return home + Sound Stone | The **Proof-Token Charm** handoff (Entry Bowl) = the carried key item (Sound Stone analog). **Guardian** gives it humbly — "I packed snacks, not destiny" = the anti-prophecy, oracle-exits tone. Quest = gather proof at each threshold (the "melodies"). | `target:…:proof-token-bowl`, `target:…:guardian` |
| 7 | Morning: roadblock + Sharks gate the town | The **civic route**: town services classifying the copy; the **Doxx Clique** controls the route. The **Route Clerk** gives the required order (witness → proof → refusal → parks → gate). | new (clerk) + `interior:bosch-main-room-v0` |
| 8 | Frank → Frankystein Mk2 | The **Doxx Clique** confrontation; its leader = Frank analog; the escalated "Mk2" form = the clique's pre-signed clean Bosch. You **refuse the clean version in public**. Prep first at **Sal** (smudged proof). | `interior:corner-shop-v0` (Sal), new (clique) |
| 9 | Captain Strong / roadblock lifts | The **Station Gate / Compliance** authority reads the whole trail; clearing the clique forces the route open (the roadblock lift). | new (gate/compliance) |
| 10 | Giant Step → Titanic Ant (first Sanctuary) | The first **contested park / threshold** = first "Sanctuary"; its boss = the **Malady** (the leaked-version mask). Defeating it = first recognition milestone; the mask peels to Bosch's face, "CONTRACT OWNER: Milady." | new (park + Malady) |
| 11 | Leave town north | **Refuse Processing** — keep the *damaged* Dox Sheet, refuse the stamp; leave Morningside for the next district. | new (compliance window) |

## Cast / system correspondence
| EarthBound | Swagbound | Note |
|---|---|---|
| Ness (hero) | **Bosch** | Accidental, human, not pre-chosen. |
| Pokey (next-door, wakes you; later villain) | **MiFella** | The companion who pulls Bosch out; quietly doxx/Milady-aligned — carries the Pokey heel turn. |
| King (Ness's dog) | **Biscuit** (the dog) | Household pet companion. The corpus's "Biscuit" wake-up lines reattribute to MiFella; Biscuit gets dog-voice beats. |
| Mom (comfort + gives the item) | **Guardian** | "I packed snacks, not destiny" — the caretaker who hands over the charm. |
| Picky (found at the site) | the **doxx trace** / first **witness** account (Bonkle) | What you "find" at the anomaly. |
| Buzz Buzz (oracle) | **Bosch Terminal** + **Guardian** | Exposition = Terminal; humble key-giver/exit = Guardian. |
| Starman Junior | first **AI-Slop / Public-Version** boss | |
| Sharks / **Frank** | **Doxx Clique** (+ leader) | Route-gating antagonist gang. |
| Captain Strong | **Station Gate / Compliance** | The authority that gated the route. |
| Titanic Ant (Sanctuary boss) | **the Malady** | Act-1 boss = symptom/mask of Milady. |
| Mani-Mani statue | **Dox Sheet** | User's declared equivalence: desire → item → credential → enemy artifact. |
| Sound Stone | **Proof-Token Charm** | The carried binding key item. |
| 8 Sanctuary melodies | **proof / recognition thresholds** | Maps EB's collect-8 onto Swagbound's multi-threshold route. |
| Giygas (cosmic evil) | **Milady / Remilia** | Diffuse cosmic antagonist; Remilia = its administrative shell. |

## First authoring slice (where to start)
Beats 2–6 are the **opening (home → exposition → first boss → key item)** and are the
most self-contained + already half-covered by the library. Concretely:
1. Map the reachable opening-house NPCs to their `interior:*` / `target:*` entries
   (Biscuit bedroom/hall, the side-room kit, the Entry-Bowl charm, Guardian) — `npcId → ref`.
2. Write the **Bosch Terminal (Buzz Buzz) exposition** onto whatever EB NPC/object sits
   at the meteor-equivalent beat.
3. Reframe the **Starman Jr** battle intro + the **Proof-Token Charm = Sound Stone** handoff.
Then beats 7–11 (clique/gate/Malady) as a second slice.

## Resolved decisions (2026-06-16)
- **Act-1 boss:** the **Malady** fills the Giant Step / Titanic Ant slot; defeating it
  reveals Milady as the engine.
- **Companion cast:** **MiFella** is the Pokey equivalent (companion → doxx
  heel); **Biscuit is the dog** (EB's King); **Guardian** is the Mom (charm-giver). The
  Pokey betrayal runs through MiFella + the doxx/Milady thread.
- **Thresholds:** Act 1 is a **single threshold** (Giant Step → the Malady). The full
  Home→witness→proof→clique→parks→gate chain expands in a later pass.
