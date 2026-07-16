import type {
  BattleData,
  CustomDialogue,
  CutsceneStep,
  Cutscenes,
  Objectives,
  OpeningClarity,
  SpriteOverrides,
  StoryTriggers
} from "@eb/schemas";
import type { RuntimeCustomDialogue } from "./customDialogueLookup";

export function applyOpeningClarityCutscenes(
  cutscenes: Cutscenes | undefined,
  clarity: OpeningClarity | undefined
): Cutscenes | undefined {
  if (!cutscenes || !clarity) {
    return cutscenes;
  }
  return {
    ...cutscenes,
    cutscenes: cutscenes.cutscenes.map((cutscene) => {
      const pages = clarity.cutsceneDialogueById[cutscene.id];
      if (!pages) {
        return cutscene;
      }
      let replaced = false;
      const steps: CutsceneStep[] = [];
      for (const step of cutscene.steps) {
        if (step.op !== "dialogue") {
          steps.push(step);
          continue;
        }
        if (!replaced) {
          steps.push({ op: "dialogue", pages });
          replaced = true;
        }
      }
      return {
        ...cutscene,
        steps
      };
    })
  };
}

/** Apply the additive opening overlay after the broader authored layers resolve. */
export function applyOpeningClarityDialogue(
  dialogue: CustomDialogue | RuntimeCustomDialogue,
  clarity: OpeningClarity | undefined
): RuntimeCustomDialogue {
  if (!clarity) {
    return dialogue;
  }
  return {
    ...dialogue,
    byNpcId: {
      ...dialogue.byNpcId,
      ...clarity.dialogue.byNpcId
    },
    byTextPointer: {
      ...dialogue.byTextPointer,
      ...clarity.dialogue.byTextPointer
    },
    variantsByNpcId: {
      ...("variantsByNpcId" in dialogue ? dialogue.variantsByNpcId ?? {} : {}),
      ...clarity.dialogueVariantsByNpcId
    }
  };
}

export function applyOpeningClarityStoryTriggers(
  storyTriggers: StoryTriggers | undefined,
  clarity: OpeningClarity | undefined
): StoryTriggers | undefined {
  if (!storyTriggers || !clarity) {
    return storyTriggers;
  }
  return {
    ...storyTriggers,
    triggers: storyTriggers.triggers.map((trigger) => {
      const dialogue = clarity.storyTriggerDialogueById[trigger.id];
      return dialogue ? { ...trigger, dialogue: [...dialogue] } : trigger;
    })
  };
}

export function applyOpeningClarityObjectives(
  objectives: Objectives | undefined,
  clarity: OpeningClarity | undefined
): Objectives | undefined {
  if (!objectives || !clarity) {
    return objectives;
  }
  return {
    ...objectives,
    objectives: objectives.objectives.map((objective) => {
      const text = clarity.objectiveTextById[objective.id];
      const npcHints = clarity.objectiveNpcHintsById[objective.id];
      return text || npcHints
        ? { ...objective, ...(text ? { text } : {}), ...(npcHints ? { npcHints: [...npcHints] } : {}) }
        : objective;
    })
  };
}

export function applyOpeningClaritySprites(
  sprites: SpriteOverrides | undefined,
  clarity: OpeningClarity | undefined
): SpriteOverrides | undefined {
  if (!clarity) {
    return sprites;
  }
  return {
    schema: "swagbound.sprite-overrides.v1",
    ...sprites,
    byNpcId: {
      ...(sprites?.byNpcId ?? {}),
      ...clarity.spriteOverrides.byNpcId
    },
    byEnemyId: {
      ...(sprites?.byEnemyId ?? {}),
      ...clarity.spriteOverrides.byEnemyId
    },
    overworldByEnemyId: {
      ...(sprites?.overworldByEnemyId ?? {}),
      ...clarity.spriteOverrides.overworldByEnemyId
    }
  };
}

/**
 * Add one stable tutorial encounter. Unlike the old enemy-214 lookup, sprite
 * curation or boss tuning elsewhere cannot silently rewrite the first battle.
 */
export function applyOpeningClarityBattle(
  battle: BattleData | undefined,
  clarity: OpeningClarity | undefined
): BattleData | undefined {
  if (!battle || !clarity) {
    return battle;
  }
  const enemy = clarity.tutorialBattle.enemy;
  const group = clarity.tutorialBattle.group;
  const enemies = battle.enemies.map((entry) => {
    const name = clarity.battleEnemyNamesById[String(entry.id)];
    return name ? { ...entry, name } : entry;
  });
  return {
    ...battle,
    enemies: [...enemies.filter((entry) => entry.id !== enemy.id), enemy],
    groups: [...battle.groups.filter((entry) => entry.id !== group.id), group]
  };
}
