import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestFlowCanvas from "./QuestFlowCanvas.vue";
import QuestFlowNode from "./QuestFlowNode.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  viewport: { value: { x: -40, y: -20, zoom: 1.4 } },
  fitView: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomTo: vi.fn(),
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

describe("QuestFlowCanvas canvas controls", () => {
  beforeEach(() => {
    mocks.fitView.mockReset().mockResolvedValue(true);
    mocks.zoomIn.mockReset();
    mocks.zoomOut.mockReset();
    mocks.zoomTo.mockReset();
  });

  it("pans on the wheel and the left or middle button, and never zooms on the plain wheel", () => {
    const attrs = mountCanvas().findComponent({ name: "VueFlow" }).vm.$attrs;
    expect(attrs["pan-on-scroll"]).toBe(true);
    expect(attrs["zoom-on-scroll"]).toBe(false);
    expect(attrs["pan-on-drag"]).toEqual([0, 1]);
  });

  // Earlier tests leave their canvases mounted, so every call is asserted as "at least once" rather than counted.
  it("maps the zoom keys to the flow while the pointer is over the graph", async () => {
    const wrapper = mountCanvas();
    await wrapper.find(".quest-flow-canvas").trigger("pointerenter");
    const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, ...init }));
    press({ key: "=", code: "Equal", ctrlKey: true });
    press({ key: "-", code: "Minus", ctrlKey: true });
    press({ key: "1", code: "Digit1", ctrlKey: true });
    press({ key: "!", code: "Digit1", shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve));
    expect(mocks.zoomIn).toHaveBeenCalled();
    expect(mocks.zoomOut).toHaveBeenCalled();
    expect(mocks.zoomTo).toHaveBeenCalledWith(1, expect.objectContaining({ duration: expect.any(Number) }));
    expect(mocks.fitView).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("leaves the zoom keys to the browser when the pointer is elsewhere on the page", async () => {
    const wrapper = mountCanvas();
    await wrapper.find(".quest-flow-canvas").trigger("pointerleave");
    const key = new KeyboardEvent("keydown", { key: "0", code: "Digit0", ctrlKey: true, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
  });

  it("lets Space through to the flow's own hand", () => {
    mountCanvas();
    const space = new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
  });

  it("stops listening when it goes away", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    mountCanvas().unmount();
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    remove.mockRestore();
  });
});

describe("QuestFlowCanvas authoring gestures", () => {
  beforeEach(() => {
    mocks.project.mockReset().mockReturnValue({ x: 5, y: 6 });
  });
  const flowOf = (props: Record<string, unknown> = {}) => {
    const wrapper = mountCanvas(props);
    return { wrapper, flow: wrapper.findComponent({ name: "VueFlow" }) };
  };
  const commands = (w: ReturnType<typeof mountCanvas>) => (w.emitted("command") ?? []).map((e) => e[0]);

  it("a drawn connection links the two beats, but never a beat to itself", () => {
    const { wrapper, flow } = flowOf();
    flow.vm.$emit("connect", { source: "beat-a", target: "beat-a" });
    flow.vm.$emit("connect", { source: "beat-a", target: "beat-b" });
    expect(commands(wrapper)).toEqual([{ type: "link", sourceBeatId: "beat-a", targetBeatId: "beat-b" }]);
  });

  it("a read-only canvas links nothing", () => {
    const { wrapper, flow } = flowOf({ editable: false });
    flow.vm.$emit("connect", { source: "beat-a", target: "beat-b" });
    expect(commands(wrapper)).toEqual([]);
  });

  it("dropping a drag on empty canvas creates a beat there, linked from where the drag began", () => {
    const { wrapper, flow } = flowOf();
    flow.vm.$emit("connect-start", { nodeId: "beat-a" });
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    expect(mocks.project).toHaveBeenCalledWith({ x: 100, y: 200 });
    expect(commands(wrapper)).toEqual([{ type: "create", sourceBeatId: "beat-a", x: 5, y: 6 }]);
  });

  it("a drag that ended on another beat links it and creates nothing", () => {
    const { wrapper, flow } = flowOf();
    flow.vm.$emit("connect-start", { nodeId: "beat-a" });
    flow.vm.$emit("connect", { source: "beat-a", target: "beat-b" });
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    expect(commands(wrapper)).toEqual([{ type: "link", sourceBeatId: "beat-a", targetBeatId: "beat-b" }]);
  });

  it("a drag that ended on another beat does not suppress the next drag's create", () => {
    const { wrapper, flow } = flowOf();
    flow.vm.$emit("connect-start", { nodeId: "beat-a" });
    flow.vm.$emit("connect", { source: "beat-a", target: "beat-b" });
    flow.vm.$emit("connect-end", { clientX: 1, clientY: 2 });
    flow.vm.$emit("connect-start", { nodeId: "beat-a" });
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    expect(commands(wrapper).at(-1)).toEqual({ type: "create", sourceBeatId: "beat-a", x: 5, y: 6 });
  });

  it("an end event with no drag in progress creates nothing, and a finished drag cannot be ended twice", () => {
    const { wrapper, flow } = flowOf();
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    flow.vm.$emit("connect-start", { nodeId: "beat-a" });
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    expect(commands(wrapper)).toHaveLength(1);
  });

  it("a read-only canvas creates nothing from a dropped drag", () => {
    const { wrapper, flow } = flowOf({ editable: false });
    flow.vm.$emit("connect-start", { nodeId: "beat-a" });
    flow.vm.$emit("connect-end", { clientX: 100, clientY: 200 });
    expect(commands(wrapper)).toEqual([]);
  });

  it("clicking a node selects that beat", () => {
    const { wrapper, flow } = flowOf();
    flow.vm.$emit("node-click", { node: { id: "beat-a" } });
    expect(commands(wrapper)).toEqual([{ type: "select", beatId: "beat-a" }]);
  });

  it("Add next on a beat creates its follower 320 to the right on the same row", () => {
    const placed = [{ id: "beat-a", quest_id: "q", title: "A", kind: "social", visibility: "hidden", canvas_x: 40, canvas_y: 90 }] as QuestBeat[];
    const wrapper = mountCanvas({ beats: placed });
    wrapper.findComponent(QuestFlowNode).vm.$emit("create-next");
    expect(commands(wrapper)).toEqual([{ type: "create", sourceBeatId: "beat-a", x: 360, y: 90 }]);
  });

  it("a node's Delete is dropped on a read-only canvas and forwarded on an editable one", () => {
    const editable = mountCanvas();
    editable.findComponent(QuestFlowNode).vm.$emit("delete");
    expect(commands(editable)).toEqual([{ type: "delete-beat", beatId: "beat-a" }]);
    const readOnly = mountCanvas({ editable: false });
    readOnly.findComponent(QuestFlowNode).vm.$emit("delete");
    expect(commands(readOnly)).toEqual([]);
  });

  it("leaves the zoom keys to a text field the DM is typing in, even with the pointer over the graph", async () => {
    const wrapper = mountCanvas();
    await wrapper.find(".quest-flow-canvas").trigger("pointerenter");
    const input = document.createElement("input");
    document.body.appendChild(input);
    const key = new KeyboardEvent("keydown", { key: "=", code: "Equal", ctrlKey: true, cancelable: true, bubbles: true });
    input.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    input.remove();
    wrapper.unmount();
  });
});
