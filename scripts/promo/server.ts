/**
 * The app server a take is filmed against: a Vite dev server of its own that
 * does not watch files.
 *
 * Why not the shared one on :5173: several sessions edit this checkout at once,
 * and every save there makes Vite reload the page, which a take records as the
 * boot splash in the middle of a shot (seen in the first Workshop drafts).
 * Without a watcher this server serves the code as it was when the take
 * started. HMR itself stays on: Vite uses it once, on a cold cache, to reload
 * the page after optimizing a newly found dependency, and without it the page
 * is left half loaded (an empty recipe list, seen once).
 * Its own cache directory keeps it out of the shared server's dependency cache.
 */
import { createServer, type ViteDevServer } from "vite";

const PORT = 5181;

export interface PromoServer {
  base: string;
  close(): Promise<void>;
}

export async function startPromoServer(): Promise<PromoServer> {
  const server: ViteDevServer = await createServer({
    configFile: "vite.config.ts",
    mode: "localdb",
    cacheDir: "node_modules/.vite-promo",
    logLevel: "warn",
    server: { port: PORT, strictPort: true, watch: null },
  });
  await server.listen();
  return { base: `http://localhost:${PORT}`, close: () => server.close() };
}
