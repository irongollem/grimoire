import { QueryClient } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), queryClient: null as unknown }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: mocks.rpc } }));
vi.mock("@tanstack/vue-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/vue-query")>();
  return {
    ...actual,
    useQueryClient: () => mocks.queryClient,
    useMutation: (options: unknown) => options,
  };
});

import { setQuestBeatPositions, useSetQuestBeatPositions } from "./useQuestFlow";

type Options = {
  mutationFn: (input: unknown) => Promise<number>;
  onMutate: (input: unknown) => Promise<{ key: unknown[]; previous: unknown }>;
  onError: (error: Error, input: unknown, context: { key: unknown[]; previous: unknown }) => void;
  onSettled: (data: unknown, error: unknown, input: unknown) => void;
};

const beat = (id: string, x: number, y: number) => ({ id, quest_id: "q1", canvas_x: x, canvas_y: y });

describe("setQuestBeatPositions", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("sends every position in one RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    const positions = [{ id: "a", x: 1, y: 2 }, { id: "b", x: 3, y: 4 }];
    expect(await setQuestBeatPositions("q1", positions)).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("set_quest_beat_positions", { p_quest_id: "q1", p_positions: positions });
  });

  it("throws the RPC error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Not authorized") });
    await expect(setQuestBeatPositions("q1", [])).rejects.toThrow("Not authorized");
  });
});

describe("useSetQuestBeatPositions", () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    mocks.queryClient = client;
  });

  it("moves all beats optimistically, restores on error, invalidates once", async () => {
    const options = useSetQuestBeatPositions() as unknown as Options;
    const original = [beat("a", 0, 0), beat("b", 0, 0), beat("c", 5, 5)];
    const key = ["quest_beats", "q1"];
    client.setQueryData(key, original);

    const input = { questId: "q1", positions: [{ id: "a", x: 10, y: 11 }, { id: "b", x: 20, y: 21 }] };
    const context = await options.onMutate(input);
    expect(client.getQueryData(key)).toEqual([beat("a", 10, 11), beat("b", 20, 21), beat("c", 5, 5)]);

    options.onError(new Error("x"), input, context);
    expect(client.getQueryData(key)).toEqual(original);

    const invalidate = vi.spyOn(client, "invalidateQueries");
    options.onSettled(2, null, input);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });
});
