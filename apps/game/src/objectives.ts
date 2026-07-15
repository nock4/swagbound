import type { ObjectiveEntry, Objectives } from "@eb/schemas";
import { INTRO_METEOR_BEAT_FIRED_FLAG } from "./newGameOpening";

export type ObjectiveFlagReader = {
  has(flag: string): boolean;
};

const OBJECTIVE_HINTS: Readonly<Record<string, readonly string[]>> = {
  "act1-cold-signal": [
    "MiFella saw the other Bosch go uphill. Follow the north road to the meteor.",
    "Start at the meteor uphill from Bosch's house. That is where the cold signal moved."
  ],
  "act1-card-clique": [
    "The arcade crowd west of Bosch's block is passing his face around. Start there.",
    "If you want the first bad copy, follow the street west to the MONS LINK arcade."
  ],
  "act1-returnless-king": [
    "The clique folded. Their relay boss is waiting farther north at the gate.",
    "Keep north from the arcade. The Returnless King is holding the relay shut."
  ],
  "act1-malady": [
    "The relay is open. Follow the north road until the threshold tries to classify you.",
    "Malady is past the relay gate, up the north road."
  ],
  "act1-munch": [
    "Munch is waiting at the north threshold. Do not leave him filed as missing.",
    "Before you leave town, meet Munch where Malady fell."
  ],
  "act1-leave-signal-town": [
    "The northern route is open now. Keep going past the threshold.",
    "Morningside is behind you. Postwick is reached by the road beyond the north gate."
  ],
  "act2-reach-postwick": [
    "Postwick sits down the southern route. The signs are more reliable than the town.",
    "Take the long southern road until the Registry starts pretending it knows you."
  ],
  "act2-postwick-registry": [
    "Postwick's Registry is the pressure point. Find the town records and confront it.",
    "The Registry boss is inside the records district. Clear that before the arena."
  ],
  "act2-arena-venue-1": [
    "The first Venue fight is ready in Postwick's arena.",
    "Registry cleared? Then the arena wants its first certified version of you."
  ],
  "act2-arena-venue-2": [
    "Stay in the arena. The second Venue is already calling the first win a draft.",
    "One fight is a rumor. Win the arena's second Venue."
  ],
  "act2-arena-venue-3": [
    "The third Venue is the championship. Finish the arena sequence.",
    "Two wins got filed as rehearsal. The final arena fight makes it official."
  ],
  "act2-leave-postwick": [
    "The Registry and arena are done. Leave Postwick by the northern road.",
    "Postwick has nothing left but paperwork. Take the north exit."
  ]
};

export function currentObjective(flags: ObjectiveFlagReader, objectives: Objectives | undefined): ObjectiveEntry | undefined {
  if (
    objectives?.objectives.some((objective) => objective.id === "act1-card-clique") &&
    !flags.has(INTRO_METEOR_BEAT_FIRED_FLAG)
  ) {
    return {
      id: "act1-cold-signal",
      when: { requireFlags: [], blockFlags: [INTRO_METEOR_BEAT_FIRED_FLAG] },
      text: "Follow the road uphill and inspect the cold signal near the meteor."
    };
  }
  const matches = (objective: ObjectiveEntry): boolean =>
    objective.when.requireFlags.every((flag) => flags.has(flag)) &&
    objective.when.blockFlags.every((flag) => !flags.has(flag));
  return objectives?.objectives.find((objective) => objective.id !== "fallback" && matches(objective))
    ?? objectives?.objectives.find((objective) => objective.id === "fallback" && matches(objective));
}

export function currentObjectiveNpcHint(
  flags: ObjectiveFlagReader,
  objectives: Objectives | undefined,
  npcId: number
): string | undefined {
  const objective = currentObjective(flags, objectives);
  if (!objective) {
    return undefined;
  }
  const hints = objective.npcHints?.length
    ? objective.npcHints
    : OBJECTIVE_HINTS[objective.id] ?? [objective.text];
  const index = Math.abs(Math.trunc(npcId)) % hints.length;
  return hints[index];
}
