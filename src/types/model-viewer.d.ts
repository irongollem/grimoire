// Ambient type for Google's <model-viewer> web component (@google/model-viewer).
// Registered as a Vue "GlobalComponent" so vue-tsc/Volar template checking
// accepts the custom element without flagging it as an unknown tag. The
// runtime template-compiler side of this (treating `model-viewer` as a
// native custom element rather than resolving it as a Vue component) is
// configured via `isCustomElement` in vite.config.ts / vitest.config.ts.
import type { DefineComponent } from "vue";

declare module "vue" {
  interface GlobalComponents {
    "model-viewer": DefineComponent<{
      src?: string;
      poster?: string;
      alt?: string;
      "auto-rotate"?: boolean | "";
      "camera-controls"?: boolean | "";
      loading?: "auto" | "lazy" | "eager";
      reveal?: "auto" | "interaction" | "manual";
    }>;
  }
}

export {};
