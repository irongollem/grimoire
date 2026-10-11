import { defineAsyncComponent, type AsyncComponentLoader } from "vue";
import LoadingSpinner from "./LoadingSpinner.vue";

/**
 * A panel the reader is not looking at yet (a settings tab, a character tab),
 * loaded the first time it is shown (#999 5.2.1). If its chunk takes longer than
 * a moment, the loader stands in, so a deep link or a tab switch never paints an
 * empty panel. A chunk lost to a deploy is reloaded by `staleChunkRecovery`,
 * which hears every dynamic import's `vite:preloadError`.
 */
export function lazyPanel(loader: AsyncComponentLoader) {
  return defineAsyncComponent({ loader, loadingComponent: LoadingSpinner, delay: 200 });
}
