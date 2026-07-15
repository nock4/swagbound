# Swagbound Canonical Story Architecture

Status: current working canon for narrative design and future content authoring.

This document supersedes story, terminology, and reveal-order claims in older
design notes when they conflict. It does not supersede verified spatial facts in
`story-recovery-route-ledger.md`, runtime flags in `content/triggers.json`, or the
product definition in `docs/PROJECT-CHARTER.md`. The shipped locations, battles,
party members, eight Sources, four Fuels, and four-act structure remain intact.

This is an architecture document, not a dialogue rewrite. It defines what the
player should understand, wonder, do, and learn at each stage before new lines are
authored.

## 1. Story promise

Bosch wakes to evidence that another Bosch is moving through Morningside. The copy
is cleaner, more confident, and easier for institutions to recognize than he is.
Following it reveals a system that turns repeated descriptions into accepted
truth. Bosch cannot win by producing a perfect proof of himself. He wins by keeping
an imperfect record, trusting people who know him, and refusing to let a public
version replace a living person.

The story's plain-language question is:

> If everyone accepts the copy, how does Bosch remain Bosch?

The thematic answer is:

> A person is not made real by a flawless file. A person remains real through
> memory, choice, contradiction, and relationships that cannot be standardized.

## 2. The mystery contract

The player may be uncertain about the explanation. The player must not be uncertain
about the immediate situation or next action.

At every required beat, the game must make three things clear:

1. What just changed in the world.
2. What Bosch is trying to accomplish now.
3. Where the player should go or what the player should interact with next.

The game may withhold:

- who ultimately benefits;
- how the copies coordinate;
- why Bosch was selected;
- what the pattern means;
- whether a witness is trustworthy.

The game may not withhold:

- the current objective;
- the consequence of the last event;
- the landmark or person that carries the next lead;
- the human meaning of a newly introduced lore term.

The governing rule is: clarity of action creates room for mystery of meaning.

## 3. Reveal schedule and terminology

### Proper-name embargo

`Milady` must not appear in player-facing story dialogue, objectives, NPC barks,
Attestation questions, menu labels, boss names, or optional content before the Act
3 reveal. Internal ids and developer comments may retain the name.

`Malady` is too visually and verbally close to `Milady` to function as an innocent
early label. The Act 1 boss may keep its internal id, but its player-facing identity
should be **the Public Bosch** or **the Copy**. Do not show `Malady` as a boss label,
receipt signer, lore term, or NPC rumor before Act 3.

### Reveal ladder

| Stage | Language the player may hear | Fact earned | Fact still withheld |
|---|---|---|---|
| Opening | other Bosch, copy, missing sheet, flash, meteor | Someone using Bosch's face went uphill while Bosch slept. | Whether it is a person, monster, prank, or system. |
| Act 1 | public Bosch, clean copy, unsigned order, route file | The copy is coordinated and institutions are helping it move. | The organizer's identity and purpose. |
| Act 2 | standing order, recurring mark, pre-filed result, audience | Whole towns accept copies because participation is easy and refusal is costly. | Who authored the pattern and what happens to rejected originals. |
| Act 3 | Milady, agreement, provenance, erased original | Milady is the name for the agreement that lets repeated records replace people. | Whether Bosch can defeat something that is not one body. |
| Act 4 | occupation, cells, open record | Milady needs Bosch to accept a finished version of himself. | Nothing essential. The final conflict tests the answer. |

### Lore budget

- Introduce at most one new capitalized lore term in a required scene.
- Attach every new term to a visible object, action, or consequence in that scene.
- Repeat the plain-language meaning before extending the metaphor.
- Prefer `copy`, `record`, `signature`, and `witness` to new synonyms.
- `Dox Sheet` and `Original Mixtape` are persistent objects, not exposition
  containers. Their meaning grows because the player uses them.
- The four Fuels are analytical categories for optional questlines. NPCs should
  describe their lived problem before the game names the category.

## 4. Four-act question ladder

| Act | Dramatic question | Concrete problem | Player verbs | Act-ending answer | New question |
|---|---|---|---|---|---|
| Opening | Was that really Bosch? | A flash occurs, Bosch's record is disturbed, and MiFella reports another Bosch near the meteor. | wake, inspect, ask, follow | Another Bosch was physically seen and left evidence. | What is the copy doing with Bosch's identity? |
| Act 1: Morningside | What is the copy doing? | The arcade, route gate, and threshold all recognize the copy before Bosch. | compare, challenge, refuse, preserve | The copy is not random. An unsigned authority is moving it through civic systems. | Why do people and towns accept it? |
| Act 2: Postwick | Why does acceptance make the copy stronger? | Postwick pre-files moods, arrivals, and victories, then treats participation as consent. | question, expose, compete, dissent, attest | The system works because people repeat it, benefit from it, or fear becoming an incident. | What happens to the people and records that do not fit? |
| Act 3: Dead Letter | What happened to the originals? | Rejected records accumulate in Dead Letter, while the museum argues first versions out of existence. | recover, compare, restore, remember, name | Milady is revealed as the agreement beneath the copies. Originals disappear when no one will keep witnessing them. | How can Bosch fight an agreement without becoming another perfect record? |
| Act 4: Morningside | What makes Bosch real? | Milady occupies Bosch's home and offers him the version everyone will accept. | return, reconnect, liberate, refuse, confront | Bosch remains unfinished and relational. The record stays open because he declines the final version. | How will the town live without a single approved story? The epilogue answers through changed NPCs. |

## 5. Beat ledger

Every required beat needs one state change and one forward lead. A scene that only
restates the theme is not a beat.

| Beat | Player knows before | Player asks | Player does | Player learns | Next lead |
|---|---|---|---|---|---|
| 0. Arcade-to-house flyover | Nothing | Where are we going? | Watches one continuous route from the arcade to Bosch's house | The arcade and house belong to the same small town; the route between them matters | Camera enters Bosch's room |
| 1. Bedroom flash and knock | Bosch is asleep at home | What woke him, and what flashed? | Inspects the disturbed Dox Sheet and hears MiFella at the door | The flash came from the window; something involving Bosch happened outside | Find MiFella outside |
| 2. Household witnesses | Someone disturbed Bosch's record | Did anyone see it? | Talks to the humanoid household NPCs and checks the phone or note | MiFella saw another Bosch go uphill toward the meteor | Follow MiFella uphill |
| 3. Meteor encounter | A second Bosch went uphill | Is the other Bosch real? | Examines evidence and survives a short tutorial encounter with a weak, visibly incomplete copy | The copy can act in the world, but it is unstable and leaves the same mark as the flash | Take the evidence to the arcade, where people are using Bosch's face |
| 4. Card Clique | The arcade has more copies | Who printed them? | Compares the damaged sheet to a clean card and defeats the clique | Nobody present claims authorship; the card was prepared before Bosch arrived | The card names the civic gate by the station as its next authorization point |
| 5. Route gate | Civic infrastructure recognizes the clean card | Is the town helping the copy? | Challenges the gate and forces the barrier open | The gate follows an unsigned standing order, not a human judgment | Follow the opened road to the crossing by the hotel |
| 6. Public Bosch | The same order controls the route | What is waiting at the threshold? | Fights the Public Bosch, a first-act boss tuned as a readable escalation rather than an endgame threat | The polished face is Bosch's, but its memories are shallow and copied from public facts | Keep the damaged sheet and leave without accepting the clean exit record |
| 7. Refuse Processing | The copy depends on institutional acceptance | Can Bosch simply reject it? | Refuses the exit stamp and recruits allies who witnessed the refusal | Refusal preserves Bosch, but the authorization pattern extends beyond Morningside | Travel to Postwick by a route that must be live-verified before directional copy is authored |
| 8. Postwick arrival | An outside pattern is coordinating copies | Why was Bosch expected here? | Reads a welcome board that contains a specific detail from his clean card | Postwick records arrivals before people arrive | Go to the Registry and inspect the intake ledger |
| 9. Registry | Postwick pre-files arrivals | Who benefits from pre-filing people? | Confronts the Warden and compares the intake form with the Morningside card | Both use the same recurring authorization mark; the system is shared | Follow the ledger trail to the Venue |
| 10. Venue | The Registry and arena share an authority | Why does the town go along with it? | Competes in staged brackets, talks to spectators between rounds, and can refuse the sponsorship | Spectators know outcomes are staged but enjoy certainty, status, and belonging | Expose the pre-printed championship result in public |
| 11. Postwick break | Participation keeps the fiction stable | What happens to dissenters? | Leaves the purse and preserves a nervous original signature as Source Track 2 | Records that do not fit are routed to Dead Letter; the recurring mark remains unnamed | Follow the physical route to Spring, then Dead Letter |
| 12. Spring Source | Imperfect evidence resists copying | Why collect Sources? | Attests a sensory memory that a polished description cannot reproduce | The Mixtape holds experiences through differences among witnesses, not exact duplication | Continue to Dead Letter |
| 13. Undelivered Source | Rejected records go to Dead Letter | Are rejected people still there? | Recovers an unopened parcel and hears from residents who remember incompatible versions | Being rejected did not erase them; losing every witness would | Enter the Museum of Leaked Versions |
| 14. Museum galleries | Originals survive when someone keeps a contradictory record | Who is erasing first versions? | Compares exhibits, restores missing context, and defeats guardians that enforce one label | The museum manufactures uncertainty until people stop defending any first version | Reach Provenance 0 in the deep vault |
| 15. Provenance 0 | Coordinated disagreement erases origins | What coordinates it? | Defeats the mechanism and reconstructs its repeated authorization mark from prior evidence | The mark resolves to the name Milady. Milady is not a hidden woman at a desk, but the agreement that the repeated file is good enough | Gather the remaining Sources to make a record no single authority owns |
| 16. Remaining Sources and Fuels | Milady operates through shared habits and systems | How does the agreement reproduce? | Attests Vault, Pier, Vacancy, and First Record; optionally resolves the four Fuel questlines | Price, broadcast, correction, anonymity, and belonging are different ways people surrender judgment | Return to Morningside when all eight tracks point home |
| 17. Occupied Morningside | Milady cannot fully close Bosch's record while witnesses disagree | Why attack his home? | Reconnects with changed townspeople and clears three occupation cells | Milady needs Bosch's own acceptance to make the replacement final | Reach the plaza |
| 18. Milady | Milady is an agreement embodied for the final confrontation | What does Bosch choose? | Rejects the perfected Bosch and fights using the party's accumulated knowledge | Authenticity is not purity. Bosch is real because he remains capable of choice and change among people who know him | Let the town speak in many voices again |
| 19. Open-record epilogue | The single approved story failed | What survived? | Revisits NPCs whose dialogue reflects the completed arc and optional choices | People remember differently, repair imperfectly, and remain accountable to each other | Free exploration under `game:complete` |

## 6. Clue redundancy matrix

Every critical inference must be available through at least three channels. The
required scene may carry the primary clue, but an observant player should also find
environmental and social confirmation.

| Critical inference | NPC or relationship clue | Environmental clue | System or item clue |
|---|---|---|---|
| Another Bosch acted while Bosch slept | MiFella reports the direction and one precise behavior; household NPCs confirm Bosch never left | Footprints or disturbed objects lead from the flash toward the hill | Dox Sheet shows a new mark timestamped while Bosch was asleep |
| The copies are coordinated | Arcade witness says the cards arrived before opening | Same authorization mark appears at arcade and gate | Objective or Journal updates from `find the copy` to `trace who authorized it` |
| Institutions help the copy | Gate clerk admits the clean file is easier to process | Barriers open for the card and close for Bosch | The damaged sheet fails a scan that the clean card passes |
| Participation makes the record feel true | Spectators repeat a result they know was pre-printed | Venue posters already crown Bosch champion | Accepting or refusing sponsorship changes reactions and an ending callback |
| Rejected originals go to Dead Letter | A resident remembers being returned rather than erased | Unopened parcels retain names and personal damage | Undelivered Source adds a track whose imperfections are audible or described |
| Coordinated disagreement erases provenance | Curator describes giving up after too many conflicting labels | Blank frames retain nail holes and mismatched plaques | Museum interactions let the player compare mutually exclusive records |
| Milady is an agreement, not merely a body | Party members independently name different systems that used the same mark | The reconstructed mark spans artifacts from all three acts | The Source collection only resolves the name when multiple imperfect tracks coexist |
| Bosch survives through relationships and choice | Allies remember details the clean copy gets wrong | The occupied town recovers varied expressions and routines | Final refusal keeps the record open; epilogue flags produce different valid accounts |

The three channels must not repeat the same sentence. One shows the fact, one gives
it human meaning, and one lets the player use or verify it.

## 7. Character arcs

### Bosch

- Starts by trying to prove that the other Bosch is false.
- Learns that a clean file can win even when everyone knows it is incomplete.
- Tries to preserve originals through evidence and Attestation.
- Realizes that no document can contain a whole person.
- Ends by choosing an open, imperfect identity supported by accountable witnesses.

Bosch should make visible choices. Silent endurance alone is not an arc. Refusing
the exit stamp, exposing the staged result, keeping the damaged sheet, deciding what
to attest, and rejecting Milady's final offer are the spine of his agency.

### MiFella

The earlier cast mapping assigns MiFella the trusted-neighbor-to-heel arc. Keep that
direction, but make it causal and legible:

- Opening: MiFella is the indispensable witness who gets Bosch moving.
- Act 1: MiFella is fascinated by the clean copy and repeatedly treats circulation
  as proof. His jokes should help the player while revealing this weakness.
- Act 2: evidence shows that MiFella shared the first image or filled the first gap
  in the record. He did not create Milady, but he preferred the version that made
  him important.
- Act 3: Bosch learns MiFella's act supplied the first witness account. MiFella must
  either accept responsibility or double down. This is where the heel turn becomes
  explicit, not in opening exposition.
- Act 4: the ending records whether MiFella gave a truthful correction, protected
  the lie, or remained absent. No branch changes the main ending, but NPCs remember
  the choice.

This arc requires an owner content pass before implementation because the current
runtime only strongly establishes MiFella as the opening witness. Do not invent a
more severe betrayal than sharing or embellishing the first account without a new
story decision.

### Munch, Cloak, and Knight

Each party member needs one distinct reason that Bosch's unfinished identity matters:

- Munch reads seams and notices where copies fail. He turns abstract claims into
  practical observations.
- Cloak protects unrecorded interior life. She gives the story emotional language
  without pretending feelings are proof.
- Knight understands protocol and accountability. They explain how systems can be
  challenged without making every institution inherently evil.

Before the final battle, each must contribute one clue or action that Bosch could
not produce alone. Their presence should change the solution, not only battle stats.

### Milady

Milady is not omniscient and should not speak as though she authored every bad event.
She is powerful where people prefer a repeatable record to the work of judgment.
She is weak where witnesses remain specific, accept contradiction, and stay
accountable for what they repeat.

Her first named appearance is the Act 3 reconstruction. Her first direct speech is
late Act 3 or Act 4. Before that, antagonists speak for their local incentives, not
as a chorus delivering Milady's final thesis.

## 8. NPC story-state model

High-salience NPCs need state-aware dialogue. A high-salience NPC is a household
member, named character, NPC on the critical path, service clerk at a required
landmark, party member, or resident placed beside a major world change.

### Resolution priority

When multiple dialogue variants match, use this order:

1. Exact quest or local consequence flag.
2. Current main objective and destination.
3. Current act state.
4. Postgame or optional-quest reflection.
5. Base character line.

A local witness should react to the boss defeated outside their building before
giving a generic act-level hint.

### Required state bands

| State band | World fact NPCs should know | Dialogue job |
|---|---|---|
| Opening anomaly | Flash occurred; another Bosch went uphill | Confirm event, name MiFella or meteor, give a landmark |
| Arcade exposed | Clean Bosch cards circulated | React to the copies and point to the station gate |
| Route opened | Civic gate was forced open | Acknowledge the visible change and point to the hotel crossing |
| Act 1 complete | Bosch refused processing and left | Debate whether refusal was brave, foolish, or inconvenient |
| Postwick active | Arrivals and moods are pre-filed | Reveal a local cost or benefit and point to Registry or Venue |
| Act 2 complete | Staged consensus was exposed | Change spectator and clerk lines; point rejected records toward Dead Letter |
| Dead Letter active | Rejected versions persist | Supply personal memories, museum context, and a clear museum landmark |
| Milady named | The recurring mark has been reconstructed | Let NPCs reinterpret earlier events without pretending they always knew |
| Morningside occupied | Home NPCs are threatened or copied | Give immediate cell locations and personal stakes |
| Game complete | The single approved record failed | Reflect local and optional choices in distinct, imperfect accounts |

### Line construction

A useful critical-path NPC response contains:

1. **Observation:** a concrete change the NPC saw.
2. **Interpretation:** what that change means to this person.
3. **Direction:** a landmark or person, only when the player may need it.

Example pattern:

> "Those cards arrived before the arcade opened. Mine has your face but my
> handwriting. The station gate stamped the same corner. Ask there."

This pattern gives plot, character, and navigation without a lore lecture.

## 9. Story verbs and playable context

Required story information should not be delivered only through dialogue. Across
each act, the player must perform at least three non-combat narrative verbs.

Supported verbs should include:

- inspect two versions side by side;
- ask multiple witnesses and notice a mismatch;
- carry an imperfect object forward;
- refuse a form, sponsorship, label, or final version;
- restore context to an edited record;
- attest a sensory or relational memory;
- return to an earlier NPC and hear changed understanding.

Combat should resolve resistance, not perform the entire investigation. Every main
boss needs a pre-fight discovery and a post-fight knowledge change.

## 10. Objective and wayfinding contract

The objective system, NPCs, environment, and route must agree.

- Journal objective: imperative verb plus unique landmark.
- Nearby NPC: why the destination matters plus one recognizable feature.
- Environment: sign, road opening, lighting, prop, or crowd motion confirms arrival.
- Trigger: fires on normal approach, not only after debug warps or a narrow angle.

Known route facts to preserve:

- From the Act 1 town road, the arcade route is west toward SLICE and MONS LINK,
  not north.
- The relay gate is by the station and billboard.
- The Public Bosch threshold is at the crossing beside the hotel.
- The exact Act 1 to Act 2 travel route must be walked and verified again before
  any north, south, east, or west instruction becomes canonical player-facing copy.

The old route ledger's sealed-hill finding is a historical snapshot and must not be
treated as current runtime truth without a fresh boot. Its verified landmark facts
remain useful.

## 11. Comprehension gates

Use fresh players who have not read design documents. Do not explain terms before
the session. Ask for answers in the player's own words.

| Checkpoint | Questions | Pass condition |
|---|---|---|
| After leaving the house | What happened? Who are you looking for? Where are you going? | At least 4 of 5 say that another Bosch was seen, identify MiFella, and name the meteor or uphill route. |
| After the meteor | What did the encounter prove? What is your next lead? | At least 4 of 5 say the copy is physically real or dangerous and identify the arcade. No more than 1 calls it Milady. |
| After Act 1 | What was controlling the arcade and gate? Why keep the damaged sheet? | At least 4 of 5 describe coordination without needing the antagonist's name and understand that the damaged record is harder to replace. |
| After Registry | Why is Postwick accepting false results? What should you do next? | At least 4 of 5 cite convenience, pressure, or belonging and identify the Venue. |
| After Act 2 | Where do rejected records go? What mystery remains? | At least 4 of 5 identify Dead Letter and still want to know who or what authored the recurring mark. |
| After Milady reveal | What is Milady? What happened to originals? | At least 4 of 5 describe an agreement or shared system, not only a monster, and connect erasure to loss of witnesses. |
| After ending | Why did Bosch win? | At least 4 of 5 cite refusal plus relationships, memory, or open-ended identity rather than stronger combat alone. |

Additional UX thresholds:

- 5 of 5 players can state the immediate objective at every checkpoint.
- No required text page clips or crosses its frame at 512x448.
- No first-time player needs a debug warp, external map, or developer explanation.
- No required scene introduces more than one unexplained lore term.
- No high-salience NPC repeats a base line after a visible local story change.

## 12. Implementation order

This order minimizes rewrite churn and tests comprehension before expanding the
middle game.

### Wave 0: contradiction audit

- Inventory every player-facing `Milady` and `Malady` occurrence and classify it by
  earliest reachable flag state.
- Inventory every objective direction against live route verification.
- Inventory high-salience NPCs that have no flag-aware variant.
- Inventory required dialogue pages that overflow or approach the 512x448 frame.
- Record internal ids that may remain unchanged while display names change.

### Wave 1: opening and Act 1

- Finish the single arcade-to-house flyover.
- Make the bedroom flash legible with sound, visible consequence, and NPC reaction.
- Use humanoid household NPCs as witnesses and keep the phone sprite distinct from
  the ATM.
- Replace the first hill encounter's oversized or retired Drilady presentation with
  a weak incomplete-copy tutorial encounter.
- Rewrite objectives, boss framing, reveals, and nearby NPC states through
  `act1:complete` under the proper-name embargo.
- Live-test the whole route at 512x448, including dialogue fit.

### Wave 2: Act 2

- Make the recurring authorization mark the act's evidence spine.
- Add spectator conversations between arena rounds.
- Make the sponsorship choice and pre-printed championship result playable.
- Rewrite the Act 2 exit so Dead Letter is a causal destination, not merely the next
  town.

### Wave 3: Act 3 and the reveal

- Give Dead Letter residents specific returned records and relationships.
- Turn museum investigation into compare and restore interactions around the
  existing guardian fights.
- Reconstruct the Milady name from evidence at the end of the museum sequence.
- Audit optional Fuel content so nothing reachable earlier leaks the name.

### Wave 4: Act 4 and epilogue

- Give each party member one necessary contribution before the final fight.
- Make occupied household and town NPCs establish personal stakes and cell
  locations.
- Let final dialogue synthesize prior evidence rather than introduce new theory.
- Add postgame NPC variants for main and optional choices.

### Wave 5: whole-game comprehension QA

- Run the full arc with clean saves and the health watchdog.
- Conduct five fresh-player tests using the comprehension gates above.
- Run automated text-fit, reveal-order, stale-objective, and NPC-state coverage
  audits.
- Revise the first failed knowledge transfer, not merely the line where the player
  finally reported confusion.

## 13. Content touchpoints for later implementation

Likely authored sources:

- `content/opening-clarity.json`
- `content/triggers.json`
- `content/objectives.json`
- `content/custom-dialogue.json`
- `content/cutscenes.json`
- `content/added-npcs.json`
- `content/story-items.json`
- `content/boss-battle-dialogue.json`
- `content/drifella-source-checks.json`

Likely runtime seams:

- `apps/game/src/objectives.ts`
- `apps/game/src/questJournal.ts`
- `apps/game/src/dialogueRenderer.ts`
- `apps/game/src/storyTriggers.ts`
- existing NPC dialogue flag resolution in the world scene and loader

Content changes must be followed through the full build to
`apps/game/public/generated/`. Generated chunk art is not part of a narrative patch.

## 14. Research basis

The architecture applies these established design principles:

- Henry Jenkins, *Game Design as Narrative Architecture*: games can distribute
  story information through navigable spaces and environmental evidence.
  <https://paas.org.pl/wp-content/uploads/2012/12/09.-Henry-Jenkins-Game-Design-As-Narrative-Architecture.pdf>
- Don Carson, *Environmental Storytelling: Creating Immersive 3D Worlds Using
  Lessons Learned from the Theme Park Industry*: physical details can carry causal
  story context without stopping play.
  <https://www.gdcvault.com/play/1012647>
- Mobius Digital, *Sparking Curiosity-Driven Exploration Through Narrative in Outer
  Wilds*: a clear unanswered question can motivate exploration when discoveries
  produce useful new questions.
  <https://www.gdcvault.com/play/1027368/Independent-Games-Summit-Sparking-Curiosity>
- Campo Santo, *Designing for Exploration and Choice in Firewatch*: navigation,
  conversation, and player attention can share the work of storytelling.
  <https://www.gdcvault.com/play/1022409/Designing-for-Exploration-and-Choice>
- Valve, *AI-driven Dynamic Dialog through Fuzzy Pattern Matching*: dialogue can
  respond to current state without requiring a single monolithic script.
  <https://www.gdcvault.com/play/1015528/AI-driven-Dynamic-Dialog-through>
- Failbetter Games, *StoryNexus Developer Diary 2*: quality-based narrative uses
  state changes to make later storylets reflect what the player has done.
  <https://www.failbettergames.com/news/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing>
- George Loewenstein, *The Psychology of Curiosity*: curiosity is driven by a
  perceived information gap, which requires enough known structure for the missing
  information to feel specific.
  <https://www.researchgate.net/publication/232440476_The_Psychology_of_Curiosity_A_Review_and_Reinterpretation>

The practical Swagbound interpretation is simple: give the player a concrete event,
a usable lead, and evidence they can manipulate. Let each answer open a more
interesting question. Do not ask terminology to create mystery by itself.
