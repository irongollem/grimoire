import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useLocationSubtreeIds } from "./useLocationSubtree";
import type { LocationSummary } from "@/types/location.types";

const all = ref<LocationSummary[] | undefined>(undefined);
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: all }) }));

const loc = (id: string, parent_id: string | null) => ({ id, parent_id, name: id }) as LocationSummary;

describe("useLocationSubtreeIds", () => {
  it("is empty until the campaign's locations are in, so no read starts on a half answer", () => {
    all.value = undefined;
    expect(useLocationSubtreeIds(ref("town")).value).toEqual([]);
  });

  it("is the place plus every descendant", () => {
    all.value = [loc("town", null), loc("inn", "town"), loc("cellar", "inn"), loc("elsewhere", null)];
    expect(useLocationSubtreeIds(ref("town")).value.sort()).toEqual(["cellar", "inn", "town"]);
  });

  it("is just the place for a leaf", () => {
    all.value = [loc("town", null), loc("inn", "town")];
    expect(useLocationSubtreeIds(ref("inn")).value).toEqual(["inn"]);
  });
});
