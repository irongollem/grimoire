import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({ fill: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("@/ai/useRoomFill", () => ({ useRoomFill: () => ({ fill: mocks.fill, error: ref(null), isGenerating: ref(false) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useUpdateLocation: () => ({ mutateAsync: mocks.mutateAsync }) }));

const { useFillRoom } = await import("./useFillRoom");

const room = { id: "r1", name: "Shrine" } as Location;
const provenance = { generatorType: "room_generation", provider: "openai", model: "m", generatedAt: "t", edited: false };

describe("useFillRoom", () => {
  beforeEach(() => {
    mocks.fill.mockReset().mockResolvedValue({ description: "Damp stone.", ai_provenance: provenance });
    mocks.mutateAsync.mockReset().mockResolvedValue(room);
  });

  it("saves the rolled text as the room list's Save does, with the provenance as generated", async () => {
    await useFillRoom().fillRoom({ room, constraints: ["Room: Shrine"], steer: "flooded" });
    expect(mocks.fill).toHaveBeenCalledWith({ room, constraints: ["Room: Shrine"], steer: "flooded" });
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: "r1", update: { description: "Damp stone.", ai_provenance: provenance } });
  });

  it("saves nothing when the roll failed", async () => {
    mocks.fill.mockResolvedValueOnce(null);
    expect(await useFillRoom().fillRoom({ room, constraints: [], steer: "" })).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("lets a failed save throw", async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error("save failed"));
    await expect(useFillRoom().fillRoom({ room, constraints: [], steer: "" })).rejects.toThrow("save failed");
  });
});
