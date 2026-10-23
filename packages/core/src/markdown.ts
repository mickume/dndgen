import {
  Marked,
  type RendererObject,
  type TokenizerAndRendererExtension,
  type Tokens,
} from "marked";
import { plainText, Slugger } from "./slug.ts";

/** A `{{class,class,#id … }}` block; homebrewery's mustache syntax. */
interface BlockToken extends Tokens.Generic {
  type: "hbBlock";
  classes: string[];
  id: string | undefined;
  tokens: Tokens.Generic[];
}

/** `\page` or `\column` on a line of its own. */
interface BreakToken extends Tokens.Generic {
  type: "hbBreak";
  kind: "page" | "column";
}

export interface HeadingInfo {
  id: string;
  depth: number;
  text: string;
  /** Inside a stat block, a figure or another box; such headings stay out of the contents. */
  boxed: boolean;
}

const OPEN = /^\{\{([\w-]+(?:,[#\w-]+)*)[ \t]*\n/;
const ID_SUFFIX = /\s*\{#([\w-]+)\}\s*$/;

const blockExtension: TokenizerAndRendererExtension = {
  name: "hbBlock",
  level: "block",
  start: (src) => src.match(/^\{\{/m)?.index,
  tokenizer(src) {
    const open = OPEN.exec(src);
    if (!open) return undefined;
    let depth = 1;
    let pos = open[0].length;
    while (pos <= src.length) {
      const eol = src.indexOf("\n", pos);
      const line = src.slice(pos, eol === -1 ? src.length : eol);
      if (OPEN.test(`${line}\n`)) depth++;
      else if (/^\}\}\s*$/.test(line)) depth--;
      if (depth === 0) {
        const end = eol === -1 ? src.length : eol + 1;
        const names = (open[1] ?? "").split(",");
        const token: BlockToken = {
          type: "hbBlock",
          raw: src.slice(0, end),
          classes: names.filter((n) => !n.startsWith("#")),
          id: names.find((n) => n.startsWith("#"))?.slice(1),
          tokens: [],
        };
        this.lexer.blockTokens(src.slice(open[0].length, pos), token.tokens);
        return token;
      }
      if (eol === -1) break;
      pos = eol + 1;
    }
    return undefined;
  },
  renderer(token) {
    const { classes, id, tokens } = token as BlockToken;
    const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
    if (classes[0] === "figure") return figure(classes, tokens, idAttr);
    return `<div class="${classes.join(" ")}"${idAttr}>\n${this.parser.parse(tokens)}</div>\n`;
  },
};

const breakExtension: TokenizerAndRendererExtension = {
  name: "hbBreak",
  level: "block",
  start: (src) => src.match(/^\\(?:page|column)/m)?.index,
  tokenizer(src) {
    const match = /^\\(page|column)[ \t]*(?:\n|$)/.exec(src);
    if (!match) return undefined;
    return { type: "hbBreak", raw: match[0], kind: match[1] } as BreakToken;
  },
  renderer(token) {
    return `<div class="${(token as BreakToken).kind}-break"></div>\n`;
  },
};

function figure(classes: string[], tokens: Tokens.Generic[], idAttr: string): string {
  const image = findImage(tokens);
  const alt = escapeHtml(image?.text ?? "");
  const media = classes.includes("missing")
    ? `<div class="placeholder"><span>${alt}</span></div>`
    : `<img src="${escapeHtml(image?.href ?? "")}" alt="${alt}">`;
  return `<figure class="${classes.join(" ")}"${idAttr}>${media}<figcaption>${alt}</figcaption></figure>\n`;
}

function findImage(tokens: Tokens.Generic[]): Tokens.Image | undefined {
  for (const token of tokens) {
    if (token.type === "image") return token as Tokens.Image;
    const nested = token.tokens ? findImage(token.tokens as Tokens.Generic[]) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Parses Adventure Markdown to HTML and reports the headings it saw, with their ids, in
 * document order. A heading takes its id from a trailing `{#id}`, or from its text.
 */
export function markdownToHtml(markdown: string): { html: string; headings: HeadingInfo[] } {
  const headings: HeadingInfo[] = [];
  const slugger = new Slugger();
  const ids = new WeakMap<Tokens.Heading, string>();
  const boxed = new WeakSet<Tokens.Heading>();

  const renderer: RendererObject = {
    heading(token) {
      const id = ids.get(token) ?? slugger.next(plainText(token.text));
      return `<h${token.depth} id="${escapeHtml(id)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
    code(token) {
      const text = escapeHtml(token.text);
      if (token.lang === "mermaid") return `<pre class="mermaid">${text}</pre>\n`;
      return `<pre class="${token.lang ? `lang-${escapeHtml(token.lang)}` : "ascii"}"><code>${text}</code></pre>\n`;
    },
  };

  const marked = new Marked({ gfm: true });
  marked.use({
    extensions: [blockExtension, breakExtension],
    renderer,
    walkTokens(token) {
      if (token.type === "hbBlock") {
        const visit = (inner: Tokens.Generic[]): void => {
          for (const t of inner) {
            if (t.type === "heading") boxed.add(t as Tokens.Heading);
            if (t.tokens) visit(t.tokens as Tokens.Generic[]);
          }
        };
        visit((token as BlockToken).tokens);
      }
      if (token.type !== "heading") return;
      const heading = token as Tokens.Heading;
      const match = ID_SUFFIX.exec(token.text);
      if (match) {
        token.text = token.text.slice(0, match.index);
        token.tokens = marked.Lexer.lexInline(token.text, marked.defaults);
      }
      const id = match?.[1] ?? slugger.next(plainText(token.text));
      ids.set(heading, id);
      headings.push({
        id,
        depth: heading.depth,
        text: plainText(heading.text),
        boxed: boxed.has(heading),
      });
    },
  });

  const html = marked.parse(markdown, { async: false });
  return { html, headings };
}
