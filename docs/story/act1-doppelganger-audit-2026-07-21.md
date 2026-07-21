# Act 1 story audit: the file is still a doppelganger (2026-07-21)

Trigger: Nick rejected the wake beat ("There's a you on the floor already... A whole
Bosch, filed, milady on and everything") as dumb, substance-free, and implying a
double. Full resolved-text sweep of both overlays + acts 2-4 confirms the problem
is a CLASS, not a line.

## Root cause

The copy-removal (026fd850, af669885) deleted the double's BODY but kept its
DRAMATIC FUNCTION. "The file" still does three things only a character can do:

1. **Physical presence** - "a you on the floor already", "on the floor, the file is
   already more Bosch than Bosch" (data_20 / data_15).
2. **Mobility + agency** - "Bosch already checked in. His file cleared this
   morning" (Returnless King), "The Bosch on the list is already through" (route
   aide), and the whole clarity hint trail: "the filed Bosch stopped here / went
   from the meteor toward the arcade / is waiting at the crossing / never looked
   at the family pictures."
3. **Identity rivalry** - "That makes you the unfiled one", "more Bosch than Bosch."

A file is an object. Ours walks, commutes, and wins arguments. That IS a
doppelganger with a bureaucratic paint job.

## Findings

- **F1 - 18 agentive-file lines** across the two overlays (5 in narrative-redesign,
  13 in opening-clarity). Redesign shadows all of clarity's triggers/cutscenes/
  objectives, but clarity's 21 dialogue.byNpcId hints + 5 unshadowed variant sets
  STILL PLAY, and ~8-10 of those playing lines are agentive.
- **F2 - The wake beat has no concrete harm.** Nothing happens TO Bosch that a
  player can feel. The real-world referent (waking up added to a cult group chat,
  your private stuff now their meme material, your face on their PFP, a dues
  invoice) is far scarier than an abstract file on the floor. Voice problem too:
  "milady on and everything" is jokey inside a horror beat.
- **F3 - STRUCTURAL: the opening-clarity layer is a track-the-double quest.** Its
  21 hints exist to trace "where the other Bosch went" (that was its original
  2-week-old design). Term-swapping nouns inside it (07-21 pass) preserved the
  double's itinerary. No vocabulary fix can save a quest whose logic is "follow
  the doppelganger's trail" - the layer needs re-purposing or retirement.
- **F4 - What already works (keep):** the Onboarding Officer ("The record says you
  are onboarded. Please hold still and match your record") is the thesis line of
  the act and is already double-free. The reveal (MiFella's leaks spilling out),
  Bosch's betrayal beat, the onboarding car, and Acts 2-4 are cult-native.
- **F5 - Minor late-arc residue (2 touches):** postwick-registry "Our Bosch never
  feels lonely" (a constructed person, not a ledger entry) and museum-frank "A
  polished MiFella steps down from the exhibit" (reads as an animated exhibit
  double rather than A PERSON wearing the MiFella mask).

## The design question

What is Act 1's engine, if not "another you exists"? Candidate engines (all keep
the trigger/battle/flag skeleton unless noted):

1. **The Roster** - membership filed in absentia. The town treats Bosch as ALREADY
   a member: greetings assume he knows the joke, dues are expected, gates want
   on-message behavior. Friction inverts from exclusion to CLAIMED: they don't
   block the outsider, they correct the lapsed member. Boss beat survives intact.
2. **The Joke About You** - MiFella's leak became group content. The inside joke
   you're not in on IS Bosch's private life; strangers giggle at things only a
   friend knew. Gates quiz him on his own file.
3. **Dues Collection** - extraction-led: the membership carries a financial claim;
   collectors treat his belongings as group property ("members share"). Sets up
   the bank-dream payoff hard.
4. **Watch MiFella Turn** - restructure Act 1 around MiFella's recruitment
   happening in real time, scene by scene (the "who puts on the milady next"
   dread applied to YOUR friend). Structural cost: new scenes, not just lines.
5. **Minimal scrub** - keep the current engine, rewrite only the ~15 playing
   agentive lines + the wake for substance. Cheapest; doesn't fix F3.
6. **Claimed + Joke blend (1+2)** - they made him a member OUT OF the leak: the
   whole town is in on a joke about him AND treats him as already-in. The hint
   layer re-purposes cleanly (track the SPREAD - which shop/household "got the
   memo" overnight - instead of tracking a double).

## Scope notes

Options 1/2/3/6 are dialogue-only overhauls (~40-60 lines + re-purposing the 21-hint
layer); triggers, battles, flags, geography all unchanged. Option 4 is structural.
Option 5 is a patch. Acts 2-4 need only the 2 F5 touches under any option.
