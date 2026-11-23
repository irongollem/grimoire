import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { Connection } from "@/types/connections.types";

const state = vi.hoisted(() => ({
  isDM: true,
  previewing: false,
  entries: [] as unknown[],
  ties: [] as unknown[],
  entriesEnabled: [] as boolean[],
  tieSubjects: [] as (string | null)[],
  openBackstory: vi.fn(),
  useBackstoryEntry: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return state.isDM; } }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ get dmPreviewMode() { return state.previewing; } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: (opts?: { enabled?: () => boolean }) => {
    state.entriesEnabled.push(opts?.enabled ? opts.enabled() : true);
    return { data: computed(() => (opts?.enabled?.() === false ? undefined : state.entries)) };
  },
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useConnections: (_kind: unknown, id: () => string | null) => {
    const subject = id();
    state.tieSubjects.push(subject);
    return { data: computed(() => (id() === null ? undefined : state.ties)) };
  },
}));
// The entry-making read: this composable must never reach it, or looking at a character would create one.
vi.mock("@/composables/canon/useBackstory", () => ({
  openBackstory: state.openBackstory,
  useBackstoryEntry: state.useBackstoryEntry,
  useOpenBackstory: () => ({ mutate: state.openBackstory }),
}));

import { useBackstoryOrigin } from "./useBackstoryOrigin";

function run(...args: Parameters<typeof useBackstoryOrigin>) {
  let result!: ReturnType<typeof useBackstoryOrigin>;
  mount(
    defineComponent({
      setup() {
        result = useBackstoryOrigin(...args);
        return () => h("div");
      },
    }),
  );
  return result;
}

const tie = (over: Partial<Connection>) => ({ row_id: "r", type: "about", other_kind: "npc", other_id: "n1", ...over }) as Connection;
const backstory = canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" });

describe("useBackstoryOrigin", () => {
  beforeEach(() => {
    state.isDM = true;
    state.previewing = false;
    state.entries = [backstory];
    state.ties = [];
    state.entriesEnabled = [];
    state.tieSubjects = [];
    state.openBackstory.mockReset();
    state.useBackstoryEntry.mockReset();
  });

  // Bug: a place the entry is about, or an NPC tied another way, was marked "From Canon" too.
  it("holds the NPCs the entry is about, and not places or NPCs tied another way", () => {
    state.ties = [
      tie({ other_id: "n1" }),
      tie({ other_id: "n2", type: "knows" }),
      tie({ other_id: "l1", other_kind: "location" }),
      tie({ other_id: "n3" }),
    ];
    const origin = run("m1");
    expect([...(origin.value?.npcIds ?? [])].sort()).toEqual(["n1", "n3"]);
    expect(origin.value?.entryId).toBe("b1");
  });

  // Bug: another character's backstory entry was read for this one.
  it("finds the entry of this character only", () => {
    state.entries = [canonEntry({ id: "other", part: "backstory", party_member_id: "m2" }), canonEntry({ id: "lore", part: "lore", party_member_id: "m1" }), backstory];
    run("m1");
    expect(state.tieSubjects.at(-1)).toBe("b1");
  });

  // Bug: looking at a character with no backstory yet made one (the entry-making read was used on the character's page).
  it("answers undefined and creates nothing when the character has no backstory entry", () => {
    state.entries = [];
    const origin = run("m1");
    expect(origin.value).toBeUndefined();
    expect(state.openBackstory).not.toHaveBeenCalled();
    expect(state.useBackstoryEntry).not.toHaveBeenCalled();
    expect(state.tieSubjects.at(-1)).toBeNull();
  });

  // Bug: a player's page asked for canon, which only the DM may read, and showed an error or a stray marker.
  it("enables no read for a player", () => {
    state.isDM = false;
    const origin = run("m1");
    expect(state.entriesEnabled).toEqual([false]);
    expect(state.tieSubjects).toEqual([null]);
    expect(origin.value).toBeUndefined();
  });

  // Bug: a DM previewing the player portal made the canon request the player's page must not make.
  it("enables no read while the DM previews the player portal", () => {
    state.previewing = true;
    const origin = run("m1");
    expect(state.entriesEnabled).toEqual([false]);
    expect(origin.value).toBeUndefined();
  });

  // Bug: the Canon page read the entries a second time although it already held the entry.
  it("uses an entry in hand without reading the entries", () => {
    state.entries = [];
    state.isDM = false; // the caller has already proven access
    state.ties = [tie({ other_id: "n9" })];
    const origin = run("m1", ref(backstory));
    expect(state.entriesEnabled).toEqual([false]);
    expect([...(origin.value?.npcIds ?? [])]).toEqual(["n9"]);
  });

  it("answers undefined while the entry in hand is not made yet", () => {
    expect(run("m1", ref(null)).value).toBeUndefined();
  });
});
