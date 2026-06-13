import { buildContentSlice, DEFAULT_GENERATED_OUT, DEFAULT_SLICE_SOURCE } from "./build";

type CliArgs = {
  sourceFile: string;
  out: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    sourceFile: DEFAULT_SLICE_SOURCE,
    out: DEFAULT_GENERATED_OUT
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      args.sourceFile = argv[index + 1] ?? args.sourceFile;
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] ?? args.out;
      index += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const artifacts = await buildContentSlice({
    sourceFile: args.sourceFile,
    out: args.out
  });
  console.log(JSON.stringify({
    ok: true,
    source: args.sourceFile,
    out: args.out,
    title: artifacts.source.title,
    world: {
      widthTiles: artifacts.source.widthTiles,
      heightTiles: artifacts.source.heightTiles,
      npcs: artifacts.world.counts.npcs,
      solidCells: artifacts.world.counts.solidCells
    },
    scripts: artifacts.scripts.counts,
    sprites: artifacts.sprites.counts
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
