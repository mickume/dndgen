import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { CampaignSource } from "@dndgen/core";

/** Directories of a lorewright campaign that never hold book content. */
const SKIPPED = new Set(["node_modules", ".git", "takes", "discards"]);

/** Reads a campaign directory: markdown as text, everything else by path only. */
export async function loadCampaign(dir: string): Promise<CampaignSource> {
  const documents = new Map<string, string>();
  const assets = new Set<string>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/");
    if (path.split("/").some((part) => SKIPPED.has(part) || part.startsWith("."))) continue;
    if (path.endsWith(".md") && !path.startsWith("art/")) {
      documents.set(path, await readFile(join(dir, path), "utf8"));
    } else {
      assets.add(path);
    }
  }
  return { documents, assets };
}
