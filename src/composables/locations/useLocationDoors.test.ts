import { describe, it, expect } from "vitest";
import { doorsFromRoomPerspective } from "./useLocationDoors";
import { doorsFromRoomPerspective as doorsFromRoomPerspectiveImpl } from "@/lib/locations/doors";

// The merge logic itself moved to `lib/locations/doors.ts` (#868), so it can be
// shared with the site-wide "Ways out" panel — see `doors.test.ts` for its real
// coverage. This composable only re-exports it for its existing callers
// (`LocationDoors.vue`); this test is the one thing worth pinning here: the
// re-export must stay the SAME function, not a copy that could drift from it.
describe("useLocationDoors re-export", () => {
  it("doorsFromRoomPerspective is the implementation in lib/locations/doors.ts, not a copy", () => {
    expect(doorsFromRoomPerspective).toBe(doorsFromRoomPerspectiveImpl);
  });
});
