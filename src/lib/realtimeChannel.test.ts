import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const channel = {
    subscribe: vi.fn(),
  };
  return {
    channel,
    channelFactory: vi.fn(() => channel),
    removeChannel: vi.fn(),
    statusCallback: undefined as ((status: string, error?: Error) => void) | undefined,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: mocked.channelFactory,
    removeChannel: mocked.removeChannel,
  },
}));

import { createRealtimeChannel } from "@/lib/realtimeChannel";

describe("createRealtimeChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.statusCallback = undefined;
    mocked.channel.subscribe.mockImplementation((callback) => {
      mocked.statusCallback = callback;
      return mocked.channel;
    });
  });

  it("shares status recovery and makes late callbacks inert after stop", () => {
    const reconcile = vi.fn();
    const onStatus = vi.fn();
    const handle = createRealtimeChannel({
      topic: "test-topic",
      bind: (channel) => channel,
      reconcile,
      onStatus,
      heal: { throttleMs: 0 },
    });

    mocked.statusCallback?.("SUBSCRIBED");
    mocked.statusCallback?.("SUBSCRIBED");
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(2);

    handle.stop();
    mocked.statusCallback?.("CLOSED");
    mocked.statusCallback?.("SUBSCRIBED");
    handle.reconcile();

    expect(mocked.removeChannel).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(2);
  });

  it("supports ephemeral channels without attaching recovery lifecycle", () => {
    const onStatus = vi.fn();
    const handle = createRealtimeChannel({
      topic: "presence-topic",
      bind: (channel) => channel,
      onStatus,
    });

    mocked.statusCallback?.("SUBSCRIBED");
    handle.reconcile();
    handle.stop();
    mocked.statusCallback?.("CLOSED");

    expect(onStatus).toHaveBeenCalledOnce();
    expect(mocked.removeChannel).toHaveBeenCalledOnce();
  });
});
