# dndgen
DnD Generator

## PDF generator

`pdf-generator/` is a TypeScript Cloudflare Worker skeleton that renders a campaign
(produced by the `/lorewright` skill and `dndig`) as an adventure-style PDF.
The campaign JSON schema in `src/campaign.ts` is a placeholder to be aligned with the real output.

```
cd pdf-generator && npm install
npm test            # unit tests
npm run dev         # local worker; POST campaign JSON to get a PDF
npm run deploy      # deploy to Cloudflare
```
