/*
 * Minimal type shim for pagedjs (ships untyped). Covers only the Previewer
 * surface the spike/preview pipeline uses.
 */
declare module "pagedjs" {
  export interface PagedFlow {
    total: number;
    performance: number;
  }

  /**
   * A stylesheet entry: either a URL string, or an object mapping a
   * (pseudo) URL to inline CSS text — `{ "paged.css": "@page { … }" }`.
   * The key is used only for relative-URL resolution.
   */
  export type PagedStylesheet = string | Record<string, string>;

  export class Previewer {
    constructor();
    preview(
      content: string,
      stylesheets: PagedStylesheet[],
      renderTo: Element,
    ): Promise<PagedFlow>;
  }
}
