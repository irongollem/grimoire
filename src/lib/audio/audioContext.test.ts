// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// The module holds its context in module state, so each test gets a fresh
// import against a fresh fake AudioContext class.

class FakeAudioContext {
  state = "running";
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  private listeners: Array<() => void> = [];
  addEventListener(type: string, fn: () => void) {
    if (type === "statechange") this.listeners.push(fn);
  }
  /** Simulate the OS flipping the context's state (e.g. an iOS interruption). */
  setState(state: string) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
}

async function freshModule() {
  vi.resetModules();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const mod = await import("@/lib/audio/audioContext");
  const ctx = mod.getAudioContext() as unknown as FakeAudioContext;
  return { mod, ctx };
}

describe("audioContext auto-resume", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("resumes an OS-suspended context while audio is audible", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => true);

    ctx.setState("suspended");

    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  // CarPlay reconnecting every two seconds, carried over into the next app:
  // each resume re-activated the audio session, the car renegotiated the link,
  // and that interrupted the context again.
  it("leaves iOS's interrupted state to the OS instead of fighting it for the session", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => true);

    ctx.setState("interrupted");

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("stops auto-resuming when the OS takes the context back straight after a resume", async () => {
    vi.useFakeTimers();
    try {
      const { mod, ctx } = await freshModule();
      mod.setAutoResumeGate(() => true);

      ctx.setState("suspended");
      vi.advanceTimersByTime(2_000); // the reported period of the CarPlay reconnects
      ctx.setState("suspended");
      vi.advanceTimersByTime(20_000);
      ctx.setState("suspended"); // halted: a quiet spell does not re-arm it either

      expect(ctx.resume).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still resumes a suspension that comes long after the last one", async () => {
    vi.useFakeTimers();
    try {
      const { mod, ctx } = await freshModule();
      mod.setAutoResumeGate(() => true);

      ctx.setState("suspended");
      vi.advanceTimersByTime(60_000);
      ctx.setState("suspended");

      expect(ctx.resume).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a tap after a halt brings the audible context back and re-arms the hook", async () => {
    vi.useFakeTimers();
    try {
      const { mod, ctx } = await freshModule();
      mod.setAutoResumeGate(() => true);
      ctx.setState("suspended");
      ctx.setState("suspended"); // halted
      ctx.resume.mockClear();

      ctx.state = "suspended";
      window.dispatchEvent(new Event("pointerdown"));
      expect(ctx.resume).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_000);
      ctx.setState("suspended");
      expect(ctx.resume).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a tap does not wake a context nobody is listening to", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => false);
    ctx.state = "suspended";

    window.dispatchEvent(new Event("pointerdown"));

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("leaves a suspended context alone when nothing is audible", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => false);

    ctx.setState("suspended");

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("never resumes a closed context", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => true);

    ctx.setState("closed");

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("does not react to the state settling back to running", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => true);

    ctx.setState("suspended");
    ctx.resume.mockClear();
    ctx.setState("running");

    expect(ctx.resume).not.toHaveBeenCalled();
  });
});

describe("getAudioContext", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands every caller the same context, since browsers cap how many can exist", async () => {
    const { mod, ctx } = await freshModule();
    expect(mod.getAudioContext()).toBe(ctx);
  });

  it("falls back to Safari's prefixed constructor", async () => {
    vi.resetModules();
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", FakeAudioContext);
    const mod = await import("@/lib/audio/audioContext");
    expect(mod.getAudioContext()).toBeInstanceOf(FakeAudioContext);
  });

  it("is null, rather than throwing, where Web Audio is missing or refuses to start", async () => {
    vi.resetModules();
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect((await import("@/lib/audio/audioContext")).getAudioContext()).toBeNull();

    vi.resetModules();
    vi.stubGlobal("AudioContext", class {
      constructor() {
        throw new Error("blocked");
      }
    });
    expect((await import("@/lib/audio/audioContext")).getAudioContext()).toBeNull();
  });
});

describe("resuming without creating", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("resumeExistingAudioContext resumes a suspended context but never builds one", async () => {
    vi.resetModules();
    const made = vi.fn();
    vi.stubGlobal("AudioContext", class extends FakeAudioContext {
      constructor() {
        super();
        made();
      }
    });
    const mod = await import("@/lib/audio/audioContext");
    mod.resumeExistingAudioContext();
    expect(made).not.toHaveBeenCalled();

    const ctx = mod.getAudioContext() as unknown as FakeAudioContext;
    mod.resumeExistingAudioContext();
    expect(ctx.resume).not.toHaveBeenCalled(); // running: nothing to resume

    ctx.state = "suspended";
    mod.resumeExistingAudioContext();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });
});
