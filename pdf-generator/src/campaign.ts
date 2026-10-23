// Minimal campaign model. Adjust to match the actual dndig / lorewright output.
export interface Section {
  title: string;
  body: string;
}

export interface Chapter {
  title: string;
  sections: Section[];
}

export interface Campaign {
  title: string;
  author?: string;
  summary?: string;
  chapters: Chapter[];
}

export function parseCampaign(input: unknown): Campaign {
  const c = input as Partial<Campaign> | null;
  if (!c || typeof c.title !== "string" || !Array.isArray(c.chapters)) {
    throw new Error("Invalid campaign: expected { title: string, chapters: [] }");
  }
  for (const ch of c.chapters) {
    if (typeof ch?.title !== "string" || !Array.isArray(ch.sections)) {
      throw new Error("Invalid chapter: expected { title: string, sections: [] }");
    }
    for (const s of ch.sections) {
      if (typeof s?.title !== "string" || typeof s.body !== "string") {
        throw new Error("Invalid section: expected { title: string, body: string }");
      }
    }
  }
  return c as Campaign;
}
