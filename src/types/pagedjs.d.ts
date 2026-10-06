/*
 * Minimal type shim for pagedjs (ships untyped). Covers only the surface the
 * preview and print pipelines use: Previewer, and handler registration.
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

  /**
   * Owns every <style> a Previewer puts in document.head: `styleEl` (rules
   * added through insertRule), created when preview() starts, and `inserted`
   * (one element per stylesheet text).
   */
  export interface PagedPolisher {
    styleEl?: HTMLStyleElement;
    inserted: HTMLStyleElement[];
  }

  export class Previewer {
    constructor();
    polisher: PagedPolisher;
    preview(
      content: string,
      stylesheets: PagedStylesheet[],
      renderTo: Element,
    ): Promise<PagedFlow>;
  }

  /**
   * Base class for a layout handler. Paged.js binds every method whose name
   * matches one of its hooks (afterParsed, layout, renderNode, …); see
   * pagedEntryFit.ts for the ones this app uses.
   */
  export class Handler {
    constructor(chunker: unknown, polisher: unknown, caller: unknown);
  }

  /** Adds handlers to the module-level list every later Previewer uses. */
  export function registerHandlers(...handlers: Array<typeof Handler>): void;
}
