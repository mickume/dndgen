import puppeteer, {
  type Browser,
  type BrowserWorker,
  type HTTPRequest,
} from "@cloudflare/puppeteer";

/**
 * The origin the print page lives on. It never resolves: every request the page makes is
 * intercepted and answered by the Worker, so nothing has to be publicly reachable.
 */
export const ORIGIN = "https://dndgen.invalid";
/** Where the document's relative paths (its images) resolve. */
export const DOCUMENT_URL = `${ORIGIN}/doc/`;
/** Where the core package's assets (themes, vendored scripts) are served. */
export const ASSET_URL = `${ORIGIN}/assets/`;
const PAGE_URL = `${ORIGIN}/index.html`;

/** Answers a request for a path under the origin, such as "doc/art/x.jpg" or "assets/…". */
export type Resolver = (path: string) => Promise<Response | undefined>;

export interface PrintOptions {
  /** Leave the page background transparent, so something can show through from underneath. */
  transparent?: boolean;
}

const READY_TIMEOUT = 120_000;
const PDF_TIMEOUT = 300_000;

/** A Browser Rendering session that prints HTML documents to PDF. */
export class Printer {
  readonly #browser: Browser;
  readonly #resolve: Resolver;

  private constructor(browser: Browser, resolve: Resolver) {
    this.#browser = browser;
    this.#resolve = resolve;
  }

  static async open(binding: BrowserWorker, resolve: Resolver): Promise<Printer> {
    const browser = await puppeteer.launch(binding, { keep_alive: 600_000 });
    return new Printer(browser, resolve);
  }

  async print(html: string, options: PrintOptions = {}): Promise<Uint8Array> {
    const page = await this.#browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        this.#answer(request, html).catch((error: unknown) => {
          console.error(`request ${request.url()} failed`, error);
          request.abort("failed").catch(() => {});
        });
      });
      await page.goto(PAGE_URL, { waitUntil: "load", timeout: READY_TIMEOUT });
      await page.waitForSelector("html[data-ready]", { timeout: READY_TIMEOUT });
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        omitBackground: options.transparent ?? false,
        outline: true,
        tagged: true,
        timeout: PDF_TIMEOUT,
      });
      return new Uint8Array(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    await this.#browser.close().catch(() => {});
  }

  async #answer(request: HTTPRequest, html: string): Promise<void> {
    const url = request.url();
    if (url.startsWith("data:")) return request.continue();
    if (url === PAGE_URL) {
      return request.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    }
    if (!url.startsWith(`${ORIGIN}/`)) return request.abort("blockedbyclient");
    const path = decodeURIComponent(new URL(url).pathname.slice(1));
    const response = await this.#resolve(path);
    if (!response?.ok)
      return request.respond({ status: 404, contentType: "text/plain", body: "not found" });
    return request.respond({
      status: 200,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      body: new Uint8Array(await response.arrayBuffer()),
    });
  }
}
