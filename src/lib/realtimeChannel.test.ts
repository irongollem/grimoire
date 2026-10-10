import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const channel = {
    subscribe: vi.fn(),
    teardown: vi.fn(),
  };
  return {
    channel,
    channelFactory: vi.fn(() => channel),
    removeChannel: vi.fn(),
    realtime: { channels: [] as unknown[], setAuth: vi.fn(() => Promise.resolve()) },
    statusCallback: undefined as ((status: string, error?: Error) => void) | undefined,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: mocked.channelFactory,
    removeChannel: mocked.removeChannel,
    realtime: mocked.realtime,
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
    mocked.removeChannel.mockResolvedValue("ok");
    mocked.realtime.channels = [];
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

  it("waits for the previous channel on a topic to leave before joining again", async () => {
    let acknowledge!: (status: string) => void;
    mocked.removeChannel.mockReturnValueOnce(new Promise((resolve) => { acknowledge = resolve; }));
    const bind = vi.fn((channel) => channel);

    createRealtimeChannel({ topic: "live-sync", bind }).stop();
    createRealtimeChannel({ topic: "live-sync", bind });
    // realtime-js would hand the still-joined channel back here, and binding
    // to it throws, so nothing may be asked for until the leave is answered.
    expect(mocked.channelFactory).toHaveBeenCalledOnce();

    acknowledge("ok");
    await vi.waitFor(() => expect(mocked.channelFactory).toHaveBeenCalledTimes(2));
    expect(bind).toHaveBeenCalledTimes(2);
    expect(mocked.channel.teardown).not.toHaveBeenCalled();
  });

  it("does not join for a subscriber that stopped while it was waiting", async () => {
    createRealtimeChannel({ topic: "live-sync", bind: (channel) => channel }).stop();
    createRealtimeChannel({ topic: "live-sync", bind: (channel) => channel }).stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocked.channelFactory).toHaveBeenCalledOnce();
    expect(mocked.removeChannel).toHaveBeenCalledOnce();
  });

  it("evicts a channel whose leave timed out, so the topic can be joined again", async () => {
    mocked.removeChannel.mockResolvedValueOnce("timed out");
    mocked.realtime.channels = [mocked.channel];

    createRealtimeChannel({ topic: "live-sync", bind: (channel) => channel }).stop();
    createRealtimeChannel({ topic: "live-sync", bind: (channel) => channel });

    await vi.waitFor(() => expect(mocked.channelFactory).toHaveBeenCalledTimes(2));
    expect(mocked.channel.teardown).toHaveBeenCalledOnce();
    expect(mocked.realtime.channels).toEqual([]);
  });

  it("joins a different topic without waiting", () => {
    mocked.removeChannel.mockReturnValueOnce(new Promise(() => {}));

    createRealtimeChannel({ topic: "a", bind: (channel) => channel }).stop();
    createRealtimeChannel({ topic: "b", bind: (channel) => channel });

    expect(mocked.channelFactory).toHaveBeenCalledTimes(2);
  });

  it("joins a public channel by default, without asking for auth", () => {
    createRealtimeChannel({ topic: "public-topic", bind: (channel) => channel });

    expect(mocked.channelFactory).toHaveBeenCalledWith("public-topic");
    expect(mocked.realtime.setAuth).not.toHaveBeenCalled();
  });

  it("joins a private channel only after the socket has its token", async () => {
    createRealtimeChannel({ topic: "doorbell:abc", isPrivate: true, bind: (channel) => channel });

    expect(mocked.realtime.setAuth).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocked.channelFactory).toHaveBeenCalledOnce());
    expect(mocked.channelFactory).toHaveBeenCalledWith("doorbell:abc", { config: { private: true } });
  });

  it("still joins a private channel when the token fetch fails", async () => {
    mocked.realtime.setAuth.mockRejectedValueOnce(new Error("no session"));
    createRealtimeChannel({ topic: "doorbell:abc", isPrivate: true, bind: (channel) => channel });

    await vi.waitFor(() => expect(mocked.channelFactory).toHaveBeenCalledOnce());
  });

  it("does not join a private channel that was stopped while waiting for auth", async () => {
    createRealtimeChannel({ topic: "doorbell:abc", isPrivate: true, bind: (channel) => channel }).stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocked.channelFactory).not.toHaveBeenCalled();
  });
});
