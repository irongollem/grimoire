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
