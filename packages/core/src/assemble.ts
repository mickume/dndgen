import { Lexer, type Token, type Tokens } from "marked";
import {
  type AssembleOptions,
  type CampaignDocument,
  type CampaignSource,
  planDocuments,
  resolvePath,
} from "./campaign.ts";
import { type AdventureMeta, formatFrontMatter, type GameSystem } from "./frontmatter.ts";
import { plainText, Slugger } from "./slug.ts";

export interface AssembleResult {
  /** The whole campaign as one Adventure Markdown document. */
  markdown: string;
  meta: AdventureMeta;
  /** Campaign-relative paths of the images the document uses, all of which exist. */
  assets: string[];
  /** Problems worth telling the author about: missing images, broken links. */
  warnings: string[];
}

type Figure = "character" | "location" | "scene" | "item" | "map" | "image";

/** Context for the blocks of one document while it is being converted. */
interface Context {
  doc: CampaignDocument;
  /** Inside a handout: every line break is kept. */
  handout: boolean;
}

const STATS_DAGGERHEART = /\*\*Difficulty:?\*\*/;
const STATS_5E_AC = /\*\*(?:AC|Armor Class)\*\*/;
const STATS_5E_HP = /\*\*(?:HP|Hit Points)\*\*/;
const IMAGE_ONLY = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const NAV_ITEM = /^\[[^\]]+\]\([^)\s]+\.md(?:#[^)\s]*)?\)\s*$/;
const SIDEBAR_TITLE =
  /^\*\*\s*(?:\p{Extended_Pictographic}|DM Tip|Sidebar|Variant|Lore\b|Note\b)/iu;
const KEY_VALUE_LINE = /^\*\*[^*]+:\*\*/;

/**
 * Turns a lorewright campaign into a single Adventure Markdown document: front matter,
 * then the introduction, the chapters and the appendices in book order, with cross-file
 * links pointing at ids inside the one document and lorewright's conventions (read-aloud
 * blockquotes, stat blocks, sidebars, art embeds) turned into explicit blocks.
 */
export function assemble(source: CampaignSource, options: AssembleOptions = {}): AssembleResult {
  return new Assembler(source, options).run();
}

class Assembler {
  readonly #source: CampaignSource;
  readonly #options: AssembleOptions;
  readonly #docs: CampaignDocument[];
  readonly #tokens = new Map<string, Token[]>();
  /** "path#slug" and "path" → id in the assembled document. */
  readonly #anchors = new Map<string, string>();
  /** Id of every top-level heading token. */
  readonly #ids = new Map<Token, string>();
  /** Printed text of every heading id; link labels that are file names get replaced by it. */
  readonly #titles = new Map<string, string>();
  readonly #assets = new Set<string>();
  readonly #printed = new Set<string>();
  readonly #warnings: string[] = [];
  #title = "";
  #system: GameSystem | undefined;

  constructor(source: CampaignSource, options: AssembleOptions) {
    this.#source = source;
    this.#options = options;
    this.#docs = planDocuments(source, options);
  }

  run(): AssembleResult {
    for (const doc of this.#docs) {
      const tokens = new Lexer({ gfm: true }).lex(doc.text);
      this.#tokens.set(doc.path, tokens);
      this.#indexAnchors(doc, tokens);
    }
    const overview = this.#tokens.get(this.#docs[0]?.path ?? "") ?? [];
    const h1 = overview.find((t): t is Tokens.Heading => t.type === "heading" && t.depth === 1);
    this.#title = h1 ? plainText(h1.text) : "Untitled Adventure";

    const meta: AdventureMeta = {
      title: this.#title,
      system: "5e",
      theme: this.#options.theme ?? "dndbeyond",
    };
    const subtitle = this.#subtitle(overview);
    if (subtitle) meta.subtitle = subtitle;

    let appendix = 0;
    for (const doc of this.#docs) {
      const letter =
        doc.role === "appendix" || doc.role === "briefing"
          ? String.fromCharCode(65 + appendix++)
          : "";
      const h1 = this.#tokens
        .get(doc.path)
        ?.find((t): t is Tokens.Heading => t.type === "heading" && t.depth === 1);
      this.#titles.set(doc.key, this.#docTitle(doc, h1 ? plainText(h1.text) : doc.key, letter));
    }
    const body = this.#docs.flatMap((doc) => this.#document(doc));

    meta.system = this.#system ?? "5e";
    const cover = this.#chooseCover();
    if (cover) {
      meta.cover = cover;
      this.#assets.add(cover);
    }
    return {
      markdown: `${formatFrontMatter(meta)}\n${body.join("\n\n")}\n`,
      meta,
      assets: [...this.#assets].sort(),
      warnings: this.#warnings,
    };
  }

  #indexAnchors(doc: CampaignDocument, tokens: Token[]): void {
    const slugger = new Slugger();
    let first = true;
    this.#anchors.set(doc.path, doc.key);
    for (const token of tokens) {
      if (token.type !== "heading") continue;
      const slug = slugger.next(plainText(token.text));
      const id = first && token.depth === 1 ? doc.key : `${doc.key}--${slug}`;
      if (token.depth === 1) first = false;
      this.#anchors.set(`${doc.path}#${slug}`, id);
      this.#ids.set(token, id);
      this.#titles.set(id, plainText(token.text));
    }
  }

  #subtitle(tokens: Token[]): string | undefined {
    const first = tokens.find(
      (t) => t.type !== "space" && !(t.type === "heading" && t.depth === 1),
    );
    if (first?.type !== "paragraph") return undefined;
    const match = /^\*([^*\n]+)\*$/.exec(first.text.trim());
    return match?.[1]?.trim();
  }

  #document(doc: CampaignDocument): string[] {
    const tokens = this.#tokens.get(doc.path) ?? [];
    const ctx: Context = { doc, handout: false };
    const out: string[] = [];
    let i = 0;

    // Title, then the subtitle and the "**Key:** value" lines lorewright puts under it.
    const titleIndex = tokens.findIndex((t) => t.type === "heading" && t.depth === 1);
    const titleToken = titleIndex === -1 ? undefined : (tokens[titleIndex] as Tokens.Heading);
    out.push(`# ${this.#titles.get(doc.key)} {#${doc.key}}`);
    if (titleToken) {
      out.push(...this.#blocks(tokens.slice(0, titleIndex), ctx));
      i = titleIndex + 1;
      if (doc.role === "introduction" && this.#subtitle(tokens) !== undefined) {
        while (tokens[i]?.type === "space") i++;
        i++;
      }
      const info: string[] = [];
      for (;;) {
        while (tokens[i]?.type === "space") i++;
        const token = tokens[i];
        if (token?.type !== "paragraph" || !isKeyValues(token.text)) break;
        info.push(this.#links(token.text, ctx).split("\n").join("\\\n"));
        this.#detectSystem(token.text);
        i++;
      }
      if (info.length > 0) out.push(block("info", info.join("\n\n")));
    }
    out.push(...this.#blocks(tokens.slice(i), ctx));
    return out;
  }

  #docTitle(doc: CampaignDocument, title: string, letter: string): string {
    if (doc.role === "introduction") return "Introduction";
    const escaped = this.#title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let name = title
      .replace(new RegExp(`^${escaped}\\s*[—–:-]\\s*`, "i"), "")
      .replace(new RegExp(`\\s*[—–-]\\s*${escaped}$`, "i"), "")
      .replace(/^Appendix [A-Z]+\s*[:.—–-]\s*/i, "")
      .trim();
    if (!name) name = title;
    return letter ? `Appendix ${letter}: ${name}` : name;
  }

  /** Converts a run of block tokens to Adventure Markdown chunks. */
  #blocks(tokens: Token[], ctx: Context): string[] {
    const out: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i] as Token;
      switch (token.type) {
        case "space":
          break;
        case "hr": {
          const end = this.#sidebarEnd(tokens, i);
          if (end !== -1) {
            out.push(this.#sidebar(tokens.slice(i + 1, end), ctx));
            i = end;
          } else if (ctx.handout) {
            out.push("---");
          }
          break;
        }
        case "heading": {
          const end = sectionEnd(tokens, i);
          if (isNavigation(tokens.slice(i + 1, end))) {
            i = end - 1;
            break;
          }
          const statEnd = this.#statBlockEnd(tokens, i, end);
          if (statEnd !== -1) {
            const inner = [
              this.#heading(token as Tokens.Heading, ctx),
              ...this.#statBlock(tokens.slice(i + 1, statEnd), ctx),
            ];
            out.push(block(`monster,frame,${this.#system ?? "5e"}`, inner.join("\n\n")));
            i = statEnd - 1;
          } else {
            out.push(this.#heading(token as Tokens.Heading, ctx));
          }
          break;
        }
        case "blockquote":
          out.push(this.#blockquote(token as Tokens.Blockquote, ctx));
          break;
        case "paragraph":
          out.push(this.#paragraph(token as Tokens.Paragraph, ctx));
          break;
        case "code":
          out.push(token.raw.trimEnd());
          break;
        default:
          out.push(this.#links(token.raw.trimEnd(), ctx));
      }
    }
    return out.filter((chunk) => chunk !== "");
  }

  #heading(token: Tokens.Heading, ctx: Context): string {
    const id =
      this.#ids.get(token) ?? `${ctx.doc.key}--${new Slugger().next(plainText(token.text))}`;
    return `${"#".repeat(Math.max(token.depth, 2))} ${this.#links(token.text, ctx)} {#${id}}`;
  }

  #paragraph(token: Tokens.Paragraph, ctx: Context): string {
    const text = token.text.trim();
    const image = IMAGE_ONLY.exec(text);
    if (image) return this.#figure(image[1] ?? "", image[2] ?? "", ctx);
    const lines = this.#links(text, ctx).split("\n");
    const keepBreaks =
      ctx.handout || (lines.length > 1 && lines.every((l) => l.trimStart().startsWith("**")));
    return lines.join(keepBreaks ? "\\\n" : "\n");
  }

  #blockquote(token: Tokens.Blockquote, ctx: Context): string {
    const handout = ctx.doc.path === "handouts.md";
    const inner = new Lexer({ gfm: true }).lex(token.text);
    if (ctx.handout) {
      // A quote inside a handout, such as an invocation printed on the page.
      return this.#blocks(inner, ctx)
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    }
    const body = this.#blocks(inner, { ...ctx, handout });
    return block(handout ? "handout" : "descriptive", body.join("\n\n"));
  }

  #figure(alt: string, target: string, ctx: Context): string {
    const path = resolvePath(ctx.doc.path, target);
    const kind = figureKind(path);
    if (this.#printed.has(path) && !(kind === "character" && ctx.doc.path === "npcs.md")) return "";
    this.#printed.add(path);
    if (!this.#source.assets.has(path)) {
      this.#warnings.push(
        `${ctx.doc.path}: image ${path} does not exist yet (dndig has no pick for it)`,
      );
      return block(`figure,${kind},missing`, `![${alt}](${path})`);
    }
    this.#assets.add(path);
    return block(`figure,${kind}`, `![${alt}](${path})`);
  }

  /** Index of the closing rule when tokens[start] opens a lorewright sidebar, else -1. */
  #sidebarEnd(tokens: Token[], start: number): number {
    let i = start + 1;
    while (tokens[i]?.type === "space") i++;
    const first = tokens[i];
    if (first?.type !== "paragraph" || !SIDEBAR_TITLE.test(first.text)) return -1;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j] as Token;
      if (t.type === "hr") return j;
      if (t.type === "heading") return -1;
    }
    return -1;
  }

  #sidebar(tokens: Token[], ctx: Context): string {
    const content = tokens.filter((t) => t.type !== "space");
    const first = content[0] as Tokens.Paragraph;
    const [titleLine = "", ...rest] = first.text.split("\n");
    const title = titleLine
      .replace(/^\*\*|\*\*$/g, "")
      .replace(/^\s*\p{Extended_Pictographic}️?\s*/u, "")
      .trim();
    const body = [`##### ${title}`];
    if (rest.length > 0) body.push(this.#links(rest.join("\n"), ctx));
    body.push(...this.#blocks(content.slice(1), ctx));
    return block("note", body.join("\n\n"));
  }

  /** End of the stat block that starts at heading tokens[start], or -1 if it is not one. */
  #statBlockEnd(tokens: Token[], start: number, end: number): number {
    const heading = tokens[start] as Tokens.Heading;
    if (heading.depth < 2) return -1;
    let own = start + 1;
    while (own < end && tokens[own]?.type !== "heading") own++;
    const texts = tokens.slice(start + 1, own).map((t) => ("text" in t ? String(t.text) : ""));
    const daggerheart = tokens
      .slice(start + 1, own)
      .some((t) => t.type === "blockquote" && STATS_DAGGERHEART.test(t.text));
    const fifth = texts.some((t) => STATS_5E_AC.test(t)) && texts.some((t) => STATS_5E_HP.test(t));
    if (!daggerheart && !fifth) return -1;
    this.#system ??= daggerheart ? "daggerheart" : "5e";
    let last = end;
    while (last > start + 1 && ["hr", "space"].includes(tokens[last - 1]?.type ?? "")) last--;
    return last;
  }

  #statBlock(tokens: Token[], ctx: Context): string[] {
    const out: string[] = [];
    for (const token of tokens) {
      if (
        token.type === "blockquote" &&
        (STATS_DAGGERHEART.test(token.text) || STATS_5E_AC.test(token.text))
      ) {
        const lines = this.#links(token.text.trim(), ctx).split("\n").filter(Boolean);
        out.push(block("stats", lines.join("\n\n")));
      } else if (token.type === "hr") {
        out.push("---");
      } else {
        out.push(...this.#blocks([token], ctx));
      }
    }
    return out;
  }

  #detectSystem(text: string): void {
    const system = /\*\*System:\*\*(.*)/i.exec(text)?.[1] ?? "";
    if (/daggerheart/i.test(system)) this.#system ??= "daggerheart";
    else if (/\b5e\b|5th|d&d|dungeons/i.test(system)) this.#system ??= "5e";
  }

  /** Rewrites links and image paths in inline markdown, leaving code spans alone. */
  #links(text: string, ctx: Context): string {
    return text
      .split(/(`+[^`]*`+)/)
      .map((part, index) =>
        index % 2 === 1
          ? part
          : part.replace(
              /(!?)\[([^\]]*)\]\(([^)\s]*)((?:\s+"[^"]*")?)\)/g,
              (_, bang: string, label: string, target: string, title: string) =>
                bang
                  ? `![${label}](${this.#imagePath(target, ctx)}${title})`
                  : this.#link(label, target, title, ctx),
            ),
      )
      .join("");
  }

  #imagePath(target: string, ctx: Context): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
    const path = resolvePath(ctx.doc.path, target);
    if (this.#source.assets.has(path)) this.#assets.add(path);
    else this.#warnings.push(`${ctx.doc.path}: image ${path} does not exist`);
    return path;
  }

  #link(label: string, target: string, title: string, ctx: Context): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return `[${label}](${target}${title})`;
    const hash = target.indexOf("#");
    const file = hash === -1 ? target : target.slice(0, hash);
    const fragment = hash === -1 ? "" : target.slice(hash + 1);
    const path = file ? resolvePath(ctx.doc.path, file) : ctx.doc.path;
    const doc = this.#anchors.get(path);
    if (doc === undefined) return label; // A file that is not part of the book.
    let id = fragment ? this.#anchors.get(`${path}#${fragment.toLowerCase()}`) : doc;
    if (id === undefined) {
      this.#warnings.push(`${ctx.doc.path}: link target ${target} does not exist`);
      id = doc;
    }
    // "[npcs.md](npcs.md#spike)" means nothing in a book; name what it points at instead.
    const text = /^[\w./-]+\.md(?:#[\w-]*)?$/.test(label.trim())
      ? (this.#titles.get(id) ?? label)
      : label;
    return `[${text}](#${id}${title})`;
  }

  #chooseCover(): string | undefined {
    const order: Figure[] = ["scene", "location"];
    for (const kind of order) {
      for (const path of this.#printed) {
        if (figureKind(path) === kind && this.#source.assets.has(path)) return path;
      }
    }
    return undefined;
  }
}

function block(classes: string, body: string): string {
  return `{{${classes}\n${body}\n}}`;
}

function figureKind(path: string): Figure {
  const folder = /^art\/(characters|locations|scenes|items|maps)\//.exec(path)?.[1];
  switch (folder) {
    case "characters":
      return "character";
    case "locations":
      return "location";
    case "scenes":
      return "scene";
    case "items":
      return "item";
    case "maps":
      return "map";
    default:
      return "image";
  }
}

function isKeyValues(text: string): boolean {
  return text.split("\n").every((line) => KEY_VALUE_LINE.test(line.trim()));
}

/** Index of the next heading at the same or a higher level than tokens[start]. */
function sectionEnd(tokens: Token[], start: number): number {
  const depth = (tokens[start] as Tokens.Heading).depth;
  let i = start + 1;
  while (i < tokens.length) {
    const t = tokens[i] as Token;
    if (t.type === "heading" && t.depth <= depth) break;
    i++;
  }
  return i;
}

/** A section that only lists links to other campaign files, like the overview's "Appendices". */
function isNavigation(tokens: Token[]): boolean {
  const content = tokens.filter((t) => t.type !== "space" && t.type !== "hr");
  return (
    content.length > 0 &&
    content.every(
      (t) =>
        t.type === "list" &&
        (t as Tokens.List).items.every((item) => NAV_ITEM.test(item.text.trim())),
    )
  );
}
