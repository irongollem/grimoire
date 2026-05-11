/*
 * Scriptorium ↔ Illuminator round-trip.
 *
 * "Edit in Illuminator" sends the currently-selected image's URL as a query
 * param to /illuminate; Illuminator does its work and returns to the doc with
 * `?updatedSrc=&oldSrc=` query params. This composable:
 *   - Exposes `selectedImageIsSupabase` (gates the toolbar button)
 *   - Exposes `editInIlluminator()` (push to /illuminate with the right params)
 *   - Watches the editor for the return trip and rewrites the matching image
 *     node's `src`, then clears the query params
 *
 * Only images served from our `asset-images` bucket are eligible — external
 * URLs and other buckets aren't editable in Illuminator.
 */

import { computed, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Editor } from "@tiptap/core";

const ASSET_IMAGE_URL_BASE =
  (import.meta.env.VITE_SUPABASE_URL as string) +
  "/storage/v1/object/public/asset-images/";

export function useScriptoriumIlluminator(
  editor: Ref<Editor | undefined>,
  docId: Ref<string | undefined>,
) {
  const route = useRoute();
  const router = useRouter();

  const selectedImageIsSupabase = computed(() => {
    if (!editor.value?.isActive("image")) return false;
    const src = editor.value.getAttributes("image").src;
    return typeof src === "string" && src.startsWith(ASSET_IMAGE_URL_BASE);
  });

  function editInIlluminator() {
    if (!editor.value || !docId.value) return;
    const src = editor.value.getAttributes("image").src as string | undefined;
    if (!src || !src.startsWith(ASSET_IMAGE_URL_BASE)) return;
    const params = new URLSearchParams({
      src,
      returnTo: docId.value,
      oldSrc: src,
    });
    void router.push(`/illuminate?${params.toString()}`);
  }

  watch(
    editor,
    (ed) => {
      if (!ed) return;
      const updatedSrc =
        typeof route.query.updatedSrc === "string" ? route.query.updatedSrc : null;
      const oldSrc =
        typeof route.query.oldSrc === "string"
          ? decodeURIComponent(route.query.oldSrc)
          : null;
      if (!updatedSrc || !oldSrc) return;

      let nodePos = -1;
      ed.state.doc.descendants((node, pos) => {
        if (nodePos !== -1) return false;
        if (node.type.name === "image" && node.attrs.src === oldSrc) {
          nodePos = pos;
        }
      });
      if (nodePos !== -1) {
        ed.chain()
          .setNodeSelection(nodePos)
          .updateAttributes("image", { src: updatedSrc })
          .run();
      }
      void router.replace({ query: {} });
    },
    { immediate: true },
  );

  return { selectedImageIsSupabase, editInIlluminator };
}
