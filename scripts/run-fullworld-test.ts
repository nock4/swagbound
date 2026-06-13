import { spawn } from "node:child_process";
import { convertProject } from "../packages/eb-converter/src/index";

const GENERATED_OUT = "apps/game/public/generated";

async function main(): Promise<void> {
  let exitCode = 1;
  try {
    console.log("Generating full-world review data...");
    await convertProject({
      project: "external/coilsnake-full",
      worldMode: "full",
      out: GENERATED_OUT
    });

    exitCode = await run(
      "pnpm",
      ["exec", "playwright", "test", "--project", "full-world-chromium"],
      {
        ...cleanEnv(),
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
        out: GENERATED_OUT
      });
    } catch (restoreError) {
      console.error(`Region-mode restore failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
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
