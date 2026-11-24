import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { Location } from "@/types/location.types";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const mocks = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), bus: vi.fn() }));
const locations = ref<Location[] | undefined>([]);
/** What the soundboard answers: a theme is answered when it is in this list. */
const answered = ref<string[]>([]);

vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: locations }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: ref([]) }) }));
vi.mock("@/composables/soundboard/useAudioThemeTriggers", () => ({ useAudioThemeTriggers: mocks.bus }));
vi.mock("@/composables/locations/useAmbiencePlayback", () => ({
  useAmbiencePlayback: () => ({
    targetFor: (theme: string) => (answered.value.includes(theme) ? { playlistId: `scene:${theme}` } : null),
    play: mocks.play,
    stop: mocks.stop,
  }),
}));

import { useTableAmbience } from "./useTableAmbience";

function place(id: string, over: Partial<Location> = {}): Location {
  return { id, name: id, parent_id: null, audio_theme: null, ...over } as Location;
}

const scopes: Array<ReturnType<typeof effectScope>> = [];
function mountFor(placeId: { value: string | null }) {
  const scope = effectScope();
  scopes.push(scope);
  const table = scope.run(() => useTableAmbience(() => placeId.value))!;
  return { table, scope };
}

afterEach(() => {
  // Silently: a scope left running would call the mocks of the next test.
  scopes.splice(0).forEach((s) => s.stop());
});

beforeEach(() => {
  vi.clearAllMocks();
  locations.value = [place("inn", { audio_theme: "tavern" }), place("room", { parent_id: "inn" }), place("crypt", { audio_theme: "crypt" })];
  answered.value = ["tavern", "crypt"];
});

describe("useTableAmbience", () => {
  // Bug caught: a page that starts playing sound nobody asked for.
  it("plays nothing until the player switches it on, and mounts the audio listener the player layout lacks", async () => {
    const { table } = mountFor(ref("inn"));
    await nextTick();
    expect(table.offered.value).toBe(true);
    expect(table.on.value).toBe(false);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.bus).toHaveBeenCalledOnce();
    table.toggle();
    await nextTick();
    expect(mocks.play).toHaveBeenCalledWith({ themeOwnerId: "inn", theme: "tavern", label: "inn" });
  });

  // Bug caught: a button offered in a place with no sound at all (nothing to play, nothing to explain).
  it("offers nothing where no theme resolves, and silence counts as no theme", async () => {
    locations.value = [place("hall"), place("vault", { audio_theme: "silence" })];
    const here = ref<string | null>("hall");
    const { table } = mountFor(here);
    expect(table.offered.value).toBe(false);
    here.value = "vault";
    await nextTick();
    expect(table.offered.value).toBe(false);
  });

  // Bug caught: the character walking into a new place while the old place's sound plays on.
  it("follows the character to another place's theme, and stops on a place with none", async () => {
    locations.value = [...locations.value!, place("hall")];
    const here = ref<string | null>("inn");
    const { table } = mountFor(here);
    table.toggle();
    await nextTick();
    here.value = "crypt";
    await nextTick();
    expect(mocks.play).toHaveBeenLastCalledWith({ themeOwnerId: "crypt", theme: "crypt", label: "crypt" });
    here.value = "hall";
    await nextTick();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  // Bug caught: a scene that starts over from its first track on every room of one inherited dungeon.
  it("does not start again when the next place inherits the same theme", async () => {
    locations.value = [...locations.value!, place("cellar", { parent_id: "inn" })];
    const here = ref<string | null>("room");
    const { table } = mountFor(here);
    table.toggle();
    await nextTick();
    here.value = "cellar";
    await nextTick();
    expect(mocks.play).toHaveBeenCalledOnce();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  // Bug caught: Stop that leaves the sound running.
  it("stops when the player switches it off", async () => {
    const { table } = mountFor(ref("inn"));
    table.toggle();
    await nextTick();
    table.toggle();
    await nextTick();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  // Bug caught (24 Nov 2026): a remembered "on" starting sound at page load, which the browser blocks, leaving a Stop
  // button over silence. Every opening of the table starts off.
  it("starts off on every opening of the table, whatever the last one chose", async () => {
    mountFor(ref("inn")).table.toggle();
    await nextTick();
    expect(mountFor(ref("inn")).table.on.value).toBe(false);
  });

  // Bug caught: the sound carrying on after the player has left the table.
  it("stops when the table is left", async () => {
    const { table, scope } = mountFor(ref("inn"));
    table.toggle();
    await nextTick();
    scope.stop();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  // Bug caught: a button that does nothing and does not say why.
  it("says which theme nothing answers, and plays nothing for it", async () => {
    answered.value = [];
    const { table } = mountFor(ref("inn"));
    table.toggle();
    await nextTick();
    expect(table.unanswered.value).toBe("tavern");
    expect(mocks.play).not.toHaveBeenCalled();
  });
});
