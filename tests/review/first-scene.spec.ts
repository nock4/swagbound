import { expect, test } from "@playwright/test";

type FirstSceneDebug = {
  dialogueOpen: boolean;
  dialogueText: string;
  targetReference: string;
  tutorial?: {
    steps: number;
    passed: number;
    failed: number;
    blocked: number;
    unknown: number;
  };
  resolveStatus: string;
};

test("first scene loads tutorial data and plays imported dialogue", async ({ page }) => {
  await page.goto("/");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  await expect.poll(() => readDebug(page), {
    message: "first scene debug state should load generated data"
  }).toMatchObject({
    targetReference: "robot.hello_world",
    tutorial: { steps: 16, passed: 16, failed: 0, blocked: 0, unknown: 0 }
  });

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2_850);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("Enter");

  await expect.poll(() => readDebug(page), {
    message: "interacting with marker should open imported dialogue"
  }).toMatchObject({
    dialogueOpen: true,
    dialogueText: "@Hello World!",
    targetReference: "robot.hello_world"
  });
});

async function readDebug(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<FirstSceneDebug | undefined> {
  return page.evaluate(() => (globalThis as unknown as { __firstSceneDebug?: FirstSceneDebug }).__firstSceneDebug);
}
