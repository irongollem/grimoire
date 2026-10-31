import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAddSiteLevel } from "./useAddSiteLevel";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useCreateLocation: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => String(e) }) }));

const site = { id: "ash", campaign_id: "c1", location_type: "dungeon" as const };

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

// #1125: a new level opens in the full-screen editor, ready to draw; Build no longer exists to open it in.
describe("useAddSiteLevel", () => {
  it("files the level under the site, flagged as a level, and opens the new level's editor on its Drawing", async () => {
    mocks.create.mockResolvedValue({ id: "lvl2" });
    const outcome = await useAddSiteLevel().addLevel(site, 2);
    expect(outcome).toBe("added");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "ash", name: "Level 2", is_level: true, campaign_id: "c1" }));
    expect(mocks.push).toHaveBeenCalledWith("/locations/lvl2/map?layer=drawing");
  });

  it("hands a refused quota back to the host and goes nowhere", async () => {
    mocks.create.mockRejectedValue({ message: "quota_exceeded" });
    expect(await useAddSiteLevel().addLevel(site, 2)).toBe("quota");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("toasts any other failure and goes nowhere", async () => {
    mocks.create.mockRejectedValue(new Error("network"));
    expect(await useAddSiteLevel().addLevel(site, 2)).toBe("failed");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});
