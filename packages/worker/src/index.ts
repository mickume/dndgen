import { api } from "./api.ts";
import type { Env } from "./env.ts";

export { RenderWorkflow } from "./workflow.ts";

export default {
  fetch: api.fetch,
} satisfies ExportedHandler<Env>;
