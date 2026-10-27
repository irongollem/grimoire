import { beforeEach, describe, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { LocationState } from "@/types/locationState.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));

import {
  buildDoorStateIndex,
  buildLocationStateIndex,
  useAssertDoorState,
  useAssertLocationState,
  useDoorStateForSite,
  useLocationStateForRooms,
} from "./useLocationState";

function row(overrides: Partial<LocationState> = {}): LocationState {
  return {
    location_id: "room-a",
    fact: "cleared",
    value: true,
    asserted_by: "dm-1",
    asserted_note: null,
    door_id: null,
    asserted_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function doorRow(overrides: Partial<LocationState> = {}): LocationState {
  return {
    location_id: "site-a",
    door_id: "door-1",
    fact: "unlocked",
    value: true,
    asserted_by: "dm-1",
    asserted_note: null,
    asserted_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildLocationStateIndex", () => {
  // The core distinction the whole feature exists to preserve: a fact nobody
  // has ever asserted must read as "unknown", never as a synthesized `false`.
  it("leaves an unasserted fact absent rather than defaulting it to false", () => {
    const index = buildLocationStateIndex([row({ fact: "cleared", value: true })]);
    const forRoom = index.get("room-a");
    expect(forRoom?.cleared).toBeDefined();
    expect(forRoom?.looted).toBeUndefined();
    expect(forRoom?.explored).toBeUndefined();
  });

  it("distinguishes an explicit false assertion from an absent one", () => {
    const index = buildLocationStateIndex([
      row({ location_id: "room-a", fact: "cleared", value: false }),
    ]);
    const cleared = index.get("room-a")?.cleared;
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe(false);
  });

  it("keeps each location's facts independent of one another", () => {
    const index = buildLocationStateIndex([
      row({ location_id: "room-a", fact: "cleared", value: true }),
      row({ location_id: "room-a", fact: "looted", value: false }),
      row({ location_id: "room-b", fact: "cleared", value: false }),
    ]);
    expect(index.get("room-a")?.cleared?.value).toBe(true);
    expect(index.get("room-a")?.looted?.value).toBe(false);
    expect(index.get("room-a")?.explored).toBeUndefined();
    expect(index.get("room-b")?.cleared?.value).toBe(false);
    expect(index.get("room-b")?.looted).toBeUndefined();
  });

  // `location_state` is already `distinct on (location_id, fact)` newest-first,
  // so this collision should never occur from a real query result — but the
  // function must not be at the mercy of array order if it ever does.
  it("keeps the newest row when two rows collide on the same (location, fact)", () => {
    const older = row({ value: true, asserted_at: "2026-09-01T00:00:00Z", asserted_note: "first pass" });
    const newer = row({ value: false, asserted_at: "2026-09-03T00:00:00Z", asserted_note: "actually, no" });

    const oldThenNew = buildLocationStateIndex([older, newer]);
    expect(oldThenNew.get("room-a")?.cleared?.value).toBe(false);
    expect(oldThenNew.get("room-a")?.cleared?.asserted_note).toBe("actually, no");

    const newThenOld = buildLocationStateIndex([newer, older]);
    expect(newThenOld.get("room-a")?.cleared?.value).toBe(false);
    expect(newThenOld.get("room-a")?.cleared?.asserted_note).toBe("actually, no");
  });
});

describe("equal timestamps", () => {
  // The view returns newest-first and orders by the log's sequence, so on a tie the
  // row seen FIRST is the newer assertion (written in the same transaction).
  it("keeps the first row seen on a tie, for locations and for doors", () => {
    const first = row({ value: false, asserted_at: "2026-09-01T00:00:00Z" });
    const second = row({ value: true, asserted_at: "2026-09-01T00:00:00Z" });
    expect(buildLocationStateIndex([first, second]).get("room-a")?.cleared?.value).toBe(false);

    const doorFirst = doorRow({ value: false, asserted_at: "2026-09-01T00:00:00Z" });
    const doorSecond = doorRow({ value: true, asserted_at: "2026-09-01T00:00:00Z" });
    expect(buildDoorStateIndex([doorFirst, doorSecond]).get("door-1")?.unlocked?.value).toBe(false);
  });
});

describe("buildDoorStateIndex", () => {
  it("indexes a row under its door, not its site", () => {
    const index = buildDoorStateIndex([doorRow()]);
    expect(index.get("door-1")?.unlocked?.value).toBe(true);
    expect(index.get("site-a")).toBeUndefined();
  });

  it("ignores location facts — a null door_id never lands in this index", () => {
    const index = buildDoorStateIndex([row({ fact: "cleared", value: true })]);
    expect(index.size).toBe(0);
  });

  it("leaves an unasserted door fact absent rather than defaulting it to false", () => {
    const index = buildDoorStateIndex([doorRow({ fact: "unlocked", value: true })]);
    const forDoor = index.get("door-1");
    expect(forDoor?.unlocked).toBeDefined();
    expect(forDoor?.found).toBeUndefined();
  });

  it("keeps two doors of the same site independent of one another", () => {
    const index = buildDoorStateIndex([
      doorRow({ door_id: "door-1", fact: "found", value: true }),
      doorRow({ door_id: "door-2", fact: "found", value: false }),
    ]);
    expect(index.get("door-1")?.found?.value).toBe(true);
    expect(index.get("door-2")?.found?.value).toBe(false);
  });

  it("keeps the newest row when two rows collide on the same (door, fact)", () => {
    const older = doorRow({ value: true, asserted_at: "2026-09-01T00:00:00Z" });
    const newer = doorRow({ value: false, asserted_at: "2026-09-03T00:00:00Z" });
    const index = buildDoorStateIndex([older, newer]);
    expect(index.get("door-1")?.unlocked?.value).toBe(false);
  });
});

describe("state reads and the assertion log", () => {
  beforeEach(() => fake.reset());

  function inApp<T>(setup: () => T): T {
    let out!: T;
    mount(
      defineComponent({
        setup() {
          out = setup();
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return out;
  }

  it("a rooms list reads the facts of exactly the rooms it shows", async () => {
    fake.seed("location_state", [
      { ...row({ location_id: "room-a", fact: "cleared" }) },
      { ...row({ location_id: "room-b", fact: "looted" }) },
      { ...row({ location_id: "room-z", fact: "cleared" }) },
    ]);
    const rooms = inApp(() => useLocationStateForRooms(ref(["room-b", "room-a"])));
    await vi.waitFor(() => expect(rooms.stateOf("room-a", "cleared")?.value).toBe(true));
    expect(rooms.stateOf("room-b", "looted")?.value).toBe(true);
    expect(rooms.stateOf("room-z", "cleared")).toBeUndefined();
  });

  it("a rooms list with no rooms reads nothing", async () => {
    inApp(() => useLocationStateForRooms(ref<string[]>([])));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("a site's door facts are this site's door rows only, and a failed read is an error", async () => {
    fake.seed("location_state", [
      { ...doorRow({ location_id: "site-a", door_id: "door-1", fact: "found" }) },
      { ...doorRow({ location_id: "site-b", door_id: "door-9", fact: "found" }) },
      { ...row({ location_id: "site-a", fact: "cleared" }) },
    ]);
    const doors = inApp(() => useDoorStateForSite("site-a"));
    await vi.waitFor(() => expect(doors.stateOf("door-1", "found")?.value).toBe(true));
    expect(doors.stateOf("door-9", "found")).toBeUndefined();
    expect(doors.data.value).toHaveLength(1);

    fake.failNext("location_state", { message: "boom" });
    const failed = inApp(() => useDoorStateForSite("site-c"));
    await vi.waitFor(() => expect(failed.isError.value).toBe(true));
  });

  it("asserting a fact appends an event as the signed-in user, and asserting the opposite is a second event, not an edit", async () => {
    const assert = inApp(() => useAssertLocationState());
    await assert.mutateAsync({ location_id: "room-a", fact: "cleared", value: true });
    await assert.mutateAsync({ location_id: "room-a", fact: "cleared", value: false });
    expect(fake.rows("location_state_events")).toMatchObject([
      { location_id: "room-a", fact: "cleared", value: true, user_id: "dm-1" },
      { location_id: "room-a", fact: "cleared", value: false, user_id: "dm-1" },
    ]);
  });

  it("a door assertion carries the door and the site its two spaces share", async () => {
    const assert = inApp(() => useAssertDoorState());
    await assert.mutateAsync({ location_id: "site-a", door_id: "door-1", fact: "unlocked", value: true });
    expect(fake.rows("location_state_events")).toMatchObject([{ location_id: "site-a", door_id: "door-1", fact: "unlocked", value: true }]);
  });
});
