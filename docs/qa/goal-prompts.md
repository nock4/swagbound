# Goal-oriented prompt templates (post-mortem 2026-07-09)

Born from a pattern of repeated failures: proxy verification, silent interpretation
of fuzzy scope, and stale builds. Every task (mine or Codex's) uses one of these.
The acceptance evidence is ALWAYS the player-visible outcome, captured the way
Nick plays.

## The Definition of Done (applies to every template)

1. BUILD STAMP: the served game shows the current commit stamp in the debug HUD;
   evidence screenshots must include it. No stamp match, no verification.
2. PLAYER FLOW: acceptance runs use the REAL boot (title -> new game or continue),
   not ?nointro shortcuts, unless the feature is dev tooling.
3. PIXELS OVER PROPERTIES: visual claims are proven by screenshot of the outcome,
   never by object state (visible/alpha/coords). Every sprite in the evidence
   screenshot must be IDENTIFIED (who is this?) before it counts.
4. INTERPRETATION ECHO: if the goal contains a fuzzy boundary (when does "the
   intro" end? how dark is "dark"?), the interpretation is stated in one line and
   confirmed BEFORE building, not discovered after.
5. COMMON CASE FIRST: tuning/balance fixes are validated against the situation a
   real first-time player is in (current party size, level, equipment), not
   against outliers or automation-driven play.

## Template V: VISUAL FIX
GOAL: A player at <place/moment> sees <exact desired appearance>.
NOW: They see <exact wrong appearance> (screenshot attached).
ACCEPT: A screenshot from the real player flow at <place/moment> showing <desired
appearance>, with every visible sprite identified, taken against build <stamp>.
Sweep the surrounding +/-24px standable positions if it is an occlusion issue.
NON-GOALS: <what not to touch>.

## Template A: AUDIO / MUSIC
GOAL: From <moment X> to <moment Y>, the player hears <track/sound>; at <boundary>
it <stops/crossfades to Z>. State the boundary as a game EVENT (a flag, a door, a
battle), never a vague phase name.
ACCEPT: an instrumented run of the real flow logging every music start/stop with
its trigger, showing exactly the specified sequence; boundaries verified by
driving the actual events.

## Template S: STORY / SCENE
GOAL: When the player <does X>, they experience <beat>: who is VISIBLE, who SPEAKS
(every quoted line has an on-screen speaker), what changes after.
ACCEPT: screenshot(s) of the beat mid-play with the speaker visibly present and
identified as the speaker (not the player, not a bystander); the scene completes
and control returns; re-entry behaves per the once/repeat spec.

## Template B: BALANCE / TUNING
GOAL: A <party state: size/level/gear> player at <place> should <win/lose/struggle
to degree D> against <encounter>.
ACCEPT: an automated playthrough using REALISTIC commands (not Z-mash; use the
same mix a human would: attack/heal/defend) from the exact party state, run N
times, reporting win rate and rounds; plus the designer's number sheet (damage
in/out per round) so the tuning is explainable.

## Template I: INFO / UX
GOAL: At <UI moment>, the player can learn <information> without leaving the flow.
ACCEPT: screenshot of the UI showing the information in place; a first-time-player
read test: the vision judge (calibrated with the art direction) can answer "what
does this item do?" from the screenshot alone.

## Escalation rule
The SECOND time any issue is reported, it stops being a fix task and becomes a
class investigation: why did the first fix not reach the player? (build staleness,
wrong verification, wrong interpretation) - the answer goes in the fix report.
