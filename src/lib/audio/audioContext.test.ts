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

  it("also covers iOS's non-standard interrupted state", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => true);

    ctx.setState("interrupted");

    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("leaves a suspended context alone when nothing is audible", async () => {
    const { mod, ctx } = await freshModule();
    mod.setAutoResumeGate(() => false);

    ctx.setState("suspended");

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
