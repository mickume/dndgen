#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { type AssembleResult, adventureAssets, assemble, renderHtml } from "@dndgen/core";
import { loadCampaign } from "./files.ts";
import { renderRemote } from "./remote.ts";

const USAGE = `Usage: dndgen <command> [options] <campaign-dir | adventure.md>

Commands:
  assemble   Write the campaign as one Adventure Markdown file
  preview    Write a print-ready HTML page that opens from disk
  render     Render a PDF with a dndgen Worker

Options:
  -o, --output <path>      Output file (default: <campaign>/<command output> in the current directory)
      --references         Include references/*.md as appendices
      --summary            Include chapters-summary.md as an appendix
      --theme <name>       Theme (default: dndbeyond)
      --endpoint <url>     Worker URL for render (default: $DNDGEN_ENDPOINT or http://localhost:8787)
      --token <token>      API token for render (default: $DNDGEN_TOKEN)
  -h, --help               Show this help
`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      references: { type: "boolean", default: false },
      summary: { type: "boolean", default: false },
      theme: { type: "string" },
      endpoint: { type: "string" },
      token: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, input] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 2;
  }
  if (!input) {
    process.stderr.write(`dndgen ${command}: missing <campaign-dir | adventure.md>\n\n${USAGE}`);
    return 2;
  }
  const source = resolve(input);
  const name = basename(source).replace(/\.md$/, "");
  const options = {
    includeReferences: values.references,
    includeSummary: values.summary,
    ...(values.theme ? { theme: values.theme } : {}),
  };

  switch (command) {
    case "assemble": {
      const result = await assembleCampaign(source, options);
      const output = values.output ?? `${name}.adventure.md`;
      await writeFile(output, result.markdown);
      report(result, output);
      return 0;
    }
    case "preview": {
      const { markdown, root } = await adventureOf(source, options);
      const core = new URL("../assets/", import.meta.resolve("@dndgen/core"));
      const { html } = renderHtml(markdown, {
        baseUrl: pathToFileURL(`${root}/`).href,
        assetUrl: core.href,
      });
      const output = values.output ?? `${name}.html`;
      await writeFile(output, html);
      process.stdout.write(
        `wrote ${output}; open it in Chrome and print to PDF, or use \`dndgen render\`\n`,
      );
      return 0;
    }
    case "render": {
      const output = values.output ?? `${name}.pdf`;
      const endpoint = values.endpoint ?? process.env.DNDGEN_ENDPOINT ?? "http://localhost:8787";
      const token = values.token ?? process.env.DNDGEN_TOKEN;
      const { markdown, root, assets } = await adventureOf(source, options);
      await renderRemote({
        markdown,
        root,
        assets,
        endpoint,
        token,
        output,
        log: (line) => process.stdout.write(`${line}\n`),
      });
      return 0;
    }
    default:
      process.stderr.write(`dndgen: unknown command ${command}\n\n${USAGE}`);
      return 2;
  }
}

async function assembleCampaign(
  dir: string,
  options: Parameters<typeof assemble>[1],
): Promise<AssembleResult> {
  return assemble(await loadCampaign(dir), options);
}

/** The Adventure Markdown for a campaign directory or an already assembled file. */
async function adventureOf(
  source: string,
  options: Parameters<typeof assemble>[1],
): Promise<{ markdown: string; root: string; assets: string[] }> {
  if ((await stat(source)).isDirectory()) {
    const result = await assembleCampaign(source, options);
    for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
    return { markdown: result.markdown, root: source, assets: result.assets };
  }
  const markdown = await readFile(source, "utf8");
  const root = dirname(source);
  const existing: string[] = [];
  for (const path of adventureAssets(markdown)) {
    if (await stat(join(root, path)).catch(() => undefined)) existing.push(path);
    else process.stderr.write(`warning: image ${path} does not exist\n`);
  }
  return { markdown, root, assets: existing };
}

function report(result: AssembleResult, output: string): void {
  for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
  process.stdout.write(`wrote ${output} (${result.meta.system}, ${result.assets.length} images)\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`dndgen: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
