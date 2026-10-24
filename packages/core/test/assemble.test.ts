import { describe, expect, it } from "vitest";
import { assemble } from "../src/assemble.ts";
import { planDocuments } from "../src/campaign.ts";
import { parseAdventure } from "../src/frontmatter.ts";
import { campaign, daggerheart, fifth } from "./campaigns.ts";

describe("planDocuments", () => {
  it("puts the overview first, chapters by number, appendices in book order and the briefing last", () => {
    const docs = planDocuments(campaign(daggerheart));
    expect(docs.map((d) => [d.path, d.role])).toEqual([
      ["campaign-overview.md", "introduction"],
      ["chapter-01.md", "chapter"],
      ["npcs.md", "appendix"],
      ["locations.md", "appendix"],
      ["adversaries.md", "appendix"],
      ["handouts.md", "appendix"],
      ["README.md", "briefing"],
    ]);
  });

  it("sorts chapters numerically", () => {
    const paths = planDocuments(campaign(fifth)).map((d) => d.path);
    expect(paths.slice(1, 4)).toEqual(["chapter-01.md", "chapter-02.md", "chapter-10.md"]);
  });

  it("adds the summary and references only when asked", () => {
    const paths = planDocuments(campaign(daggerheart), {
      includeSummary: true,
      includeReferences: true,
    }).map((d) => d.path);
    expect(paths).toContain("chapters-summary.md");
    expect(paths).toContain("references/rules.md");
  });

  it("rejects a directory without an overview", () => {
    expect(() => planDocuments(campaign({ "chapter-01.md": "# One" }))).toThrow(
      /campaign-overview\.md is missing/,
    );
  });
});

describe("assemble", () => {
  const result = assemble(campaign(daggerheart));
  const md = result.markdown;

  it("writes front matter from the overview", () => {
    const { meta } = parseAdventure(md);
    expect(meta).toEqual({
      title: "The Lantern Thief",
      subtitle: "A one-shot for Daggerheart",
      system: "daggerheart",
      theme: "dndbeyond",
      cover: "art/scenes/images/the-square.jpg",
    });
  });

  it("titles documents and letters the appendices", () => {
    const titles = [...md.matchAll(/^# (.*)$/gm)].map((m) => m[1]);
    expect(titles).toEqual([
      "Introduction {#campaign-overview}",
      "Chapter 1: Into the Dark {#chapter-01}",
      "Appendix A: NPCs {#npcs}",
      "Appendix B: Locations {#locations}",
      "Appendix C: Adversaries {#adversaries}",
      "Appendix D: Handouts {#handouts}",
      "Appendix E: Player Briefing {#readme}",
    ]);
  });

  it("turns the key-value lines under a title into an info block", () => {
    expect(md).toContain(
      "{{info\n**Campaign Type:** One-shot\\\n**System:** Daggerheart, core rules\\\n**Players:** 3–5\n}}",
    );
    expect(md).toContain("{{info\n**Session(s):** 1\\\n**Level:** 1\n}}");
    expect(md).not.toContain("*A one-shot for Daggerheart*");
  });

  it("points cross-file and local links at ids in the one document", () => {
    expect(md).toContain(
      "The [Lantern Thief](#npcs--mira-vell) stole the light of [Emberfall](#locations--emberfall).",
    );
    expect(md).toContain(
      "See [Scene 2](#chapter-01--scene-2-the-roof) and [the thief](#npcs--mira-vell).",
    );
    expect(md).toContain("## Scene 1: The Square {#chapter-01--scene-1-the-square}");
  });

  it("names the target of links labelled with a file name", () => {
    expect(md).toContain("See [Mira Vell](#npcs--mira-vell)");
    expect(md).toContain("Notes: [Mira Vell](#npcs--mira-vell).");
  });

  it("unlinks files that are not in the book", () => {
    expect(md).toContain("and the frame.");
  });

  it("drops sections that only list links to campaign files", () => {
    expect(md).not.toContain("Appendices {#");
  });

  it("warns about broken anchors and keeps the link on the document", () => {
    expect(md).toContain("A [broken link](#npcs).");
    expect(result.warnings).toContain("chapter-01.md: link target npcs.md#nobody does not exist");
  });

  it("boxes read-aloud text", () => {
    expect(md).toContain(
      "{{descriptive\nThe square is cold. Every lantern is dark.\n\nSomewhere a bell rings.\n}}",
    );
  });

  it("turns lorewright sidebars into notes", () => {
    expect(md).toContain(
      "{{note\n##### DM Tip: Keep it moving\n\nIf the players stall, ring the bell again.\n}}",
    );
  });

  it("wraps Daggerheart stat blocks and their stat lines", () => {
    expect(md).toContain(
      "{{monster,frame,daggerheart\n### Lamp Ghoul {#adversaries--lamp-ghoul}\n\n***Tier 1 Bruiser***\n\n*A ghoul that eats light.*\n\n{{stats\n**Difficulty:** 13 | **Thresholds:** 8/15 | **HP:** 7 | **Stress:** 3\n\n**ATK:** +2 | **Claws:** Melee | 1d10+3 phy\n}}\n\n**FEATURES**",
    );
    expect(md).toContain("{{monster,frame,daggerheart\n### Shadow Wisp");
  });

  it("leaves NPC sections without stats alone", () => {
    expect(md).toContain("#### Stat Block {#npcs--stat-block}\n\n**Not a combatant.** Mira runs.");
    expect(md).not.toContain("{{monster,frame,daggerheart\n### Mira Vell");
  });

  it("keeps the line breaks of handouts, quotes included", () => {
    expect(md).toContain(
      "{{handout\n**I took the light.**\\\n*— M.*\n\n> a quoted rhyme\\\n> on two lines\n}}",
    );
  });

  it("marks figures by kind and prints each picture once, portraits excepted", () => {
    expect(md).toContain("{{figure,scene\n![The Square](art/scenes/images/the-square.jpg)\n}}");
    expect(md).toContain(
      "{{figure,character\n![Mira Vell](art/characters/images/mira-vell.jpg)\n}}",
    );
    expect(md.match(/the-square\.jpg\)/g)).toHaveLength(1);
  });

  it("keeps a placeholder for art dndig has not made yet", () => {
    expect(md).toContain(
      "{{figure,scene,missing\n![Missing Art](art/scenes/images/the-roof.jpg)\n}}",
    );
    expect(result.warnings).toContain(
      "chapter-01.md: image art/scenes/images/the-roof.jpg does not exist yet (dndig has no pick for it)",
    );
  });

  it("lists the images it uses", () => {
    expect(result.assets).toEqual([
      "art/characters/images/mira-vell.jpg",
      "art/scenes/images/the-square.jpg",
    ]);
  });

  it("leaves out the chapter summary", () => {
    expect(md).not.toContain("Skip me.");
  });
});

describe("assemble a 5e campaign", () => {
  const result = assemble(campaign(fifth));

  it("detects the system and frames custom stat blocks", () => {
    expect(result.meta.system).toBe("5e");
    expect(result.markdown).toContain(
      "{{monster,frame,5e\n### Goblin Boss {#appendix-monsters--goblin-boss}",
    );
  });

  it("keeps the stat lines on separate lines", () => {
    expect(result.markdown).toContain(
      "**AC** 17 (chain shirt, shield)\\\n**HP** 21 (6d6)\\\n**Speed** 30 ft.",
    );
  });

  it("has no cover without art", () => {
    expect(result.meta.cover).toBeUndefined();
  });
});
