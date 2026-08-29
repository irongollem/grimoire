// The map-export cluster: baking the current editor state to the Atlas
// (a location's `map_url` + VTT grid calibration), and the AI map-restyle
// flow (bake -> style-map edge function -> save the styled result).
//
// Extracted out of CartographerEditorView.vue. The view owns the canvas/
// paint state; this composable only needs a read-only snapshot of the
// current map (via `buildMap`), the loaded tile-pack runtimes, and the map
// name — all handed in as getters so this stays decoupled from the view's
// internal refs.

import { computed, ref } from "vue";
import { bakeMap, bakeMapForAI, computeBakedDimensions } from "@/cartographer/bake";
import { blobToBase64, base64ToBlob } from "@/cartographer/imageCodec";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser, supabase } from "@/lib/supabase";
import type { DungeonMap } from "@/types/dungeonMap.types";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import {
  useAllLocations,
  useUpdateLocationMapUrl,
  useUpdateLocationGridCalibration,
} from "@/composables/locations/useLocations";
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
}) {
  const { data: allLocationsData } = useAllLocations();
  const locationOptionsSource = computed(() => allLocationsData.value ?? []);
  const updateLocationMapUrl = useUpdateLocationMapUrl();
  const updateLocationGridCalibration = useUpdateLocationGridCalibration();

  // M5 — Save to Atlas
  const baking = ref(false);
  const showAtlasModal = ref(false);
  const atlasLocationId = ref("");
  const atlasError = ref<string | null>(null);
  const atlasTargetHasMap = computed(() =>
    !!atlasLocationId.value &&
    !!locationOptionsSource.value.find((l) => l.id === atlasLocationId.value)?.map_url,
  );

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

  async function onSaveToAtlas(): Promise<void> {
    const map = opts.buildMap();
    if (baking.value || !atlasLocationId.value || !map) return;
    atlasError.value = null;
    baking.value = true;
    try {
      const blob = await bakeMap(map, opts.runtimes());
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const url = await uploadToBucket({
        bucket: "locationImages",
        blob,
        userId: user.id,
        contentType: "image/webp",
      });
      if (!url) throw new Error("Upload failed");
      await updateLocationMapUrl.mutateAsync({
        id: atlasLocationId.value,
        mapUrl: url,
        sourceMapId: map.id,
      });
      // Auto-populate VTT grid calibration: the bake produces an image where
      // every column is one 5-ft cell at BASE_TILE_SIZE px and cell (0,0) sits
      // at the image's top-left, so cells_per_image_width == cols.
      const dims = computeBakedDimensions(map);
      await updateLocationGridCalibration.mutateAsync({
        id: atlasLocationId.value,
        calibration: {
          cells_per_image_width: dims.cols,
          origin_x_pct: 0,
          origin_y_pct: 0,
        },
      });
      showAtlasModal.value = false;
      atlasLocationId.value = "";
    } catch (e) {
      atlasError.value = e instanceof Error ? e.message : "Something went wrong";
    } finally {
      baking.value = false;
    }
  }

  async function onGenerateStyle(): Promise<void> {
    const map = opts.buildMap();
    if (styleGenerating.value || !map) return;
    styleError.value = null;
    styleGenerating.value = true;
    try {
      const pngBlob = await bakeMapForAI(map, opts.runtimes());
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
    // Save to Atlas
    baking,
    showAtlasModal,
    atlasLocationId,
    atlasError,
    atlasTargetHasMap,
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
    onSaveToAtlas,
    onGenerateStyle,
    onRetryStyle,
    onDownloadStyled,
    onSaveStyledToAtlas,
  };
}
