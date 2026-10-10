import { describe, it, expect, vi } from "vitest";
import { createSessionRecovery } from "./sessionRecovery";

function harness(options: { sessions?: boolean[]; startAt?: number } = {}) {
  const sessions = options.sessions ?? [true];
  let call = 0;
  let clock = options.startAt ?? 0;

  const hasUsableSession = vi.fn(async () => sessions[Math.min(call++, sessions.length - 1)]!);
  const refetchAll = vi.fn();
  const signOutAndRedirect = vi.fn();

  const recover = createSessionRecovery({
    hasUsableSession,
    refetchAll,
    signOutAndRedirect,
    now: () => clock,
  });

  return {
    recover,
    hasUsableSession,
    refetchAll,
    signOutAndRedirect,
    advance: (ms: number) => {
      clock += ms;
    },
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe("createSessionRecovery", () => {
  it("re-reads the session and refetches instead of signing out", async () => {
    const h = harness({ sessions: [true] });
    h.recover();
    await h.settle();

    expect(h.hasUsableSession).toHaveBeenCalledTimes(1);
    expect(h.refetchAll).toHaveBeenCalledTimes(1);
    expect(h.signOutAndRedirect).not.toHaveBeenCalled();
  });

  it("signs out only when there is genuinely no session left", async () => {
    const h = harness({ sessions: [false] });
    h.recover();
    await h.settle();

    expect(h.signOutAndRedirect).toHaveBeenCalledTimes(1);
    expect(h.refetchAll).not.toHaveBeenCalled();
  });

  // A lost session produces a burst of 401s, not one.
  it("coalesces a burst of concurrent calls into a single attempt", async () => {
    const h = harness({ sessions: [true] });
    h.recover();
    h.recover();
    h.recover();
    await h.settle();

    expect(h.hasUsableSession).toHaveBeenCalledTimes(1);
    expect(h.refetchAll).toHaveBeenCalledTimes(1);
  });

  it("gives up after repeated failures in a tight loop", async () => {
    const h = harness({ sessions: [true, true, true, true] });

    for (let i = 0; i < 4; i++) {
      h.recover();
      await h.settle();
      h.advance(100);
    }

    // Three recoveries, then escalation rather than an endless retry loop.
    expect(h.refetchAll).toHaveBeenCalledTimes(3);
    expect(h.signOutAndRedirect).toHaveBeenCalledTimes(1);
  });

  // The expected shape on iOS: a tab wakes, its token is stale, it recovers —
  // hours later the same thing happens again and must recover again.
  it("gives a woken tab a fresh budget after a quiet period", async () => {
    const h = harness({ sessions: [true, true, true, true] });

    for (let i = 0; i < 3; i++) {
      h.recover();
      await h.settle();
      h.advance(100);
    }
    expect(h.refetchAll).toHaveBeenCalledTimes(3);

    h.advance(60 * 60 * 1000);
    h.recover();
    await h.settle();

    expect(h.refetchAll).toHaveBeenCalledTimes(4);
    expect(h.signOutAndRedirect).not.toHaveBeenCalled();
  });

  it("allows a new attempt once the previous one has settled", async () => {
    const h = harness({ sessions: [true, true] });

    h.recover();
    await h.settle();
    h.recover();
    await h.settle();

    expect(h.hasUsableSession).toHaveBeenCalledTimes(2);
  });
});
