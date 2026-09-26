import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MapImageLayer } from "@/lib/locations/mapStack";
import type { DungeonMap } from "@/types/dungeonMap.types";

// A plain `{ value }` holder rather than Vue's `ref`: `vi.hoisted` runs
// before any import (including "vue") is evaluated, so this factory can
// only see APIs it doesn't need imports for. Every test sets `.value`
// before the composable under test reads it, so real reactivity is never
// required — `useAllLocations`'s mock only needs to look like a query
// result (`{ data }`) with a `.value` TanStack Query itself would give it.
const mocks = vi.hoisted(() => {
  // A fake fit-to-aspect geometry, as `bakeMapForAI`/`bakeAiStyleInput` would
  // return alongside the blob — `styledPictureCalibration` (the REAL
  // implementation, not mocked below) turns this into the calibration the
  // save mutations receive. `size` is what was actually requested from the
  // provider, for the drift-warning check.
  const fakeGeometry = { effWidth: 1024, effHeight: 1024, offsetX: 0, offsetY: 0, cellsPerImageWidth: 7, originXPct: 0, originYPct: 0 };
  const fakeSize = { width: 1024, height: 1024 };
  return {
    fakeGeometry,
    bakeAiStyleInput: vi.fn().mockResolvedValue({ blob: new Blob(["composite"], { type: "image/png" }), geometry: fakeGeometry, size: fakeSize }),
    bakeMapForAI: vi.fn().mockResolvedValue({ blob: new Blob(["plain"], { type: "image/png" }), geometry: fakeGeometry, size: fakeSize }),
    blobToBase64: vi.fn().mockResolvedValue("b64"),
    base64ToBlob: vi.fn().mockReturnValue(new Blob(["result"], { type: "image/webp" })),
    uploadToBucket: vi.fn().mockResolvedValue("https://cdn.example/styled.webp"),
    getCurrentUser: vi.fn().mockReturnValue({ id: "user-1" }),
    invoke: vi.fn().mockResolvedValue({ data: { image_b64: "result-b64" }, error: null }),
    updatePicture: vi.fn().mockResolvedValue(undefined),
    saveStyledSitePicture: vi.fn().mockResolvedValue(undefined),
    logImageGeneration: vi.fn(),
    allLocations: { value: [] as { id: string; map_url: string | null }[] },
    // Campaign provider state — plain mutable values rather than refs, read
    // once per `useCampaignStore()` call (see the mock below), so a test
    // sets these BEFORE constructing its `useMapExport` instance.
    activeCampaign: null as { image_provider: string | null } | null,
    decryptedOpenAiKey: "",
    decryptedGeminiKey: "",
    // provider -> multiplier, close to production's real openai=1/gemini=0.5.
    imageMultiplierFor: vi.fn((provider: string) => (provider === "gemini" ? 0.5 : 1)),
  };
});

// Only the bake calls themselves are mocked (they'd otherwise touch
// OffscreenCanvas/fetch); `styledPictureCalibration` and `liveDrawingCalibration`
// stay real so the calibration a save receives is genuinely computed from the
// geometry a bake call returns, not asserted against a second mock.
vi.mock("@/cartographer/aiStyleInput", async () => {
  const actual = await vi.importActual<typeof import("@/cartographer/aiStyleInput")>("@/cartographer/aiStyleInput");
  return { ...actual, bakeAiStyleInput: mocks.bakeAiStyleInput };
});
vi.mock("@/cartographer/bake", async () => {
  const actual = await vi.importActual<typeof import("@/cartographer/bake")>("@/cartographer/bake");
  return { ...actual, bakeMapForAI: mocks.bakeMapForAI };
});
vi.mock("@/cartographer/imageCodec", () => ({
  blobToBase64: mocks.blobToBase64,
  base64ToBlob: mocks.base64ToBlob,
}));
vi.mock("@/lib/storage", () => ({ uploadToBucket: mocks.uploadToBucket }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: mocks.getCurrentUser,
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ imageMultiplierFor: mocks.imageMultiplierFor }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: mocks.logImageGeneration }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: mocks.allLocations }),
  useUpdateLocationPicture: () => ({ mutateAsync: mocks.updatePicture }),
  useSaveStyledSitePicture: () => ({ mutateAsync: mocks.saveStyledSitePicture }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaign: mocks.activeCampaign,
    decryptedOpenAiKey: mocks.decryptedOpenAiKey,
    decryptedGeminiKey: mocks.decryptedGeminiKey,
  }),
}));

import { useMapExport } from "./useMapExport";

function fakeMap(): DungeonMap {
  return {
    id: "map-1",
    user_id: "u",
    campaign_id: null,
    name: "Test",
    description: null,
    layers: { floor: {}, solidBlock: {}, object: {}, annotation: {} },
    metadata: {},
    default_pack_id: null,
    tags: [],
    notes: null,
    created_at: "",
    rev: 1,
    updated_at: "",
  };
}

describe("useMapExport", () => {
  beforeEach(() => {
    mocks.bakeAiStyleInput.mockClear();
    mocks.bakeMapForAI.mockClear();
    mocks.updatePicture.mockClear();
    mocks.saveStyledSitePicture.mockClear();
    mocks.imageMultiplierFor.mockClear();
    mocks.allLocations.value = [];
    mocks.activeCampaign = null;
    mocks.decryptedOpenAiKey = "";
    mocks.decryptedGeminiKey = "";
  });

  describe("without a site (standalone /cartographer page)", () => {
    it("bakes the plain Drawing-only input and saves via the free-pick mutation only", async () => {
      const map = fakeMap();
      const exp = useMapExport({
        buildMap: () => map,
        runtimes: () => new Map(),
        mapName: () => "Test",
        glyphs: () => ({}),
      });

      expect(exp.styleFixedTargetLabel.value).toBeNull();

      await exp.onGenerateStyle();
      expect(mocks.bakeAiStyleInput).not.toHaveBeenCalled();
      expect(mocks.bakeMapForAI).toHaveBeenCalledWith(map, expect.any(Map), {}, {}, "openai");

      exp.styleAtlasLocationId.value = "loc-9";
      await exp.onSaveStyledToAtlas();
      expect(mocks.saveStyledSitePicture).not.toHaveBeenCalled();
      expect(mocks.updatePicture).toHaveBeenCalledWith({
        id: "loc-9",
        mapUrl: "https://cdn.example/styled.webp",
        // A best-guess calibration is written here too — the standalone
        // flow's own input is fitted the same way, so the geometry is just
        // as derivable for whatever arbitrary location was picked.
        calibration: {
          cells_per_image_width: 7,
          origin_x_pct: 0,
          origin_y_pct: 0,
          origin_cell_x: -3,
          origin_cell_y: -3,
          grid_opacity: expect.any(Number),
        },
      });
      // The free-pick flow clears its choice once the save lands.
      expect(exp.styleAtlasLocationId.value).toBe("");
    });

    it("reads styleAtlasTargetHasMap off the fetched location list", () => {
      mocks.allLocations.value = [{ id: "loc-9", map_url: "https://cdn.example/existing.webp" }];
      const exp = useMapExport({
        buildMap: () => null,
        runtimes: () => new Map(),
        mapName: () => "",
        glyphs: () => ({}),
      });
      exp.styleAtlasLocationId.value = "loc-9";
      expect(exp.styleAtlasTargetHasMap.value).toBe(true);
    });
  });

  describe("with a site (Atlas Build's fixed-target entry point)", () => {
    function siteWithPicture(picture: MapImageLayer | null) {
      return () => ({ id: "site-1", name: "Ashmouth Undercroft", picture });
    }

    it("seeds styleAtlasLocationId from the site, with no host wiring needed", () => {
      const exp = useMapExport({
        buildMap: () => null,
        runtimes: () => new Map(),
        mapName: () => "",
        glyphs: () => ({}),
        site: siteWithPicture(null),
      });
      expect(exp.styleAtlasLocationId.value).toBe("site-1");
      expect(exp.styleFixedTargetLabel.value).toBe("Ashmouth Undercroft");
    });

    it("composites Picture + Drawing for the AI input instead of the plain Drawing bake", async () => {
      const map = fakeMap();
      const picture: MapImageLayer = { kind: "picture", url: "https://cdn.example/scan.webp", calibration: null };
      const exp = useMapExport({
        buildMap: () => map,
        runtimes: () => new Map(),
        mapName: () => "Test",
        glyphs: () => ({}),
        site: siteWithPicture(picture),
      });
      await exp.onGenerateStyle();
      expect(mocks.bakeMapForAI).not.toHaveBeenCalled();
      expect(mocks.bakeAiStyleInput).toHaveBeenCalledWith(map, expect.any(Map), picture, {}, "openai");
    });

    it("reads styleAtlasTargetHasMap off the site's own picture, not the location list", () => {
      const picture: MapImageLayer = { kind: "picture", url: "https://cdn.example/scan.webp", calibration: null };
      const exp = useMapExport({
        buildMap: () => null,
        runtimes: () => new Map(),
        mapName: () => "",
        glyphs: () => ({}),
        site: siteWithPicture(picture),
      });
      expect(exp.styleAtlasTargetHasMap.value).toBe(true);
    });

    it("saves through the atomic flatten mutation, and keeps the fixed target set for the next pass", async () => {
      const map = fakeMap();
      const exp = useMapExport({
        buildMap: () => map,
        runtimes: () => new Map(),
        mapName: () => "Test",
        glyphs: () => ({}),
        site: siteWithPicture(null),
      });
      await exp.onGenerateStyle();
      await exp.onSaveStyledToAtlas();
      expect(mocks.updatePicture).not.toHaveBeenCalled();
      expect(mocks.saveStyledSitePicture).toHaveBeenCalledWith({
        id: "site-1",
        mapUrl: "https://cdn.example/styled.webp",
        calibration: {
          cells_per_image_width: 7,
          origin_x_pct: 0,
          origin_y_pct: 0,
          origin_cell_x: -3,
          origin_cell_y: -3,
          grid_opacity: expect.any(Number),
        },
      });
      // Unlike the free-pick flow, the fixed target is never cleared — the
      // next "Style with AI" click on the same site needs it seeded again,
      // and nothing else would re-seed it (the site itself hasn't changed).
      expect(exp.styleAtlasLocationId.value).toBe("site-1");
    });

    it("derives grid_calibration from the bake's own fitted geometry, computed before sending, never from the returned image", async () => {
      const map = fakeMap();
      const exp = useMapExport({
        buildMap: () => map,
        runtimes: () => new Map(),
        mapName: () => "Test",
        glyphs: () => ({}),
        site: siteWithPicture(null),
      });
      await exp.onGenerateStyle();
      await exp.onSaveStyledToAtlas();
      const [payload] = mocks.saveStyledSitePicture.mock.calls[0] as [{ calibration: Record<string, unknown> }];
      // Matches `styledPictureCalibration(map, fakeGeometry)`: cells/origin
      // pct straight from the geometry, cell coordinates from the map's own
      // (unpadded) bake — see aiStyleInput.test.ts for the unit coverage of
      // that function itself.
      expect(payload.calibration.cells_per_image_width).toBe(7);
      expect(payload.calibration.origin_cell_x).toBe(-3);
      expect(payload.calibration.origin_cell_y).toBe(-3);
    });
  });

  describe("resolving the campaign's actual image provider (not always OpenAI)", () => {
    it("defaults to openai when image_provider is null", () => {
      mocks.activeCampaign = { image_provider: null };
      const exp = useMapExport({ buildMap: () => null, runtimes: () => new Map(), mapName: () => "", glyphs: () => ({}) });
      expect(exp.styleCost.value).toBe(1); // costOf(1) * imageMultiplierFor("openai")=1
      expect(mocks.imageMultiplierFor).toHaveBeenCalledWith("openai");
    });

    it("prices a Gemini campaign at Gemini's own multiplier, not OpenAI's", () => {
      mocks.activeCampaign = { image_provider: "gemini" };
      const exp = useMapExport({ buildMap: () => null, runtimes: () => new Map(), mapName: () => "", glyphs: () => ({}) });
      expect(exp.styleCost.value).toBe(0.5); // costOf(1) * imageMultiplierFor("gemini")=0.5
      expect(mocks.imageMultiplierFor).toHaveBeenCalledWith("gemini");
    });

    it("reads BYOK off the Gemini key for a Gemini campaign, not the OpenAI one", () => {
      mocks.activeCampaign = { image_provider: "gemini" };
      mocks.decryptedOpenAiKey = "sk-openai-unrelated";
      mocks.decryptedGeminiKey = "";
      const exp = useMapExport({ buildMap: () => null, runtimes: () => new Map(), mapName: () => "", glyphs: () => ({}) });
      // Has an OpenAI key but not a Gemini one — a Gemini campaign must not
      // read BYOK true off the wrong provider's key.
      expect(exp.styleByok.value).toBe(false);
      mocks.decryptedGeminiKey = "gm-key";
      const exp2 = useMapExport({ buildMap: () => null, runtimes: () => new Map(), mapName: () => "", glyphs: () => ({}) });
      expect(exp2.styleByok.value).toBe(true);
    });

    it("passes the resolved provider into the bake call, so a Gemini campaign fits its input to a Gemini ratio", async () => {
      mocks.activeCampaign = { image_provider: "gemini" };
      const map = fakeMap();
      const exp = useMapExport({
        buildMap: () => map,
        runtimes: () => new Map(),
        mapName: () => "Test",
        glyphs: () => ({}),
      });
      await exp.onGenerateStyle();
      expect(mocks.bakeMapForAI).toHaveBeenCalledWith(map, expect.any(Map), {}, {}, "gemini");
    });
  });
});
