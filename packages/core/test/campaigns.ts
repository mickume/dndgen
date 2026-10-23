import type { CampaignSource } from "../src/campaign.ts";

/** Builds a campaign from inline files; paths ending in .md are documents, the rest assets. */
export function campaign(files: Record<string, string>): CampaignSource {
  const documents = new Map<string, string>();
  const assets = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith(".md") && !path.startsWith("art/")) documents.set(path, text);
    else assets.add(path);
  }
  return { documents, assets };
}

/** A small Daggerheart campaign that uses every lorewright convention the assembler knows. */
export const daggerheart = {
  "campaign-overview.md": `# The Lantern Thief

*A one-shot for Daggerheart*

**Campaign Type:** One-shot
**System:** Daggerheart, core rules
**Players:** 3–5

---

## Adventure Background

The [Lantern Thief](npcs.md#mira-vell) stole the light of [Emberfall](locations.md#emberfall).
See [npcs.md](npcs.md#mira-vell) and the [frame](references/frame.txt).

## Appendices

- [Chapter 1](chapter-01.md)
- [Appendix A: NPCs](npcs.md)
`,
  "chapter-01.md": `# Chapter 1: Into the Dark

**Session(s):** 1
**Level:** 1

---

## Scene 1: The Square

> The square is cold. Every lantern is dark.
>
> Somewhere a bell rings.

![The Square](art/scenes/images/the-square.jpg)

Mira hides here. See [Scene 2](#scene-2-the-roof) and [the thief](npcs.md#mira-vell). Notes: [npcs.md#mira-vell](npcs.md#mira-vell).

---

**💡 DM Tip: Keep it moving**

If the players stall, ring the bell again.

---

## Scene 2: The Roof

![Missing Art](art/scenes/images/the-roof.jpg)

The roof. A [broken link](npcs.md#nobody).
`,
  "npcs.md": `# Appendix A: NPCs — The Lantern Thief

## Major NPCs

### Mira Vell

**Role:** The thief
**Location:** [Emberfall](locations.md#emberfall)

#### Appearance

Small and quick.

![Mira Vell](art/characters/images/mira-vell.jpg)

#### Stat Block

**Not a combatant.** Mira runs.
`,
  "locations.md": `# Appendix B: Locations — The Lantern Thief

## Emberfall

A town of lanterns.

![The Square](art/scenes/images/the-square.jpg)
`,
  "adversaries.md": `# Appendix C: Adversaries

## Adversaries

### Lamp Ghoul

***Tier 1 Bruiser***

*A ghoul that eats light.*

> **Difficulty:** 13 | **Thresholds:** 8/15 | **HP:** 7 | **Stress:** 3
> **ATK:** +2 | **Claws:** Melee | 1d10+3 phy

**FEATURES**

- ***Dim - Passive:*** Lanterns go out near it.

---

### Shadow Wisp

> **Difficulty:** 11 | **Thresholds:** 4/8 | **HP:** 3 | **Stress:** 2

---
`,
  "handouts.md": `# Appendix D: Handouts

## Handout 1: The Note

> **I took the light.**
> *— M.*
>
> > a quoted rhyme
> > on two lines
`,
  "chapters-summary.md": "# Complete Chapter Summaries\n\nSkip me.\n",
  "README.md":
    "# The Lantern Thief — Player Briefing\n\n## The Pitch\n\nSomeone stole the light.\n",
  "references/rules.md": "# Rules Used\n\nRoll dice.\n",
  "art/scenes/images/the-square.jpg": "",
  "art/characters/images/mira-vell.jpg": "",
  "art/README.md": "# Art\n",
};

/** A fifth-edition campaign with a custom stat block. */
export const fifth = {
  "campaign-overview.md": "# Goblin Hole\n\n**System:** D&D 5e\n\n## Background\n\nGoblins.\n",
  "chapter-01.md": "# Chapter 1: The Hole\n\nIn we go.\n",
  "chapter-02.md": "# Chapter 2: Deeper\n\nDeeper we go.\n",
  "chapter-10.md": "# Chapter 10: The Bottom\n\nThe end.\n",
  "appendix-monsters.md": `# Monsters

### Goblin Boss

**Small humanoid (goblinoid), neutral evil**

**AC** 17 (chain shirt, shield)
**HP** 21 (6d6)
**Speed** 30 ft.

**Actions:**
- **Scimitar:** +4 to hit
`,
};
