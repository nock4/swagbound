import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { convertProject } from "../packages/eb-converter/src/index";

const GENERATED_OUT = "apps/game/public/generated";
const TEMP_BUILD_OUT = "apps/game/dist";

async function main(): Promise<void> {
  let exitCode = 1;
  try {
    console.log("Generating battle review data...");
    await convertProject({
      project: "external/coilsnake-full",
      out: GENERATED_OUT,
      battle: true
    });

    exitCode = await run(
      "pnpm",
      ["exec", "playwright", "test", "--project", "battle-chromium"],
      {
        ...cleanEnv(),
        EB_PROJECT: "external/coilsnake-full",
        EB_BATTLE: "1",
        PLAYWRIGHT_DISABLE_REPLAY: "1"
      }
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      console.log("Restoring region-mode generated data...");
      await convertProject({
        project: "external/coilsnake-project",
        worldMode: "region",
        out: GENERATED_OUT,
        battle: false
      });
    } catch (restoreError) {
      console.error(`Region-mode restore failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      exitCode = 1;
    }

    try {
      await rm(TEMP_BUILD_OUT, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`Temp build cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      exitCode = 1;
    }
  }

  process.exitCode = exitCode;
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.REPLAY_API_KEY = "";
  return env;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env
    });
    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("close", (code, signal) => {
      if (signal) {
        console.error(`Command terminated by ${signal}`);
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

void main();
