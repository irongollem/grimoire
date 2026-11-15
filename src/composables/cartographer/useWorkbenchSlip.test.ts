import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { emptyLayers } from "@/types/dungeonMap.types";
import { useWorkbenchSlip } from "./useWorkbenchSlip";
import type { PlanTool, usePlanPalette, ZoningKind } from "./usePlanPalette";

vi.mock("@/composables/cartographer/useLibraryDressing", () => ({ useAllLibraryDressing: () => ({ data: ref([]) }) }));

function titleFor(tool: PlanTool, kind: ZoningKind): string {
  const plan = { planTool: ref(tool), zoneKind: ref(kind), traceTool: ref("pen") } as unknown as ReturnType<typeof usePlanPalette>;
  const slip = useWorkbenchSlip({
    layers: ref(emptyLayers()),
    activeTool: ref("select"),
    placeItem: ref(null),
    selectedDressingId: ref(null),
    dressingCatalog: ref(new Map()),
    packRuntime: computed(() => null),
    plan,
    altHeld: () => false,
    changedSinceLastPublish: ref(null),
    publishedSiteCount: () => 0,
  });
  return slip.planToolLabel.value;
}

describe("the Zoning slip title", () => {
  it("says what an Assign click makes: a room, or the lower-cased kind", () => {
    expect(titleFor("assign", "room")).toBe("Assign as room");
    expect(titleFor("assign", "hazard")).toBe("Assign as hazard");
  });

  it("keeps the trace tool on the Zone title and adds nothing to Door", () => {
    expect(titleFor("zone", "hazard")).toBe("Zone · Pen");
    expect(titleFor("door", "hazard")).toBe("Door");
  });
});
