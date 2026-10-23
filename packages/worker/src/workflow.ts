import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, JobReport, RenderParams } from "./env.ts";
import { assembleJob, prepareImage, printJob } from "./job.ts";

/**
 * Renders one job. Each step is retried on its own, so a browser session that drops while
 * printing does not redo the assembly or the image work.
 */
export class RenderWorkflow extends WorkflowEntrypoint<Env, RenderParams> {
  override async run(
    event: Readonly<WorkflowEvent<RenderParams>>,
    step: WorkflowStep,
  ): Promise<JobReport> {
    const { jobId } = event.payload;
    const assembled = await step.do("assemble", () => assembleJob(this.env, jobId));

    const warnings = [...assembled.warnings];
    for (const path of assembled.assets) {
      const warning = await step.do(
        `image ${path}`,
        { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } },
        () => prepareImage(this.env, jobId, path),
      );
      if (warning) warnings.push(warning);
    }

    return step.do(
      "print",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "15 minutes" },
      () => printJob(this.env, jobId, [...warnings]),
    );
  }
}
