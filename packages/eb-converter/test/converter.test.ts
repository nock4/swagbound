import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDialoguePages, ManifestSchema, resolveScriptReference } from "@eb/schemas";
import { convertProject, parseCcsFile, readNpcReferences } from "../src/index";
import { validateGeneratedOutput } from "../src/validate";

describe("schemas", () => {
  it("validates generated manifests", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-converter-"));
    try {
      const result = await convertProject({
        project: path.join(temp, "missing-project"),
        out: path.join(temp, "generated")
      });
      expect(() => ManifestSchema.parse(result.manifest)).not.toThrow();
      expect(result.manifest.sourceProject.exists).toBe(false);
      expect(result.manifest.warnings.some((warning) => warning.code === "missing_project")).toBe(true);
      expect(result.manifest.files.npcs).toBe("npcs.json");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("NPC reference scanner", () => {
  it("detects robot.hello_world with source location", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-npc-scan-"));
    try {
      await mkdir(path.join(temp, "metadata"), { recursive: true });
      await writeFile(path.join(temp, "metadata", "npc_table.yml"), "name: robot\nscript: robot.hello_world\n", "utf8");

      const result = await readNpcReferences(temp);

      expect(result.references).toHaveLength(1);
      expect(result.references[0]).toMatchObject({
        reference: "robot.hello_world",
        scriptFileStem: "robot",
        label: "hello_world",
        sourceLocation: { file: "metadata/npc_table.yml", line: 2, column: 9 },
        raw: "script: robot.hello_world",
        contextType: "npc"
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("ignores binary files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-npc-scan-"));
    try {
      await writeFile(path.join(temp, "npc.bin"), Buffer.from("robot.hello_world"));
      const result = await readNpcReferences(temp);

      expect(result.counts.references).toBe(0);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("script resolver and dialogue playback", () => {
  it("resolves robot.hello_world from generated script commands", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-resolver-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n"Page one" next\n"Page two" end\n', "utf8");

      const result = await convertProject({ project, out: path.join(temp, "generated") });
      const resolved = resolveScriptReference(result.scripts, "robot.hello_world");

      expect(resolved?.commands.map((command) => command.cmd)).toEqual(["text", "next", "text", "end"]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("groups text, next, end, and unknown commands into dialogue pages", () => {
    const parsed = parseCcsFile("ccscript/robot.ccs", 'hello_world:\n"First" next\nmystery\n"Second" end\n');
    const pages = buildDialoguePages(parsed.commands.slice(1));

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ text: "First", ended: false });
    expect(pages[1]).toMatchObject({ text: "Second", ended: true });
    expect(pages[1].unknownCommands[0]).toMatchObject({ cmd: "unknown", raw: "mystery" });
  });
});

describe("generated validation", () => {
  it("validates generated files including npcs.json", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-validation-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await mkdir(path.join(project, "metadata"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n"Hi" end\n', "utf8");
      await writeFile(path.join(project, "metadata", "npc_table.yml"), "script: robot.hello_world\n", "utf8");
      const generated = await convertProject({ project, out });

      const result = await validateGeneratedOutput(out);

      expect(generated.manifest.files).toMatchObject({
        scripts: "scripts.json",
        npcs: "npcs.json",
        spriteGroups: "sprite-groups.json",
        validationReport: "validation-report.json"
      });
      expect(generated.manifest.counts.npcReferences).toBe(1);
      expect(result.ok).toBe(true);
      expect(result.generatedFiles).toContain("npcs.json");
      expect(result.npcReferences).toBe(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("throws for missing or invalid generated files", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-validation-"));
    try {
      await expect(validateGeneratedOutput(temp)).rejects.toThrow("missing_manifest");
      await writeFile(path.join(temp, "manifest.json"), "{\"bad\":true}\n", "utf8");
      await expect(validateGeneratedOutput(temp)).rejects.toThrow("schemaVersion");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

describe("CCScript parser v0", () => {
  it("parses tutorial-style hello_world text and end command", () => {
    const parsed = parseCcsFile("ccscript/robot.ccs", 'hello_world:\n    "@Hello World!" end\n');

    expect(parsed.labels).toEqual(["hello_world"]);
    expect(parsed.commands.map((command) => command.cmd)).toEqual(["label", "text", "end"]);
    expect(parsed.commands[1]).toMatchObject({ cmd: "text", value: "@Hello World!" });
  });

  it("preserves unknown commands", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", "hello_world:\nwarp_somewhere\n");

    expect(parsed.commands.at(-1)).toMatchObject({ cmd: "unknown", raw: "warp_somewhere" });
    expect(parsed.warnings.at(0)?.code).toBe("unknown_ccscript_command");
  });

  it("ignores blank lines and line comments outside quoted text", () => {
    const parsed = parseCcsFile("ccscript/example.ccs", [
      "",
      "  // full-line comment",
      "hello_world: // inline comment",
      '  "http://example.test//kept" next // trailing comment',
      "",
      "end"
    ].join("\n"));

    expect(parsed.commands.map((command) => command.cmd)).toEqual(["label", "text", "next", "end"]);
    expect(parsed.commands[1]).toMatchObject({ value: "http://example.test//kept" });
  });
});

describe("fixture hints", () => {
  it("detects tutorial files without using real extracted data", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-converter-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await mkdir(path.join(project, "SpriteGroups"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n    "@Hello World!" end\n', "utf8");
      await writeFile(path.join(project, "SpriteGroups", "005.png"), pngStub(), "binary");

      const result = await convertProject({ project, out: path.join(temp, "generated") });

      expect(result.manifest.sourceProject.tutorialFixtureHints).toMatchObject({
        hasRobotCcs: true,
        hasHelloWorldLabel: true,
        hasRobotHelloWorldContent: true,
        hasSpriteGroup005: true
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

function pngStub(): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(16, 16);
  buffer.writeUInt32BE(24, 20);
  return buffer;
}
