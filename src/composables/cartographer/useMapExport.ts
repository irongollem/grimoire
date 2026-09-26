// The map-export cluster: the client-side PNG/VTT download, and the AI
// map-restyle flow (bake -> style-map edge function -> save the styled
// result to a location, M8). Publishing the drawing itself to the Atlas is
// `useMapPublish` (#868 S10, transparent-bake since epic #884) — that flow
// replaced M5's "Save to Atlas" entirely, so this module no longer bakes a
// plain WebP for a location's `map_url`; only the AI-styled result still
// saves that way.
//
// The styled render is the Picture layer (epic #884): it sits beneath
// whatever Drawing the Cartographer has published on top of it, which is
// exactly why this save doesn't go through Publish's diff/review — there is
// no structure to reconcile, only a `map_url` to replace.
//
// Extracted out of CartographerEditorView.vue. The view owns the canvas/
// paint state; this composable only needs a read-only snapshot of the
// current map (via `buildMap`), the loaded tile-pack runtimes, and the map
// name — all handed in as getters so this stays decoupled from the view's
// internal refs.
//
// ── Atlas Build's second entry point (site map workbench) ──────────────────
//
// `AtlasSiteMapMode.vue` passes `site`: with it, the AI input is a composite
// of this site's Picture (underneath) and its Drawing's live bake (on top,
// transparent) — `bakeAiStyleInput`, matching what `MapStackImage.vue`
// already shows the DM — instead of the plain Drawing-only bake the
// standalone `/cartographer/:id` route sends. The save target is then fixed
// to the site (no `EntityCombobox`, see `styleFixedTargetLabel`), and saving
// flattens the stack: the styled render replaces the Picture and the
// Drawing is unlinked (`useSaveStyledSitePicture`) rather than merely
// overwriting `map_url` — see that mutation's docstring for the full field
// list and why.
//
// ── Image sizing: two shapes, chosen from the campaign's real provider ─────
//
// `imageProviderKey` resolves the campaign's `image_provider` to the shape
// its render actually needs: flexible OpenAI (any 1:3..3:1 aspect within a
// 2560×1440 pixel budget) or Gemini (one of ten fixed aspect ratios).
// `bake.ts`'s `fitStyleInputCanvas` does the actual fitting per shape; see its
// doc for the full breakdown. Plain "openai" is always treated as flexible
// here, since the client can't see which model the admin has actually
// configured — `style-map/index.ts` re-validates against the resolved
// *model* (only `gpt-image-2.5-*` accepts a flexible size), so a campaign an
// admin pointed at an older OpenAI model gets a clear 400 before any charge,
// rather than a mismatched request reaching the provider. The same resolved
// provider also prices `styleCost` and picks which decrypted key counts as
// BYOK — both used to hardcode OpenAI's multiplier/key regardless of what
// the campaign was actually configured for.
//
// ── grid_calibration: derived, not skipped, and why that's still safe ──────
//
// The client-sent image is already fit to a known aspect and size for
// whichever shape applies, so any resize between send and result is a plain
// fit onto that same shape, and `cells_per_image_width` / `origin_x_pct` /
// `origin_y_pct` are ratios that leaves unchanged — see `fitStyleInputCanvas`'s
// own doc for the argument in full. `styledPictureCalibration` builds the
// calibration from that fitting geometry, computed *before* sending, never
// from measuring what comes back — there is nothing to measure that changes
// the answer. It's a first guess, not a guarantee: the model can still
// shrink or grow the grid a little in its own render, which is exactly what
// the Layers panel's Calibrate action stays available to correct (it opens
// seeded from whatever this wrote, same as any other Picture — see
// `GridCalibrationDialog`'s `existing` prop).

import { computed, ref, watch } from "vue";
import { bakeAiStyleInput, styledPictureCalibration } from "@/cartographer/aiStyleInput";
import { bakeMapForAI } from "@/cartographer/bake";
import { blobToBase64, base64ToBlob } from "@/cartographer/imageCodec";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { PackCategory } from "@/cartographer/packSchema";
import type { MapImageLayer } from "@/lib/locations/mapStack";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser, supabase } from "@/lib/supabase";
import type { CellKey, DungeonMap } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import {
  useAllLocations,
  useSaveStyledSitePicture,
  useUpdateLocationPicture,
} from "@/composables/locations/useLocations";
import { useCampaignStore } from "@/stores/campaign";

/** Shape of the `style-map` edge function's JSON response. */
interface StyleMapResponse {
  image_b64?: string;
  error?: string;
}

/**
 * The calibration is already written from the pre-send geometry by the time
 * this runs (see this module's header for why that's sound) — this exists
 * only to flag drift, not to correct it: if the provider's actual render
 * doesn't match the size `style-map` was asked for by more than a couple of
 * pixels, that's worth a console warning for whoever's debugging a
 * misaligned grid, even though Calibrate is the real fix either way.
 */
async function warnIfStyleResultSizeDrifted(blob: Blob, requested: { width: number; height: number }): Promise<void> {
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    bitmap.close();
    if (Math.abs(width - requested.width) > 2 || Math.abs(height - requested.height) > 2) {
      console.warn(
        `AI Style: requested a ${requested.width}x${requested.height} render but the provider returned ${width}x${height}. ` +
        "grid_calibration was derived from the request, not the actual result — Calibrate will fix any drift.",
      );
    }
  } catch {
    // Couldn't decode the result to compare — nothing to warn about, and the
    // calibration already written stands regardless.
  }
}

export function useMapExport(opts: {
  /** The current map, merged with in-progress layers/metadata edits, or null while unloaded. */
  buildMap: () => DungeonMap | null;
  runtimes: () => Map<string, TilePackRuntime>;
  mapName: () => string;
  /** Resolved trap/feature glyph categories (#804) — see cartographer/glyphs.ts. */
  glyphs: () => Record<CellKey, PackCategory>;
  /**
   * The site this map is being edited for, in Atlas Build only — see this
   * module's own header. Absent for the standalone `/cartographer/:id`
   * route, which keeps the free-pick "Save to Atlas" flow.
   */
  site?: () => { id: string; name: string; picture: MapImageLayer | null } | null;
}) {
  const { data: allLocationsData } = useAllLocations();
  const locationOptionsSource = computed(() => allLocationsData.value ?? []);
  const updateLocationPicture = useUpdateLocationPicture();
  const saveStyledSitePicture = useSaveStyledSitePicture();

  /** Non-null exactly when this instance is Atlas Build's own entry point —
   *  drives both the AI input (composite vs. plain Drawing bake) and the
   *  save (flatten-and-replace vs. plain `map_url` write). */
  const fixedTarget = computed(() => opts.site?.() ?? null);
  /** The site's own name, for the modal to show in place of the
   *  `EntityCombobox` once the target is fixed. */
  const styleFixedTargetLabel = computed(() => fixedTarget.value?.name ?? null);

  // Shared bake-in-progress flag for the PNG download and (indirectly) the
  // AI Style button's disabled state — see CartographerEditorView's onDownloadPng.
  const baking = ref(false);

  // M8 — AI Map Styler
  // Flat credit cost regardless of the render's actual size — see this
  // module's header for the sizing this pipeline now sends/requests.
  const mapStyleCampaign = useCampaignStore();
  const { costOf: costOfCredits } = useAiCredits();
  const { imageMultiplierFor: mapImageMultiplierFor } = useProviderConfig();
  /**
   * The campaign's actual chosen provider (`image_provider`), resolved once
   * and used for both the AI input's sizing (`bake.ts`'s `StyleImageProvider`)
   * and its pricing/BYOK below — a null/unset column means the platform
   * default, "openai". All three used to hardcode OpenAI regardless of what
   * the campaign was actually configured for.
   */
  const imageProviderKey = computed<"openai" | "gemini">(() =>
    mapStyleCampaign.activeCampaign?.image_provider === "gemini" ? "gemini" : "openai",
  );
  const styleByok = computed(() =>
    !!(imageProviderKey.value === "gemini" ? mapStyleCampaign.decryptedGeminiKey : mapStyleCampaign.decryptedOpenAiKey),
  );
  const { logImageGeneration } = useImageGenerationLog();
  const styleCost = computed(
    () => Math.round(costOfCredits("map_style_generation") * mapImageMultiplierFor(imageProviderKey.value) * 100) / 100,
  );
  const showStylePicker = ref(false);
  const showStyleResult = ref(false);
  const selectedPresetId = ref("playable");
  const stylePromptSuffix = ref("");
  const styleGenerating = ref(false);
  const styleResultBlob = ref<Blob | null>(null);
  const styleResultUrl = ref<string | null>(null);
  /** The best-guess calibration for `styleResultBlob`, derived at generate
   *  time from the fitted input's own geometry — see this module's header.
   *  Always set alongside `styleResultBlob` on a successful generation;
   *  read back by `onSaveStyledToAtlas`. */
  const styleResultCalibration = ref<GridCalibration | null>(null);
  const styleError = ref<string | null>(null);
  const styleAtlasLocationId = ref("");
  const styleAtlasError = ref<string | null>(null);
  const styleAtlasSaving = ref(false);
  // The fixed target never changes mid-session (Build always styles the site
  // it's embedded in) — seeded here so the host doesn't have to set it
  // itself before opening the picker, and reset by `onSaveStyledToAtlas`
  // below exactly like the free-pick flow resets its own choice.
  watch(fixedTarget, (target) => { if (target) styleAtlasLocationId.value = target.id; }, { immediate: true });
  const styleAtlasTargetHasMap = computed(() => {
    if (fixedTarget.value) return !!fixedTarget.value.picture;
    return (
      !!styleAtlasLocationId.value &&
      !!locationOptionsSource.value.find((l) => l.id === styleAtlasLocationId.value)?.map_url
    );
  });

  async function onGenerateStyle(): Promise<void> {
    const map = opts.buildMap();
    if (styleGenerating.value || !map) return;
    styleError.value = null;
    styleGenerating.value = true;
    try {
      const target = fixedTarget.value;
      const { blob: pngBlob, geometry, size } = target
        ? await bakeAiStyleInput(map, opts.runtimes(), target.picture, opts.glyphs(), imageProviderKey.value)
        : await bakeMapForAI(map, opts.runtimes(), {}, opts.glyphs(), imageProviderKey.value);
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
      // The input we sent and the size `style-map` was asked for are already
      // known (`size`, from the bake functions above) — see this module's
      // header for why that makes the pre-send geometry a safe basis for the
      // calibration, with no need to measure what comes back to derive it.
      styleResultCalibration.value = styledPictureCalibration(map, geometry);
      void warnIfStyleResultSizeDrifted(styleResultBlob.value, size);
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
    styleResultCalibration.value = null;
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
      if (fixedTarget.value) {
        // Atlas Build: flatten the stack — the render replaces the Picture
        // and the Drawing is unlinked, atomically. See the mutation's own
        // docstring for the full field list and why.
        await saveStyledSitePicture.mutateAsync({
          id: styleAtlasLocationId.value,
          mapUrl: url,
          calibration: styleResultCalibration.value,
        });
      } else {
        await updateLocationPicture.mutateAsync({
          id: styleAtlasLocationId.value,
          mapUrl: url,
          calibration: styleResultCalibration.value,
        });
      }
      // Log the restyled map to the Gallery, linked back to the location.
      void logImageGeneration({
        kind: "map", imageUrl: url, prompt: `${opts.mapName() || "Map"} — ${selectedPresetId.value} style`,
        targetId: styleAtlasLocationId.value, targetColumn: "map_url",
      });
      showStyleResult.value = false;
      // The free-pick flow clears its choice for the next open; a fixed
      // target never changes, and nothing re-seeds it if this cleared it too
      // (the `watch` above only fires again when `fixedTarget` itself
      // changes, which a same-site reopen never does).
      if (!fixedTarget.value) styleAtlasLocationId.value = "";
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
    styleFixedTargetLabel,
    styleByok,
    styleCost,
    // Actions
    onGenerateStyle,
    onRetryStyle,
    onDownloadStyled,
    onSaveStyledToAtlas,
  };
}
