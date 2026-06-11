/*
 * Minimal type shim for pagedjs (ships untyped). Covers only the Previewer
 * surface the spike/preview pipeline uses.
 */
declare module "pagedjs" {
  export interface PagedFlow {
    total: number;
    performance: number;
  }

  export class Previewer {
    constructor();
    preview(
      content: string,
      stylesheets: string[],
      renderTo: Element,
    ): Promise<PagedFlow>;
  }
}
