import { describe, expect, it } from "vitest";
import { parseCampaign } from "../src/campaign";
import { renderCampaign } from "../src/pdf";

const campaign = {
  title: "The Lost Mine",
  chapters: [{ title: "Chapter 1", sections: [{ title: "Intro", body: "word ".repeat(2000) }] }],
};

describe("pdf", () => {
  it("renders a PDF", async () => {
    const bytes = await renderCampaign(parseCampaign(campaign));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
  it("rejects invalid input", () => {
    expect(() => parseCampaign({})).toThrow();
  });
});
