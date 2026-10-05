import { describe, expect, it } from "vitest";
import { nextTick, ref, watch } from "vue";
import { isUnreadArrival } from "./chatUnread";

const msg = (id: string, at: string, user = "dm") => ({ id, created_at: at, user_id: user });

describe("isUnreadArrival", () => {
  it("lights for a newer message from someone else", () => {
    expect(isUnreadArrival(msg("a", "2026-01-01"), msg("b", "2026-01-02"), "me")).toBe(true);
  });
  it("ignores the first load, my own message, and a delete promoting an older one", () => {
    expect(isUnreadArrival(null, msg("a", "2026-01-01"), "me")).toBe(false);
    expect(isUnreadArrival(msg("a", "2026-01-01"), msg("b", "2026-01-02", "me"), "me")).toBe(false);
    expect(isUnreadArrival(msg("b", "2026-01-02"), msg("a", "2026-01-01"), "me")).toBe(false);
  });
  it("fires through a watcher on the newest message when the array is mutated in place", async () => {
    // The regression: push + sort on a ref([]) never trips a watch on the ref.
    const messages = ref([msg("a", "2026-01-01")]);
    let unread = false;
    watch(
      () => messages.value[messages.value.length - 1] ?? null,
      (next, prev) => { if (isUnreadArrival(prev ?? null, next, "me")) unread = true; },
    );
    messages.value.push(msg("b", "2026-01-02"));
    messages.value.sort((x, y) => x.created_at.localeCompare(y.created_at));
    await nextTick();
    expect(unread).toBe(true);
  });
});
