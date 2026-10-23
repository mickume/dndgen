import { parseCampaign } from "./campaign";
import { renderCampaign } from "./pdf";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("POST a campaign JSON document to generate a PDF", { status: 405 });
    }
    let campaign;
    try {
      campaign = parseCampaign(await request.json());
    } catch (e) {
      return new Response((e as Error).message, { status: 400 });
    }
    const pdf = await renderCampaign(campaign);
    return new Response(pdf, {
      headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="adventure.pdf"' },
    });
  },
};
