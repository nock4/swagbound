# The Four Fuels (Milady side content)

Draft 2026-07-11 for Nick's steering. The thesis: Milady runs on four fuels
(anonymity, network-state spirituality, psy-ops, financial nihilism), countered
by friendship, honesty, true self. The main spine already carries the argument;
this side content lets a player FEEL each fuel in isolation, off the required
path, using systems that already exist (boss gates, cutscenes, interactables,
the Archivist records, Attestation). No new engines. Copy rule: no em dashes.

Each fuel gets one QUESTLINE (3 beats: encounter, complication, counter) plus
one optional BOSS expressing the fuel as mechanics. Guardians reuse existing
battle groups; new NPCs reuse roster skins.

## 1. Anonymity: "The Unsigned"
Where: Postwick back streets + the Galleria service floors.
- Beat 1: a masked crew of "Unsigned" hand out free masks. Wearing one is
  never required; NPCs react to Bosch differently if he talks to the crew
  twice (they assume he wants in).
- Beat 2: an Unsigned member wants OUT: he sold his name (the fountain burnout
  already jokes about this) and now cannot prove he was ever anyone. Fetch: his
  one surviving signature (a receipt in the Dead Letter return line).
- Beat 3 counter: the Archivist files him back into existence. His record page
  in the Records menu is the quest reward; his mask becomes a shelf prop in his
  apartment. Fragment line: "A name is a debt other people agree to remember."
- BOSS (optional): The Nobody, a fight where the enemy has no name in the
  battle UI (blank string) and copies its stats from whoever checks it.
  Mechanic: it only takes damage on rounds where the party does NOT check it.

## 2. Network-state spirituality: "The Onboarding"
Where: Solana Beach pier chapel + the Room's street preachers (already voiced).
- Beat 1: the pier chapel runs "onboarding sessions." Sitting through one
  (a cutscene pew scene) earns a Pre-Member Card (key item, worthless).
- Beat 2: a member's kid never came home from the "residency." The trail leads
  through three testimonial NPCs whose stories agree EXACTLY, word for word
  (the copy tell; the player notices or the kid stays lost).
- Beat 3 counter: the kid is found running the chapel sound board; he stayed
  because the Room "filed his doubt as noise." Bosch's dialogue choice: play
  the kid's OWN first recording (Mixtape system hook) and he walks out.
- BOSS (optional): The Congregation, one enemy rendered as a crowd (existing
  crowd skin), whose attack scales with how many testimonial NPCs the player
  left unchallenged.

## 3. Psy-ops: "The Correction"
Where: Vacancy Flats (the marquee already rewrites thoughts) + Dead Letter.
- Beat 1: motel guests each report a small memory that is wrong by one word
  (the marquee's work). A notice board lists "corrections" to events the
  player actually did (their OWN record, edited).
- Beat 2: the player's Archivist Records page shows ONE filed record subtly
  altered (a planted fake; flagged internally, reversible). The Archivist is
  furious in a quiet way: "Someone filed over my filing."
- Beat 3 counter: find the Editor's field agent (a typewriter creature skin)
  planting corrections; beating it restores the record and every motel guest's
  sentence snaps back mid-conversation if the player is standing there.
- BOSS (optional): reuse The Editor's battle group with a new taunt set:
  it "revises" the battle log lines as they print (bossTaunts hook).

## 4. Financial nihilism: "The Floor"
Where: the Galleria forgery floor + the Venue arena economy.
- Beat 1: a price-tag gun has escaped and is tagging things that should not
  have prices (a bench: 40. A sunset: 12. A kid's drawing: 0.01). Examine
  interactables to collect absurd tags.
- Beat 2: the arena offers Bosch a sponsorship: throw one fight and the purse
  doubles. Taking it sets a flag the ending montage remembers (quietly).
  Refusing gets nothing at all, which is the point.
- Beat 3 counter: the kid whose drawing was tagged 0.01 buys it back with a
  button. The vendor accepts because "the market is whoever shows up."
  Fragment: "Value is a rumor. Worth is a witness."
- BOSS (optional): The Underwriter, who assigns the party PRICE TAGS
  (reuses the Appraiser gimmick from the Vault) but pays the party gold when
  hit, betting they will not finish a fight that profitable.

## Implementation notes
- All questlines are triggers.json + cutscenes.json + custom-dialogue.json +
  overworld-interactables.json work; zero engine changes except: the altered-
  record beat (needs a small Records-view override), the blank-name boss (UI
  tolerates empty names already?), and the montage flag (ending hook exists).
- Suggested build order: 3 (Correction) first since Vacancy Flats is thinnest
  on content, then 4, 2, 1.
- Each questline ends with an Archivist filing, tying side content into the
  records collection so completionists see the four fuels lined up as records.
