import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAppUiStore } from "@/stores/ui/app";

const reads = vi.hoisted(() => ({
  player: undefined as unknown,
  dm: undefined as unknown,
  playerId: undefined as unknown,
  playerNookId: undefined as unknown,
  dmId: undefined as unknown,
}));
vi.mock("@/composables/bookNook/usePlayerBookNook", () => ({
  usePlayerBookNook: (id: unknown, nookId: unknown) => {
    reads.playerId = id;
    reads.playerNookId = nookId;
    return { data: { get value() { return reads.player; } } };
  },
}));
vi.mock("@/composables/bookNook/useBookNooks", () => ({
  useBookNook: (id: unknown) => {
    reads.dmId = id;
    return { data: { get value() { return reads.dm; } } };
  },
}));

import { usePlaceNook } from "./usePlaceNook";

const playerNook = { id: "n1", title: "player's" };
const dmNook = { id: "n1", title: "dm's" };
const value = (r: unknown) => (r as { value: unknown }).value;

beforeEach(() => {
  setActivePinia(createPinia());
  reads.player = playerNook;
  reads.dm = dmNook;
});

describe("usePlaceNook", () => {
  it("a player reads the nook through the player rpc, keyed by place", () => {
    const { nook } = usePlaceNook(ref({ id: "l1", book_nook_id: "n1" }));
    expect(nook.value).toBe(playerNook);
    expect(value(reads.playerId)).toBe("l1");
    expect(value(reads.dmId)).toBeNull();
  });

  it("the player's read is keyed by the place's nook too, so a place switching nooks is a new query", () => {
    const place = ref({ id: "l1", book_nook_id: "n1" });
    usePlaceNook(place);
    expect(value(reads.playerNookId)).toBe("n1");
    place.value = { id: "l1", book_nook_id: "n2" };
    expect(value(reads.playerNookId)).toBe("n2");
  });

  it("the DM previewing reads the nook by its id, not through the player rpc", () => {
    useAppUiStore().dmPreviewMode = true;
    const { nook } = usePlaceNook(ref({ id: "l1", book_nook_id: "n1" }));
    expect(nook.value).toBe(dmNook);
    expect(value(reads.dmId)).toBe("n1");
    expect(value(reads.playerId)).toBeNull();
  });

  it("a place with no book_nook_id shows none and asks nothing, even if a stale answer is cached", () => {
    const { nook } = usePlaceNook(ref({ id: "l1", book_nook_id: null }));
    expect(nook.value).toBeNull();
    expect(value(reads.playerId)).toBeNull();
  });

  it("a hidden place (the rpc answers nothing) shows none", () => {
    reads.player = null;
    const { nook } = usePlaceNook(ref({ id: "l1", book_nook_id: "n1" }));
    expect(nook.value).toBeNull();
  });

  it("no place yields null", () => {
    expect(usePlaceNook(ref(null)).nook.value).toBeNull();
  });
});
