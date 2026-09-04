import { describe, it, expect, beforeEach, vi } from "vitest";
import { effectScope, reactive, ref } from "vue";
import type { AudioTriggerEvent } from "@/lib/audio/audioTriggers";
import type { Location } from "@/types/location.types";

/**
 * The composable's contract: ambience follows where the party actually is,
 * and only while a session is running. A DM tidying the Atlas on a Tuesday
 * must not start music because they changed a dropdown, and a browsed
 * location must never compete with wherever the party actually stands.
 */

const sessionRunning = ref(false);
const activeCampaign = ref<{ current_location_id: string | null } | null>(null);
const locations = ref<Location[]>([]);

vi.mock("@/stores/ui", () => ({ useUiStore: () => reactive({ sessionRunning }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => reactive({ activeCampaign }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: locations }),
}));

function place(over: Partial<Location> & { id: string }): Location {
  return {
    user_id: "u", campaign_id: "c", parent_id: null, name: over.id,
    location_type: "building", description: null, notes: null, tags: [],
    image_url: null, map_url: null, underlay_url: null, map_pins: [], is_map_shared: false,
    player_visible_to: [], player_summary: null, is_description_shared: false,
    is_npcs_shared: false, is_inventory_shared: false, npc_owner_id: null,
    related_location_ids: [], source_map_id: null, is_battle_map: false,
    grid_calibration: null, era_start: null, era_end: null,
    audio_theme: null, sort_order: null, created_at: "", updated_at: "",
    ...over,
  } as Location;
}

/** Let the watcher's post-flush callback settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function mount() {
  const triggers = await import("@/lib/audio/audioTriggers");
  const mod = await import("@/composables/campaign/usePartyAmbience");
  const events: AudioTriggerEvent[] = [];
  const off = triggers.onAudioTrigger((event) => events.push(event));
  const scope = effectScope();
  scope.run(() => mod.usePartyAmbience());
  await flush();
  return { ...mod, ...triggers, scope, events, off };
}

beforeEach(async () => {
  vi.resetModules();
  sessionRunning.value = false;
  activeCampaign.value = null;
  locations.value = [];
  const { clearAudioTriggerHandlers } = await import("@/lib/audio/audioTriggers");
  clearAudioTriggerHandlers();
});

describe("resolvePartyAmbience", () => {
  it("requests nothing when no session is running, wherever the party stands", async () => {
    const { resolvePartyAmbience } = await import("@/composables/campaign/usePartyAmbience");
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    expect(resolvePartyAmbience(false, loc)).toBeNull();
  });

  it("requests nothing for a location with no theme set", async () => {
    const { resolvePartyAmbience } = await import("@/composables/campaign/usePartyAmbience");
    const loc = place({ id: "l1", name: "A Nameless Room", audio_theme: null });
    expect(resolvePartyAmbience(true, loc)).toBeNull();
  });

  it("requests nothing when the party's location is not yet known", async () => {
    const { resolvePartyAmbience } = await import("@/composables/campaign/usePartyAmbience");
    expect(resolvePartyAmbience(true, null)).toBeNull();
  });

  it("resolves the party's own themed ambience during a session", async () => {
    const { resolvePartyAmbience, partyAmbienceSourceId } = await import("@/composables/campaign/usePartyAmbience");
    const loc = place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" });
    expect(resolvePartyAmbience(true, loc)).toEqual({
      sourceId: partyAmbienceSourceId("l1"),
      theme: "tavern",
      slot: "ambient",
      label: "The Yawning Portal",
      kind: "location",
    });
  });
});

describe("usePartyAmbience", () => {
  it("never requests while no session is running", async () => {
    locations.value = [place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" })];
    activeCampaign.value = { current_location_id: "l1" };

    const { events } = await mount();

    expect(events).toEqual([]);
  });

  it("requests the party's location the moment a session starts", async () => {
    locations.value = [place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" })];
    activeCampaign.value = { current_location_id: "l1" };
    const { events } = await mount();

    sessionRunning.value = true;
    await flush();

    expect(events).toEqual([
      {
        type: "request",
        request: expect.objectContaining({ sourceId: "party:l1", theme: "tavern", label: "The Yawning Portal" }),
      },
    ]);
  });

  // Mirrors LocationSheet exactly: request the new room before releasing the
  // old one, so two themed rooms cross over instead of cutting to silence.
  it("crosses over to the new room before releasing the old one when the party moves", async () => {
    locations.value = [
      place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" }),
      place({ id: "l2", name: "Undermountain", audio_theme: "dungeon" }),
    ];
    activeCampaign.value = { current_location_id: "l1" };
    sessionRunning.value = true;
    const { events } = await mount();
    events.length = 0; // discard the initial request made on mount

    activeCampaign.value = { current_location_id: "l2" };
    await flush();

    expect(events).toEqual([
      { type: "request", request: expect.objectContaining({ sourceId: "party:l2", theme: "dungeon" }) },
      { type: "release", sourceId: "party:l1" },
    ]);
  });

  // The property the fix in LocationSheet exists for: a competing request from
  // a different producer (what a browsed location sheet used to fire, before
  // #790 gated it off) must never touch the party's own scene.
  it("keeps its own scene regardless of a differently-sourced request or release", async () => {
    locations.value = [place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" })];
    activeCampaign.value = { current_location_id: "l1" };
    sessionRunning.value = true;
    const { events, requestAudioTheme, releaseAudioTheme } = await mount();
    events.length = 0;

    requestAudioTheme({
      sourceId: "location:other-room", theme: "dungeon", slot: "ambient", label: "Some Other Room", kind: "location",
    });
    releaseAudioTheme("location:other-room");
    await flush();

    expect(events.some((e) => e.type === "request" && e.request.sourceId === "party:l1")).toBe(false);
    expect(events.some((e) => e.type === "release" && e.sourceId === "party:l1")).toBe(false);
  });

  it("hands the slot back when the session ends", async () => {
    locations.value = [place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" })];
    activeCampaign.value = { current_location_id: "l1" };
    sessionRunning.value = true;
    const { events } = await mount();
    events.length = 0;

    sessionRunning.value = false;
    await flush();

    expect(events).toEqual([{ type: "release", sourceId: "party:l1" }]);
  });

  it("releases on unmount rather than leaving a scene stuck playing", async () => {
    locations.value = [place({ id: "l1", name: "The Yawning Portal", audio_theme: "tavern" })];
    activeCampaign.value = { current_location_id: "l1" };
    sessionRunning.value = true;
    const { events, scope } = await mount();
    events.length = 0;

    scope.stop();
    await flush();

    expect(events).toEqual([{ type: "release", sourceId: "party:l1" }]);
  });
});
