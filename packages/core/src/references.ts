import { parseAdventure } from "./frontmatter.ts";

/**
 * Relative paths of the images an Adventure Markdown document uses: its cover and every
 * image embed. URLs with a scheme are left out; they are not part of the bundle.
 */
export function adventureAssets(markdown: string): string[] {
  const { meta, body } = parseAdventure(markdown);
  const paths = new Set<string>();
  if (meta.cover) paths.add(meta.cover);
  for (const match of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (match[1]) paths.add(match[1]);
  }
  return [...paths].filter((path) => !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith("/"));
}
