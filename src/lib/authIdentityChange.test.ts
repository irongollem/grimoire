import { describe, expect, it } from "vitest";
import { createIdentityChangeGate } from "./authIdentityChange";

describe("createIdentityChangeGate", () => {
  it("reports the first signed-in identity — the cache before it belonged to nobody", () => {
    const changed = createIdentityChangeGate();
    expect(changed("dm-1")).toBe(true);
  });

  it("stays quiet while auth-js re-announces the same session", () => {
    const changed = createIdentityChangeGate();
    changed("dm-1");
    // SIGNED_IN fires again on tab focus and on a restored session; the whole
    // app refetching each time would be a storm for nothing.
    expect(changed("dm-1")).toBe(false);
    expect(changed("dm-1")).toBe(false);
  });

  it("reports a different account, so one DM never reads the other's cache", () => {
    const changed = createIdentityChangeGate();
    changed("dm-1");
    expect(changed("dm-2")).toBe(true);
  });

  it("says nothing on sign-out, and reports the sign-in that follows", () => {
    const changed = createIdentityChangeGate();
    changed("dm-1");
    // Signing out heads for /login; the cache is about to belong to nobody.
    expect(changed(null)).toBe(false);
    // This is the reported bug: back in as the same DM, over a cache filled
    // while signed out (an RLS-empty `200 []` under an identical query key).
    expect(changed("dm-1")).toBe(true);
  });

  it("does not report a signed-out app staying signed out", () => {
    const changed = createIdentityChangeGate();
    expect(changed(null)).toBe(false);
    expect(changed(null)).toBe(false);
  });
});
