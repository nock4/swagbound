import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

type Step = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function checkCommandForMode(mode: string): string[] {
  if (mode === "bedroom") {
    return ["proof:check:bedroom"];
  }
  if (mode === "roadblock-706") {
    return ["proof:check:roadblock-706"];
  }
  if (mode === "roadblock-707") {
    return ["proof:check:roadblock-707"];
  }
  return ["proof:check", "--", "--expect-placement", mode];
}

async function runPnpm(args: string[]): Promise<Step> {
  const command = `pnpm ${args.join(" ")}`;
  try {
    const result = await execFileAsync("pnpm", args, {
      cwd: projectRoot,
      maxBuffer: 1024 * 1024 * 8
    });
    return { command, exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      command,
      exitCode: typeof failed.code === "number" ? failed.code : 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? ""
    };
  }
}

function fenced(value: string): string {
  return `\`\`\`text\n${sanitize(value).trim() || "(no output)"}\n\`\`\``;
}

export function sanitizePacketOutput(value: string): string {
  return value.split(projectRoot).join("<repo>");
}

function sanitize(value: string): string {
  return sanitizePacketOutput(value);
}

async function main(): Promise<void> {
  const mode = argValue("--mode", "bedroom");
  const outputPath = argValue("--out", ".codex/proof-packets/latest-proof-packet.md");
  const snapshotPath = outputPath.replace(/\.md$/, "-snapshot.json");
  const steps: Step[] = [];

  steps.push(await runPnpm(["convert"]));
  steps.push(await runPnpm(["validate"]));
  steps.push(await runPnpm(checkCommandForMode(mode)));
  steps.push(await runPnpm(["proof:snapshot", "--", "--out", snapshotPath]));

  const ok = steps.every((step) => step.exitCode === 0);
  const markdown = [
    "# Local Proof Packet",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Mode: ${mode}`,
    `Status: ${ok ? "PASS" : "FAIL"}`,
    `Snapshot: ${snapshotPath}`,
    "",
    "This packet is local-only and ignored by git. It records text/YML fixture",
    "invariants and generated JSON state immediately before an emulator proof",
    "clip. It does not contain ROM bytes, extracted assets, or absolute paths.",
    "",
    ...steps.flatMap((step) => [
      `## ${step.command}`,
      "",
      `Exit: ${step.exitCode}`,
      "",
      "### stdout",
      "",
      fenced(step.stdout),
      "",
      "### stderr",
      "",
      fenced(step.stderr),
      ""
    ])
  ].join("\n");

  const absoluteOutput = path.resolve(projectRoot, outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${markdown}\n`, "utf8");
  console.log(JSON.stringify({ ok, packet: path.relative(projectRoot, absoluteOutput), snapshot: snapshotPath }, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
