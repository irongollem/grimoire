import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";
import QuestFlowNode from "./QuestFlowNode.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  viewport: { value: { x: -40, y: -20, zoom: 1.4 } },
  fitView: vi.fn(),
  setCenter: vi.fn(),
  project: vi.fn(),
  onNodesInitialized: vi.fn(),
}));

vi.mock("@vue-flow/core", () => ({
  useVueFlow: () => mocks,
  // Renders the `node-questBeat` scoped slot per node, so a QuestFlowCanvas
  // test can inspect what actually reaches QuestFlowNode — the real VueFlow
  // does the same thing, just with far more machinery around it.
  VueFlow: {
    name: "VueFlow",
    props: ["nodes"],
    template: `<div>
      <template v-for="node in nodes" :key="node.id">
        <slot name="node-questBeat" v-bind="node" />
      </template>
      <slot />
    </div>`,
  },
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

describe("QuestFlowCanvas opening view (#944)", () => {
  const chain = Array.from({ length: 15 }, (_, i) => ({
    id: `beat-${i}`, quest_id: "q", title: `B${i}`, kind: "social", visibility: "hidden", canvas_x: i * 240, canvas_y: 0,
  })) as QuestBeat[];

  beforeEach(() => {
    mocks.fitView.mockReset();
    mocks.setCenter.mockReset();
    mocks.onNodesInitialized.mockReset();
  });

  function openWith(fittedZoom: number, props: Record<string, unknown> = {}) {
    mocks.fitView.mockImplementation(() => { mocks.viewport.value = { x: 0, y: 0, zoom: fittedZoom }; return Promise.resolve(true); });
    const wrapper = mountCanvas({ beats: chain, ...props });
    const [onInitialized] = mocks.onNodesInitialized.mock.calls[0] as [() => void];
    onInitialized();
    return wrapper;
  }

  it("opens fitted when the whole quest stays readable", async () => {
    openWith(0.9);
    await new Promise((resolve) => setTimeout(resolve));
    expect(mocks.fitView).toHaveBeenCalled();
    expect(mocks.setCenter).not.toHaveBeenCalled();
  });

  it("opens a long quest on the party's beat at full size instead of a fitted strip", async () => {
    openWith(0.168, { currentBeatId: "beat-9" });
    await new Promise((resolve) => setTimeout(resolve));
    expect(mocks.setCenter).toHaveBeenCalledWith(9 * 240 + 120, 60, { zoom: 1, duration: 0 });
  });

  it("moves to the party's beat when the runtime answers after the open", async () => {
    const wrapper = openWith(0.168, { entryBeatId: "beat-0" });
    await new Promise((resolve) => setTimeout(resolve));
    expect(mocks.setCenter).toHaveBeenLastCalledWith(120, 60, { zoom: 1, duration: 0 });
    await wrapper.setProps({ currentBeatId: "beat-6" });
    expect(mocks.setCenter).toHaveBeenLastCalledWith(6 * 240 + 120, 60, { zoom: 1, duration: 0 });
  });

  it("leaves the view alone once the DM has moved it", async () => {
    const wrapper = openWith(0.168, { entryBeatId: "beat-0" });
    await new Promise((resolve) => setTimeout(resolve));
    wrapper.findComponent({ name: "VueFlow" }).vm.$emit("viewport-change-end", { x: 1, y: 2, zoom: 1 });
    await wrapper.setProps({ currentBeatId: "beat-6" });
    expect(mocks.setCenter).toHaveBeenCalledTimes(1);
  });

  it("does not reframe a canvas restoring a stored view", () => {
    mountCanvas({ beats: chain, frameOnOpen: false });
    const [onInitialized] = mocks.onNodesInitialized.mock.calls[0] as [() => void];
    onInitialized();
    expect(mocks.fitView).not.toHaveBeenCalled();
  });
});

describe("QuestFlowCanvas entry beat", () => {
  beforeEach(() => {
    mocks.fitView.mockReset().mockResolvedValue(true);
    mocks.setCenter.mockReset().mockResolvedValue(true);
    mocks.viewport.value = { x: -40, y: -20, zoom: 1.4 };
  });

  it("passes isEntry through to the node matching entryBeatId, and to no other", () => {
    const twoBeats = [
      { id: "beat-a", quest_id: "q", title: "A", kind: "social", visibility: "hidden", canvas_x: 0, canvas_y: 0 },
      { id: "beat-b", quest_id: "q", title: "B", kind: "social", visibility: "hidden", canvas_x: 100, canvas_y: 0 },
    ] as QuestBeat[];
    const wrapper = mount(QuestFlowCanvas, {
      props: { graphId: "quest-q", beats: twoBeats, edges: [] as QuestBeatEdge[], entryBeatId: "beat-b" },
      global: { stubs: { QuestGraphOutline: true, QuestFlowNode: true, QuestFlowEdge: true } },
    });
    const nodes = wrapper.findAllComponents(QuestFlowNode);
    expect(nodes.find((node) => node.props("title") === "A")!.props("isEntry")).toBe(false);
    expect(nodes.find((node) => node.props("title") === "B")!.props("isEntry")).toBe(true);
  });
});

describe("QuestFlowCanvas legend", () => {
  // Story flow frame: a small legend pinned over the canvas names the three
  // route strokes the wires themselves draw, so a DM never has to guess what
  // a dashed grey line means.
  it("names choice, parallel, and gated/cut off", () => {
    const wrapper = mountCanvas();
    expect(wrapper.text()).toContain("choice");
    expect(wrapper.text()).toContain("parallel");
    expect(wrapper.text()).toContain("gated / cut off");
  });
});

describe("QuestFlowCanvas drag", () => {
  it("reports every node a drag moved, not only the grabbed one", () => {
    const wrapper = mountCanvas();
    const nodes = [
      { id: "beat-a", position: { x: 10, y: 20 } },
      { id: "beat-b", position: { x: 30, y: 40 } },
    ];
    wrapper.findComponent({ name: "VueFlow" }).vm.$emit("node-drag-stop", { node: nodes[0], nodes });
    expect(wrapper.emitted("command")).toEqual([
      [{ type: "move", beatId: "beat-a", x: 10, y: 20 }],
      [{ type: "move", beatId: "beat-b", x: 30, y: 40 }],
    ]);
  });
});
