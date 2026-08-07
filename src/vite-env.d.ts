/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Origin of the asset CDN, e.g. `https://cdn.dungeongrimoire.com` (#577).
   * Optional: unset means every bucket resolves against the Supabase origin.
   */
  readonly VITE_ASSET_CDN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * True only in Vercel preview builds — see the `define` block in vite.config.ts.
 * Gates the dev-only routes so they can be reviewed on a PR preview without ever
 * shipping to production.
 */
declare const __PREVIEW_BUILD__: boolean;
