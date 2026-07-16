# Swagbound Canonical Story Architecture

Status: current working canon for narrative design, implementation, and QA.

This document supersedes story, terminology, characterization, and reveal-order
claims in older design notes when they conflict. It does not supersede verified
spatial facts in `story-recovery-route-ledger.md`, runtime flags in
`content/triggers.json`, or the product definition in `docs/PROJECT-CHARTER.md`.
The shipped locations, party, Sources, Fuels, and four-act structure remain intact.

## 1. Story promise

Bosch is an unassuming kid whose best friend, MiFella, photographs another Bosch
moving through Morningside while Bosch is asleep. MiFella circulates the image. The
attention allows increasingly convincing Bosch derivatives to appear, and MiFella
is drawn toward the cute, confident community forming around them.

Following MiFella and the derivatives reveals Remilia Co., a friendly corporate
apparatus that turns surrender into access, status, products, and belonging. Behind
it is Milady, an omnipresent force sustained whenever people stop judging for
themselves and synchronize with the network.

Bosch does not win by proving he is the pure original. He wins by continuing to see
specific human beings where Milady sees interchangeable nodes. Love, kindness, and
compassion defeat evil because they help people recover memory, judgment,
responsibility, and one another.

The plain-language dramatic question is:

> Can Bosch save MiFella and Morningside without treating the people Milady absorbed
> as disposable enemies?

The thematic answer is:

> People remain worth loving when they are complicated, mistaken, contradictory,
> unfinished, and responsible for repairing the harm they caused.

## 2. The mystery contract

The player may be uncertain about the ultimate explanation. The player must never
be uncertain about the immediate event, emotional stake, or next action.

Every required beat must make four things clear:

1. What visibly changed.
2. What Bosch wants now.
3. Why MiFella or another person matters to that goal.
4. Where the player should go or what the player should interact with next.

The game may withhold:

- what created the derivatives;
- why circulation makes them stronger;
- who runs the infrastructure;
- what MiFella has told the network;
- the name Milady;
- whether MiFella will return.

The game may not withhold:

- the current objective;
- the consequence of the last event;
- the landmark or person carrying the next lead;
- the emotional meaning of MiFella's latest choice;
- the human meaning of a newly introduced lore term.

Clarity of action creates room for mystery of meaning.

## 3. Antagonist model

### Milady

Milady is always referred to as **it** and **its**. It is not a woman, founder,
queen, goddess, singular body, or person waiting at the end of the story.

Milady is an omnipresent force created and sustained through synchronized surrender.
It operates through congregants, derivatives, repeated images, shared language,
attention, and Remilia Co. infrastructure. Any body or battle sprite associated
with Milady is a local manifestation, interface, derivative, or congregant. It is
never the entirety of Milady.

Milady obeys observable rules:

1. It cannot originate. It can only derive, remix, caption, and repeat.
2. Attention and circulation strengthen it.
3. Connected congregants become nodes through which it perceives and speaks.
4. Synchronization provides real comfort, confidence, and belonging.
5. Surrender gradually erodes unscripted thought and specific memory.
6. Derivatives know circulated facts but struggle with private relational truth.
7. Choice, contradiction, accountability, and specific compassion interrupt it.

Milady must never speak like a conventional villain trading personal insults with
Bosch. Its dialogue arrives through multiple mouths, overlapping records, rooms,
interfaces, and systems. As people disconnect, Milady's language becomes less
coherent while individual voices become more specific.

### Remilia Co.

Remilia Co. is the physical, financial, and administrative apparatus around Milady.
It operates onboarding rooms, network chapels, derivative printers, galleries,
raves, residences, credentials, correction desks, markets, and sponsorship systems.

Milady makes surrender feel transcendent. Remilia Co. makes it convenient,
profitable, and difficult to leave.

### Derivatives

Derivatives are remixed people, images, creatures, or records produced from
circulated material. They are not automatically evil. Some are unstable weapons,
some are corporate products, and some become distinct beings worthy of compassion.
Their dramatic function is to show that resemblance and repetition are not
relationship or understanding.

## 4. Terminology and reveal schedule

### Retired player-facing language

Do not use `Public Version`, `Public Bosch`, `official version`, or `clean public
file` in new player-facing content. Stable runtime ids may retain legacy handles
until a scoped migration is safe.

Use:

- another Bosch;
- Bosch derivative;
- derivative;
- unstable derivative;
- clean derivative;
- first-generation derivative;
- congregant;
- onboarding;
- synchronization;
- the network;
- the Room;
- Remilia Co.;
- Milady, only after the reveal.

Characters initially say `another Bosch` because they do not understand the event.
MiFella introduces `derivative` after recognizing the phenomenon. Prefer
`derivative` over `copy` once that vocabulary has been established.

### Proper-name embargo

`Milady` must not appear in player-facing story dialogue, objectives, NPC barks,
Attestation questions, menu labels, boss names, or optional content before the Act
3 reveal. Internal ids and developer comments may retain the name.

`Malady` remains too close to `Milady` and must not appear as an early innocent
label. The former player-facing Public Bosch or Malady encounter is now **Bosch
Derivative**.

### Reveal ladder

| Stage | Language the player may hear | Fact earned | Fact withheld |
|---|---|---|---|
| Opening | another Bosch, derivative, photograph, meteor | MiFella circulated an image of something wearing Bosch's face. | Who made it and why attention changes it. |
| Act 1 | Bosch derivative, onboarding, network, clean derivative | Circulation improves derivatives, and MiFella is choosing the community around them. | Who runs the system and what MiFella supplied. |
| Act 2 | Remilia Co., synchronization, congregant, the Room | Remilia Co. turns synchronized belonging into infrastructure, and MiFella supplied private details. | The force emerging through the network. |
| Act 3 | Milady, manifestation, provenance | Milady is the omnipresent force sustained by surrendered judgment and repeated identity. | Whether MiFella and the occupied town can disconnect. |
| Act 4 | occupation, disconnection, local manifestation | Milady needs people to keep choosing synchronization. | Nothing essential. The finale tests the answer. |

### Lore budget

- Introduce at most one new capitalized lore term in a required scene.
- Attach every term to a visible action, object, relationship, or consequence.
- Repeat the plain-language meaning before extending the metaphor.
- Let MiFella's choices carry the emotional explanation before institutions carry
  the intellectual explanation.

## 5. Character arcs

### Bosch

Bosch begins without heroic ambition. He wants to understand the bedroom flash and
keep MiFella from doing something reckless.

His arc is expressed through action:

- **Notice:** observe what frightened or synchronized people are actually feeling.
- **Help:** solve problems that cannot reward him and form accountable relationships.
- **Reach:** continue addressing MiFella as a person after the betrayal is exposed.
- **Love:** refuse both Milady's painless substitute friendship and the easy answer
  of discarding everyone who joined it.

Bosch's strength is attention. He remembers details, permits contradiction, and
keeps choosing other people when isolation would be simpler.

### MiFella

MiFella is Bosch's best friend and the emotional center of the cult story. He is
drawn in because Milady derivatives are cute and cool, the music and jokes appeal
to him, and the community makes him feel immediately recognized. Synchronization
offers relief from worrying whether he is living correctly.

His betrayal must be causal and gradual:

1. He photographs and circulates the first other Bosch.
2. The resulting attention makes him important.
3. He repeats claims he has not verified.
4. He supplies private details that improve the Bosch derivative.
5. He refuses to correct the account because he fears losing his community.
6. He accepts onboarding and becomes a congregant.

MiFella remains redeemable but not innocent. Bosch can create an opportunity for
him to return, but MiFella must choose to disconnect, admit what he did, and correct
the first account publicly. Compassion never erases accountability.

### Munch, Cloak, and Knight

Each party member demonstrates a different form of care:

- Munch notices seams and turns abstractions into specific observations.
- Cloak protects interior life that cannot be made public without changing it.
- Knight treats procedure as a tool for accountability rather than obedience.

Each must contribute a relationship, clue, or action Bosch could not produce alone.
Their presence changes the solution, not only battle statistics.

## 6. Four-act dramatic ladder

| Act | Human question | Concrete problem | Bosch's verb | Act-ending answer |
|---|---|---|---|---|
| Opening | What did MiFella see? | Another Bosch crossed town while Bosch slept, and MiFella circulated the image. | Notice | The derivative is physically real, and attention is already changing it. |
| Act 1: Morningside | Why is MiFella helping this spread? | The arcade celebrates derivatives and gives MiFella status for discovering one. | Follow | MiFella chooses onboarding rather than retracting his account. |
| Act 2: Postwick | What did MiFella give the network? | Remilia Co. offers effortless belonging through synchronized systems. | Help | MiFella supplied private details because the network promised to preserve Bosch without the difficult parts. |
| Act 3: Dead Letter | What is speaking through the network? | Originals and unscripted memories are discarded beneath prestigious derivative culture. | Reach | The force is named Milady, and a private memory proves MiFella is still reachable. |
| Act 4: Morningside | Can Bosch save people without surrendering to or destroying them? | Milady occupies the town and offers Bosch a painless derivative life. | Love | People disconnect, MiFella corrects the first account, and Bosch rejects simplified belonging. |

## 7. Required beat ledger

Every required beat needs one visible state change, one human consequence, and one
forward lead. A scene that only restates the theme is not a beat.

| Beat | Player action | State change | Human meaning | Next lead |
|---|---|---|---|---|
| 0. Arcade-to-house flyover | Watch one continuous route | MiFella photographs a Bosch-shaped figure; repeated symbols and synchronized reactions appear | MiFella is curious before Bosch even knows something is wrong | Camera reaches Bosch's bedroom |
| 1. Bedroom flash | Wake and inspect | Light and sound disturb Bosch's room; the household reacts | Something outside acted on Bosch while he slept | Answer MiFella's knock |
| 2. MiFella's report | Question MiFella and household witnesses | MiFella admits he already shared the image | His excitement and need for attention complicate his concern | Follow MiFella uphill |
| 3. Meteor derivative | Inspect the wreckage and survive the tutorial battle | An unstable Bosch derivative imitates Bosch one turn late | The derivative repeats but does not understand; MiFella pockets its cute artifact | Take the evidence to the arcade |
| 4. Arcade clique | Compare the image, cards, and derivative behavior | Circulation produces a cleaner derivative | MiFella is welcomed as the discoverer and likes being important | Trace the derivative route through Morningside |
| 5. Civic route | Challenge the systems accepting derivatives | The derivative receives access Bosch does not | Convenience is replacing judgment | Confront Bosch Derivative |
| 6. Bosch Derivative | Use private specificity to expose its limits | The polished derivative fails a relational memory test | Knowing facts about someone is not knowing them | Stop MiFella's onboarding |
| 7. MiFella leaves | Ask MiFella to correct the account | MiFella refuses and joins the network | Bosch loses his friend through a choice, not a kidnapping | Follow Remilia Co. to Postwick |
| 8. Synchronized town | Help residents with concrete harms | Individual residents begin speaking outside scripts | Connection without choice is not care | Find the onboarding infrastructure |
| 9. Remilia Co. | Investigate records, venues, and residences | Corporate systems reveal how participation is monetized | MiFella's comfort is real, but somebody profits from his surrender | Trace the private data used for derivatives |
| 10. MiFella's betrayal | Compare the derivative with a private record | Bosch learns MiFella supplied personal details | Friendship made the betrayal possible and makes repair meaningful | Follow rejected records to Dead Letter |
| 11. Dead Letter | Recover people and memories the system discarded | Contradictory originals remain alive when witnessed | Imperfection is not failure | Enter the museum and reconstruct the recurring force |
| 12. Milady named | Combine evidence from multiple relationships | The recurring presence resolves as Milady | Evil is distributed through habits and choices, not one mastermind | Reach MiFella inside the network |
| 13. Private memory | Offer MiFella a memory never circulated | MiFella cannot complete it, then remembers one specific detail | A person remains inside the role | Return to occupied Morningside |
| 14. Occupation | Reconnect with people Bosch helped | Occupation nodes disconnect one by one | Kindness becomes the resistance network | Reach the final local manifestation |
| 15. MiFella corrects the account | Give MiFella the choice to tell the truth | He publicly corrects the first derivative story | Accountability restores agency | Confront the weakened manifestation |
| 16. Final disconnection | Pray, remember, protect, and fight | Distinct voices replace the chorus | People choose one another over synchronization | Destroy the local foothold |
| 17. Open-record epilogue | Revisit changed NPCs | Multiple imperfect accounts coexist | MiFella apologizes without demanding immediate absolution | Free exploration |

## 8. Opening vertical-slice contract

The first five minutes must contain all of the following in the canonical engine,
on canonical maps, with canonical sprites:

1. One continuous MONS LINK arcade-to-house flyover.
2. At least two visible synchronized anomalies on the route.
3. MiFella photographing or clearly having photographed the other Bosch.
4. A bedroom flash with visible reaction and sound.
5. Household NPC movement or facing that demonstrates the event affected them.
6. MiFella admitting he circulated the image.
7. A clear objective to follow MiFella uphill.
8. An unstable Bosch Derivative tutorial encounter.
9. A battle behavior that visibly derives Bosch's previous action one turn late.
10. MiFella keeping a cute artifact or otherwise showing attraction to the network.
11. A clear objective pointing to the MONS LINK arcade.

At the end of the slice, a first-time player must be able to say:

- Something wearing Bosch's face moved through town while he slept.
- MiFella photographed and shared it.
- The derivative can repeat Bosch but does not understand him.
- MiFella is worried, excited, and attracted to what they found.
- The next lead is the arcade.

## 9. Battle language and moral grammar

### Named result rule

Every battle introduction and defeat result must use the displayed enemy name.
Never print generic results such as `The enemy logged off`.

Default pattern:

> Bosch Derivative closed in!

> Bosch Derivative logged off.

Contextual result verbs are assigned by enemy family:

- congregants and online creatures: `logged off`;
- financial enemies: `was liquidated`;
- vampiric or energy enemies: `got drained`;
- derivatives: `was delisted`;
- Remilia machinery: `went offline`;
- broadcast enemies: `lost the signal`;
- local manifestations: `lost its shape`.

The final result must name the local battle form. It must never claim that Milady
as an omnipresent force simply logged off or died.

### Compassion in battle

Battle dialogue should react where appropriate when Bosch defends, heals, prays,
remembers, refuses cruelty, or completed a compassionate side quest. Hostile
congregants remain people. Their synchronized language gives way to personal,
imperfect speech as Milady's hold weakens.

The final battle progresses through:

1. synchronization;
2. temptation;
3. contradiction;
4. recognition through distinct witnesses;
5. disconnection of congregants;
6. defeat of the remaining local manifestation.

Pray is not magical purity. It opens a channel through which people Bosch helped
recognize one another and withdraw their attention from Milady.

## 10. NPC story-state requirements

High-salience NPCs need state-aware dialogue. This includes household members,
MiFella, named characters, critical-path NPCs, service clerks beside required
landmarks, party members, and residents beside major world changes.

For each required beat, nearby NPC dialogue must collectively answer:

- What changed?
- How did it affect a person?
- Where is the next lead?

NPCs must not all understand the lore. They should describe lived effects before
using analytical terms. After the Milady reveal, they may reinterpret earlier
events without pretending they always knew its name.

## 11. Clue redundancy

Every critical inference must appear through at least three distinct channels:

| Inference | Relationship clue | Environmental clue | Mechanical clue |
|---|---|---|---|
| MiFella circulated the image | MiFella admits it; household NPC heard his excitement | Camera flash or photograph is shown | Evidence or objective records his post |
| Circulation improves derivatives | Arcade NPC describes the image becoming cleaner | Successive images become more polished | Tutorial and boss derivatives gain better imitation |
| MiFella is being drawn in | His jokes become admiration and shared phrasing | He keeps the cute artifact | His dialogue variants and later absence track onboarding |
| Remilia Co. profits from surrender | Workers and former members describe the bargain | Credentials, residences, and printers share branding | Access and rewards encourage participation |
| Milady is distributed | Party members hear it through different systems | Multiple bodies synchronize across locations | Defeating one manifestation does not clear the network |
| Compassion interrupts Milady | Helped NPCs remember specific details | Synchronized crowds regain varied movement | Prayer and relationship flags remove final-battle nodes |

One channel shows the fact, one gives it human meaning, and one lets the player use
or verify it.

## 12. Implementation and QA gates

Implementation order:

1. opening vertical slice;
2. Act 1 MiFella temptation and defection;
3. Act 2 Remilia Co. infrastructure and betrayal reveal;
4. Act 3 Milady naming and MiFella memory sequence;
5. Act 4 occupation, correction, and disconnection finale;
6. state-aware NPC propagation and epilogue;
7. full battle-language and compassionate-response pass.

Release gates:

- zero player-facing `Public Version` or `Public Bosch`;
- zero player-facing `Milady` or `Malady` before the Act 3 reveal;
- zero `she`, `her`, `woman`, `queen`, or `goddess` referring to Milady;
- every battle introduction and result names the displayed enemy;
- every required objective identifies a verified landmark or interaction;
- MiFella's friendship is established before his betrayal;
- the opening derivative is readable as a tutorial threat, not an endgame enemy;
- all dialogue fits the 512x448 text containers;
- no em dashes in player-facing additions;
- content changes survive `build:eb-fullworld` and resolve through the runtime;
- the arc runner, watchdog, focused tests, and full suite pass;
- real new-game, save/resume, loss/retry, and sequence-break boots are verified.
