import type { ObjectiveEntry, Objectives } from "@eb/schemas";

export type ObjectiveFlagReader = {
  has(flag: string): boolean;
};

export function currentObjective(flags: ObjectiveFlagReader, objectives: Objectives | undefined): ObjectiveEntry | undefined {
  return objectives?.objectives.find((objective) =>
    objective.when.requireFlags.every((flag) => flags.has(flag)) &&
    objective.when.blockFlags.every((flag) => !flags.has(flag))
  );
}
