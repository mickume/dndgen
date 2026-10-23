import type { BrowserWorker } from "@cloudflare/puppeteer";

export interface RenderParams {
  jobId: string;
}

export interface Env {
  /** Job files under jobs/<id>/. */
  JOBS: R2Bucket;
  BROWSER: BrowserWorker;
  IMAGES: ImagesBinding;
  /** The core package's assets: themes and vendored scripts. */
  ASSETS: Fetcher;
  RENDER: Workflow<RenderParams>;
  /** Bearer token for creating, uploading and starting jobs. */
  API_TOKEN?: string;
}

/** R2 keys of a job's files. */
export const keys = {
  job: (id: string) => `jobs/${id}/job.json`,
  source: (id: string, path = "") => `jobs/${id}/src/${path}`,
  print: (id: string, path: string) => `jobs/${id}/print/${path}`,
  adventure: (id: string) => `jobs/${id}/adventure.md`,
  pdf: (id: string) => `jobs/${id}/adventure.pdf`,
  report: (id: string) => `jobs/${id}/report.json`,
};

/** What the render workflow reports when it finishes, stored as report.json. */
export interface JobReport {
  title: string;
  pages: number;
  bytes: number;
  warnings: string[];
}
