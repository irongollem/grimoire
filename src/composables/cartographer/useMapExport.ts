// The map-export cluster: the client-side PNG/VTT download, and the AI
// map-restyle flow (bake -> style-map edge function -> save the styled
// result to a location, M8). Publishing the drawing itself to the Atlas is
// `useMapPublish` (#868 S10) — that flow replaced M5's "Save to Atlas"
// entirely, so this module no longer bakes a plain WebP for a location's
// `map_url`; only the AI-styled result still saves that way, because the
// style pipeline produces a picture with nothing behind it to reconcile.
//
// Extracted out of CartographerEditorView.vue. The view owns the canvas/
// paint state; this composable only needs a read-only snapshot of the
// current map (via `buildMap`), the loaded tile-pack runtimes, and the map
// name — all handed in as getters so this stays decoupled from the view's
// internal refs.

import { computed, ref } from "vue";
import { bakeMapForAI } from "@/cartographer/bake";
import { blobToBase64, base64ToBlob } from "@/cartographer/imageCodec";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { PackCategory } from "@/cartographer/packSchema";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser, supabase } from "@/lib/supabase";
import type { CellKey, DungeonMap } from "@/types/dungeonMap.types";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useAllLocations, useUpdateLocationMapUrl } from "@/composables/locations/useLocations";
import { useCampaignStore } from "@/stores/campaign";

/** Shape of the `style-map` edge function's JSON response. */
interface StyleMapResponse {
  image_b64?: string;
  error?: string;
}

export function useMapExport(opts: {
  /** The current map, merged with in-progress layers/metadata edits, or null while unloaded. */
  buildMap: () => DungeonMap | null;
  runtimes: () => Map<string, TilePackRuntime>;
  mapName: () => string;
  /** Resolved trap/feature glyph categories (#804) — see cartographer/glyphs.ts. */
  glyphs: () => Record<CellKey, PackCategory>;
}) {
  const { data: allLocationsData } = useAllLocations();
  const locationOptionsSource = computed(() => allLocationsData.value ?? []);
  const updateLocationMapUrl = useUpdateLocationMapUrl();

  // Shared bake-in-progress flag for the PNG download and (indirectly) the
  // AI Style button's disabled state — see CartographerEditorView's onDownloadPng.
  const baking = ref(false);

  // M8 — AI Map Styler
  // Map restyle renders square (1024×1024) via OpenAI → flat cost, no size scaling.
  const mapStyleCampaign = useCampaignStore();
  const { costOf: costOfCredits } = useAiCredits();
  const { imageMultiplierFor: mapImageMultiplierFor } = useProviderConfig();
  const styleByok = computed(() => !!mapStyleCampaign.decryptedOpenAiKey);
  const { logImageGeneration } = useImageGenerationLog();
  const styleCost = computed(
    () => Math.round(costOfCredits("map_style_generation") * mapImageMultiplierFor("openai") * 100) / 100,
  );
  const showStylePicker = ref(false);
  const showStyleResult = ref(false);
  const selectedPresetId = ref("playable");
  const stylePromptSuffix = ref("");
  const styleGenerating = ref(false);
  const styleResultBlob = ref<Blob | null>(null);
  const styleResultUrl = ref<string | null>(null);
  const styleError = ref<string | null>(null);
  const styleAtlasLocationId = ref("");
  const styleAtlasError = ref<string | null>(null);
  const styleAtlasSaving = ref(false);
  const styleAtlasTargetHasMap = computed(() =>
    !!styleAtlasLocationId.value &&
    !!locationOptionsSource.value.find((l) => l.id === styleAtlasLocationId.value)?.map_url,
  );

  async function onGenerateStyle(): Promise<void> {
    const map = opts.buildMap();
    if (styleGenerating.value || !map) return;
    styleError.value = null;
    styleGenerating.value = true;
    try {
      const pngBlob = await bakeMapForAI(map, opts.runtimes(), {}, opts.glyphs());
      const image_b64 = await blobToBase64(pngBlob);

      const { data, error } = await supabase.functions.invoke<StyleMapResponse>("style-map", {
        body: {
          campaign_id: map.id, // placeholder — edge fn doesn't use it for map auth
          image_b64,
          preset_id: selectedPresetId.value,
          map_name: opts.mapName(),
          map_description: map.description,
          prompt_suffix: stylePromptSuffix.value.trim() || null,
        },
      });
      const resultB64 = data?.image_b64;
      if (error || !resultB64) throw new Error(error?.message ?? data?.error ?? "Generation failed");

      styleResultBlob.value = base64ToBlob(resultB64, "image/webp");
      if (styleResultUrl.value) URL.revokeObjectURL(styleResultUrl.value);
      styleResultUrl.value = URL.createObjectURL(styleResultBlob.value);
      showStylePicker.value = false;
      showStyleResult.value = true;
    } catch (e) {
      styleError.value = e instanceof Error ? e.message : "Something went wrong";
    } finally {
      styleGenerating.value = false;
    }
  }

  async function onRetryStyle(): Promise<void> {
    if (styleResultUrl.value) URL.revokeObjectURL(styleResultUrl.value);
    styleResultBlob.value = null;
    styleResultUrl.value = null;
    showStyleResult.value = false;
    await onGenerateStyle();
  }

  function onDownloadStyled(): void {
    if (!styleResultBlob.value) return;
    const url = URL.createObjectURL(styleResultBlob.value);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${opts.mapName() || "map"}-styled.webp`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSaveStyledToAtlas(): Promise<void> {
    const map = opts.buildMap();
    if (styleAtlasSaving.value || !styleAtlasLocationId.value || !styleResultBlob.value || !map) return;
    styleAtlasError.value = null;
    styleAtlasSaving.value = true;
    try {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const url = await uploadToBucket({
        bucket: "locationImages",
        blob: styleResultBlob.value,
        userId: user.id,
        contentType: "image/webp",
      });
      if (!url) throw new Error("Upload failed");
      await updateLocationMapUrl.mutateAsync({
        id: styleAtlasLocationId.value,
        mapUrl: url,
        sourceMapId: map.id,
      });
      // Log the restyled map to the Gallery, linked back to the location.
      void logImageGeneration({
        kind: "map", imageUrl: url, prompt: `${opts.mapName() || "Map"} — ${selectedPresetId.value} style`,
        targetId: styleAtlasLocationId.value, targetColumn: "map_url",
      });
      showStyleResult.value = false;
      styleAtlasLocationId.value = "";
    } catch (e) {
      styleAtlasError.value = e instanceof Error ? e.message : "Something went wrong";
    } finally {
      styleAtlasSaving.value = false;
    }
  }

  return {
    // Shared / PNG download
    baking,
    // AI Map Styler
    showStylePicker,
    showStyleResult,
    selectedPresetId,
    stylePromptSuffix,
    styleGenerating,
    styleResultUrl,
    styleError,
    styleAtlasLocationId,
    styleAtlasError,
    styleAtlasSaving,
    styleAtlasTargetHasMap,
    styleByok,
    styleCost,
    // Actions
    onGenerateStyle,
    onRetryStyle,
    onDownloadStyled,
    onSaveStyledToAtlas,
  };
}
