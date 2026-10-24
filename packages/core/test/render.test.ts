import { describe, expect, it } from "vitest";
import { markdownToHtml } from "../src/markdown.ts";
import { adventureAssets } from "../src/references.ts";
import { renderHtml } from "../src/render.ts";
import { footerPlan, matchOutline, renderPageSheets } from "../src/sheets.ts";
import { Slugger, slug } from "../src/slug.ts";

const OPTIONS = { baseUrl: "file:///campaign/", assetUrl: "https://assets.test/" };

const ADVENTURE = `---
title: The Lantern Thief
subtitle: A one-shot
system: daggerheart
theme: dndbeyond
cover: art/scenes/images/cover.jpg
---

# Introduction {#intro}

Welcome.

## Background {#intro--background}

{{monster,frame,daggerheart
### Lamp Ghoul {#ghoul}

{{stats
**Difficulty:** 13
}}
}}

# Chapter 1: Into the Dark {#chapter-01}

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`
# Not a title, this is code
\`\`\`
`;

describe("slug", () => {
  it("follows GitHub's anchors", () => {
    expect(slug("Oduya's Greenhouse (Glorious)")).toBe("oduyas-greenhouse-glorious");
    expect(slug("Chapter 1: Root & Ruin")).toBe("chapter-1-root--ruin");
    expect(slug("💡 DM Tip")).toBe("-dm-tip");
  });

  it("numbers repeats", () => {
    const slugger = new Slugger();
    expect([slugger.next("Setup"), slugger.next("Setup"), slugger.next("Setup")]).toEqual([
      "setup",
      "setup-1",
      "setup-2",
    ]);
  });
});

describe("markdownToHtml", () => {
  it("renders mustache blocks, nested ones too", () => {
    const { html } = markdownToHtml("{{note,wide\n##### Tip\n\n{{stats\n**x**\n}}\n}}\n");
    expect(html).toContain('<div class="note wide">');
    expect(html).toContain('<div class="stats">\n<p><strong>x</strong></p>\n</div>');
  });

  it("takes heading ids from {#id} and marks boxed headings", () => {
    const { html, headings } = markdownToHtml(
      "## Plain\n\n## Named {#custom}\n\n{{monster\n### Inside\n}}\n",
    );
    expect(html).toContain('<h2 id="plain">Plain</h2>');
    expect(html).toContain('<h2 id="custom">Named</h2>');
    expect(headings).toEqual([
      { id: "plain", depth: 2, text: "Plain", boxed: false },
      { id: "custom", depth: 2, text: "Named", boxed: false },
      { id: "inside", depth: 3, text: "Inside", boxed: true },
    ]);
  });

  it("renders figures with captions, and placeholders for missing art", () => {
    expect(markdownToHtml("{{figure,scene\n![The Square](art/x.jpg)\n}}\n").html).toBe(
      '<figure class="figure scene"><img src="art/x.jpg" alt="The Square"><figcaption>The Square</figcaption></figure>\n',
    );
    expect(markdownToHtml("{{figure,scene,missing\n![Roof](art/y.jpg)\n}}\n").html).toContain(
      '<div class="placeholder"><span>Roof</span></div>',
    );
  });

  it("renders page and column breaks, maps and diagrams", () => {
    const { html } = markdownToHtml(
      "a\n\n\\page\n\nb\n\n\\column\n\n```\n[x]--[y]\n```\n\n```mermaid\nA-->B\n```\n",
    );
    expect(html).toContain('<div class="page-break"></div>');
    expect(html).toContain('<div class="column-break"></div>');
    expect(html).toContain('<pre class="ascii"><code>[x]--[y]</code></pre>');
    expect(html).toContain('<pre class="mermaid">A--&#62;B</pre>');
  });
});

describe("renderHtml", () => {
  const { html, meta, headings } = renderHtml(ADVENTURE, OPTIONS);

  it("builds a cover from the front matter", () => {
    expect(meta.title).toBe("The Lantern Thief");
    expect(html).toContain('<img class="cover-art" src="art/scenes/images/cover.jpg" alt="">');
    expect(html).toContain(
      '<p class="cover-name">The Lantern Thief</p><p class="cover-subtitle">A one-shot</p>',
    );
    expect(html).toContain("A Daggerheart Adventure");
  });

  it("puts every top-level heading in a chapter section on its own named page", () => {
    expect(html).toContain(
      '<section class="chapter" style="page: chapter-1">\n<h1 id="intro">Introduction</h1>',
    );
    expect(html).toContain(
      '<section class="chapter" style="page: chapter-2">\n<h1 id="chapter-01">',
    );
    expect(html.match(/<section class="chapter"/g)).toHaveLength(2);
  });

  it("leaves headings inside code fences alone", () => {
    expect(html).toContain("# Not a title, this is code");
  });

  it("lists chapters and sections in the contents, without boxed headings", () => {
    expect(html).toContain(
      '<li class="toc-1"><a href="#intro"><span class="toc-label">Introduction</span><span class="toc-page"></span></a><ol>',
    );
    expect(html).toContain('<li class="toc-2"><a href="#intro--background">');
    expect(html).not.toContain('href="#ghoul"');
  });

  it("fills in page numbers when it has them", () => {
    const numbered = renderHtml(ADVENTURE, {
      ...OPTIONS,
      pageNumbers: new Map([["intro", 3]]),
    }).html;
    expect(numbered).toContain(
      '<span class="toc-label">Introduction</span><span class="toc-page">3</span>',
    );
  });

  it("reports headings in outline order, contents first", () => {
    expect(headings.map((h) => h.id)).toEqual([
      "contents",
      "intro",
      "intro--background",
      "ghoul",
      "chapter-01",
    ]);
  });

  it("draws the page decoration with CSS unless told to leave it to page sheets", () => {
    expect(html).toContain('href="https://assets.test/themes/dndbeyond/browser-print.css"');
    expect(html).toContain(
      '@page chapter-2:right { @bottom-right { content: "Chapter 1: Into the Dark"; } }',
    );
    const sheets = renderHtml(ADVENTURE, { ...OPTIONS, decoration: "sheets" }).html;
    expect(sheets).not.toContain("browser-print.css");
    expect(sheets).not.toContain("@bottom-right");
  });

  it("loads mermaid only for documents with diagrams", () => {
    expect(html).toContain('<script src="https://assets.test/vendor/mermaid.min.js"></script>');
    expect(renderHtml("# One\n", OPTIONS).html).not.toContain("mermaid.min.js");
  });

  it("escapes the title", () => {
    expect(renderHtml('---\ntitle: "<b>&"\n---\n# A\n', OPTIONS).html).toContain(
      "<title>&#60;b&#62;&#38;</title>",
    );
  });

  it("rejects an unknown system", () => {
    expect(() => renderHtml("---\nsystem: gurps\n---\n", OPTIONS)).toThrow(/5e or daggerheart/);
  });
});

describe("page sheets", () => {
  const headings = [
    { id: "contents", depth: 1, text: "Contents", boxed: false },
    { id: "intro", depth: 1, text: "Introduction", boxed: false },
    { id: "intro--a", depth: 2, text: "A  Section", boxed: false },
    { id: "ghoul", depth: 3, text: "Ghoul", boxed: true },
    { id: "ch1", depth: 1, text: "Chapter 1", boxed: false },
  ];

  it("matches bookmarks to headings in order, skipping strays", () => {
    const pages = matchOutline(headings, [
      { title: "Contents", page: 2 },
      { title: "Introduction", page: 3 },
      { title: "Something Chrome added", page: 3 },
      { title: "a section", page: 4 },
      { title: "Chapter 1", page: 6 },
    ]);
    expect([...pages]).toEqual([
      ["contents", 2],
      ["intro", 3],
      ["intro--a", 4],
      ["ch1", 6],
    ]);
  });

  it("gives each page the title of the chapter it is in, and front matter none", () => {
    const plan = footerPlan(
      headings,
      new Map([
        ["contents", 2],
        ["intro", 3],
        ["ch1", 5],
      ]),
      6,
    );
    expect(plan).toEqual([null, null, "Introduction", "Introduction", "Chapter 1", "Chapter 1"]);
  });

  it("renders the shared background first, then a footer sheet per page", () => {
    const html = renderPageSheets(
      { title: "T", system: "5e", theme: "dndbeyond" },
      [null, "Intro", "Intro"],
      "https://a.test/",
    );
    const sheets = [...html.matchAll(/<div class="page-sheet([^"]*)">/g)].map((m) => m[1]);
    expect(sheets).toEqual([" background", "", " left", " right"]);
    expect(html).toContain(
      '<span class="footer-title">Intro</span><span class="footer-number">3</span>',
    );
    expect(html).toContain('href="https://a.test/themes/dndbeyond/theme.css"');
  });
});

describe("adventureAssets", () => {
  it("lists the cover and relative image embeds once", () => {
    const md =
      '---\ncover: art/a.jpg\n---\n![A](art/a.jpg) ![B](art/b.png "t") ![C](https://x.test/c.jpg) ![D](/abs.jpg)';
    expect(adventureAssets(md)).toEqual(["art/a.jpg", "art/b.png"]);
  });
});
