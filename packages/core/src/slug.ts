/**
 * Heading anchors the way GitHub generates them, which is the convention lorewright
 * campaigns use for their cross-links: lowercase, punctuation stripped, spaces to hyphens.
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** Hands out unique slugs, suffixing repeats with -1, -2… like GitHub. */
export class Slugger {
  readonly #seen = new Map<string, number>();

  next(text: string): string {
    const base = slug(text);
    let id = base;
    let n = this.#seen.get(base) ?? 0;
    while (this.#seen.has(id)) {
      n += 1;
      id = `${base}-${n}`;
    }
    this.#seen.set(base, n);
    this.#seen.set(id, 0);
    return id;
  }
}

/** Plain text of an inline markdown string, for slugging headings that contain markup. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}
