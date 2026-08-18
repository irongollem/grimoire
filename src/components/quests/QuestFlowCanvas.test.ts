import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  viewport: { value: { x: -40, y: -20, zoom: 1.4 } },
  fitView: vi.fn(),
  setCenter: vi.fn(),
  project: vi.fn(),
}));

vi.mock("@vue-flow/core", () => ({
  useVueFlow: () => mocks,
  VueFlow: { name: "VueFlow", template: "<div><slot /></div>" },
  Handle: { name: "Handle", template: "<div />" },
  Position: { Left: "left", Right: "right" },
}));

const beats = [
  { id: "beat-a", quest_id: "q", title: "A", kind: "social", visibility: "hidden", canvas_x: 0, canvas_y: 0 },
] as QuestBeat[];

function mountCanvas(props: Record<string, unknown> = {}) {
  return mount(QuestFlowCanvas, {
    props: { graphId: "quest-q", beats, edges: [] as QuestBeatEdge[], ...props },
    global: { stubs: { QuestGraphOutline: true, QuestFlowNode: true, QuestFlowEdge: true } },
  });
}

describe("QuestFlowCanvas viewport persistence", () => {
  beforeEach(() => {
    mocks.fitView.mockReset().mockResolvedValue(true);
    mocks.setCenter.mockReset().mockResolvedValue(true);
    mocks.viewport.value = { x: -40, y: -20, zoom: 1.4 };
  });

  // VueFlow only emits `viewportChangeEnd` for changes carrying a d3
  // `sourceEvent`, so a programmatic fit never reached the store and pressing
  // Fit before leaving the surface was silently discarded.
  it("records where Fit left the canvas", async () => {
    const wrapper = mountCanvas();
    await wrapper.vm.fitGraph();

    expect(mocks.fitView).toHaveBeenCalled();
    expect(wrapper.emitted("viewport-change")).toEqual([[{ x: -40, y: -20, zoom: 1.4 }]]);
  });

  it("records where Current beat left the canvas", async () => {
    const wrapper = mountCanvas({ currentBeatId: "beat-a" });
    await wrapper.vm.focusCurrent();

    expect(mocks.setCenter).toHaveBeenCalled();
    expect(wrapper.emitted("viewport-change")).toHaveLength(1);
  });

  it("records the view on the way out, whatever moved it", () => {
    const wrapper = mountCanvas();
    mocks.viewport.value = { x: 12, y: 34, zoom: 0.8 };
    wrapper.unmount();

    expect(wrapper.emitted("viewport-change")).toEqual([[{ x: 12, y: 34, zoom: 0.8 }]]);
  });

  // Storing a degenerate transform is what parks every beat off-screen on the
  // next open, so an unmeasured or torn-down canvas must report nothing.
  it("refuses to store a viewport from a canvas that never measured", () => {
    const wrapper = mountCanvas();
    mocks.viewport.value = { x: 0, y: 0, zoom: 0 };
    wrapper.unmount();

    expect(wrapper.emitted("viewport-change")).toBeUndefined();
  });
});
