#!/usr/bin/env node

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { convert } from "./pipeline.js";
import { createDevServer, DEV_RELOAD_SCRIPT } from "./server/dev-server.js";

const program = new Command();

program
  .name("glyphmark")
  .description("Convert Pathfinder 2e scribe files to styled HTML")
  .version("0.1.0");

function buildFile(
  inputPath: string,
  outDir: string,
  opts?: { devScript?: string },
): void {
  const input = fs.readFileSync(inputPath, "utf-8");
  const html = convert(input, { devScript: opts?.devScript });

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outDir, `${baseName}.html`);
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`  ${path.relative(process.cwd(), inputPath)} → ${path.relative(process.cwd(), outputPath)}`);
}

function getScribeFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => (f.endsWith(".scribe")) && !f.startsWith("."))
    .map((f) => path.join(dir, f));
}

function buildAll(
  target: string,
  outDir: string,
  opts?: { devScript?: string },
): void {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    buildFile(target, outDir, opts);
    return;
  }

  const files = getScribeFiles(target);
  if (files.length === 0) {
    console.log("No .scribe found.");
    return;
  }

  console.log(`Building ${files.length} file${files.length === 1 ? "" : "s"}...`);
  for (const file of files) {
    try {
      buildFile(file, outDir, opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Error: ${path.basename(file)}: ${msg}`);
    }
  }
}

// build command
program
  .command("build [target]")
  .description("Convert .scribe files to HTML")
  .option("-o, --out <dir>", "Output directory (default: same as source)")
  .action((target: string | undefined, options: { out?: string }) => {
    const inputPath = path.resolve(target ?? ".");
    const outDir = options.out ? path.resolve(options.out) : path.dirname(inputPath);

    if (options.out) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const stat = fs.statSync(inputPath);
    const resolvedOutDir = stat.isFile() ? (options.out ? outDir : path.dirname(inputPath)) : outDir;

    buildAll(inputPath, resolvedOutDir);
    console.log("Done.");
  });

// watch command
program
  .command("watch [target]")
  .description("Watch .scribe files and rebuild on changes")
  .option("-o, --out <dir>", "Output directory")
  .action(async (target: string | undefined, options: { out?: string }) => {
    const inputDir = path.resolve(target ?? ".");
    const outDir = options.out ? path.resolve(options.out) : inputDir;

    if (options.out) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    buildAll(inputDir, outDir);

    const { watch } = await import("chokidar");
    const watcher = watch(path.join(inputDir, "**/*.{scribe}"), {
      ignoreInitial: true,
    });

    console.log(`\nWatching for changes in ${path.relative(process.cwd(), inputDir)}...`);

    const rebuild = (filePath: string) => {
      console.log(`\nChanged: ${path.relative(process.cwd(), filePath)}`);
      try {
        buildFile(filePath, outDir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Error: ${msg}`);
      }
    };

    watcher.on("change", rebuild);
    watcher.on("add", rebuild);
  });

// serve command
program
  .command("serve [target]")
  .description("Watch, build, and serve with live reload")
  .option("-o, --out <dir>", "Output directory")
  .option("-p, --port <port>", "Server port", "3000")
  .action(
    async (
      target: string | undefined,
      options: { out?: string; port: string },
    ) => {
      const inputDir = path.resolve(target ?? ".");
      const outDir = options.out ? path.resolve(options.out) : inputDir;
      const port = parseInt(options.port, 10);

      if (options.out) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      buildAll(inputDir, outDir, { devScript: DEV_RELOAD_SCRIPT });

      const { server, notifyReload } = createDevServer(outDir, port);

      server.listen(port, () => {
        console.log(`\n  Serving at http://localhost:${port}`);
        console.log(
          `  Watching ${path.relative(process.cwd(), inputDir)} for changes...\n`,
        );
      });

      const { watch } = await import("chokidar");
      const watcher = watch(path.join(inputDir, "**/*.{scribe}"), {
        ignoreInitial: true,
      });

      const rebuild = (filePath: string) => {
        console.log(`  Rebuilt: ${path.relative(process.cwd(), filePath)}`);
        try {
          buildFile(filePath, outDir, { devScript: DEV_RELOAD_SCRIPT });
          notifyReload();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  Error: ${msg}`);
        }
      };

      watcher.on("change", rebuild);
      watcher.on("add", rebuild);
    },
  );

program.parse();
