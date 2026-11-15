// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));

import StudioInspector from "./StudioInspector.vue";
import { addCutout, addMotionChoice, applyOp, newScene, setThrowsLight } from "@/lib/bookNook/edit";
import { addMotion } from "@/lib/bookNook/motions";
import { motionFor } from "@/lib/bookNook/presets";

const room = newScene({ id: "n", title: "N", room: { url: "r", width: 2400, height: 1350 } });
const withChair = addCutout(room, { id: "chair-abc123", src: "c", width: 400, height: 400 }, { x: 1, y: 1 });
const aspects = new Map([["plate", 0.5625], ["chair-abc123", 1]]);
const chair = { kind: "layer", id: "chair-abc123" } as const;
const mountInspector = (target: Parameters<typeof mount<typeof StudioInspector>>[1] extends never ? never : unknown, scene = withChair, apply = vi.fn()) =>
  mount(StudioInspector, { props: { target: target as never, scene, aspects, drawing: null, apply } });
const button = (w: ReturnType<typeof mountInspector>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("StudioInspector", () => {
  it("offers no Delete, name field or depth for the picture, and a way to replace the room", async () => {
    const w = mountInspector({ kind: "layer", id: "plate" });
    expect(w.text()).toContain("The picture");
    expect(w.text()).toContain("Every depth is measured from the picture");
    expect(w.text()).not.toContain("Delete");
    expect(w.find("input").exists()).toBe(false);
    await button(w, "Replace the room…")?.trigger("click");
    expect(w.emitted("replace-room")).toHaveLength(1);
  });

  it("deletes a cut-out only after the confirm says yes", async () => {
    // Bug: a cancelled confirm that still deletes.
    const apply = vi.fn();
    const w = mountInspector(chair, withChair, apply);
    confirmMock.mockResolvedValueOnce(false);
    await button(w, "Delete")?.trigger("click");
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    confirmMock.mockResolvedValueOnce(true);
    await button(w, "Delete")?.trigger("click");
    await flushPromises();
    expect(apply).toHaveBeenCalledWith({ op: "remove", target: chair });
  });

  it("renames from the title, and shows the file-derived name as its placeholder", async () => {
    const apply = vi.fn();
    const w = mountInspector(chair, withChair, apply);
    const input = w.find("input");
    expect(input.attributes("placeholder")).toBe("Chair");
    await input.setValue("Old chair");
    expect(apply).toHaveBeenCalledWith({ op: "rename", target: chair, name: "Old chair" });
  });

  it("re-pins by the chosen hold with the image's aspect, and not when it is already held that way", async () => {
    // Bug: choosing the current hold still re-pins; a missing aspect re-pins with a guess.
    const apply = vi.fn();
    const w = mountInspector(chair, withChair, apply);
    await button(w, "Stands")?.trigger("click");
    expect(apply).not.toHaveBeenCalled();
    await button(w, "Hangs")?.trigger("click");
    expect(apply).toHaveBeenCalledWith({ op: "hold", id: "chair-abc123", hold: "hangs", aspect: 1 });
    expect(w.find("[data-testid=hold-hint]").text()).toContain("Pinned at its feet");
  });

  it("sends a motion with the strength and pace it already has when only the name changes", async () => {
    const apply = vi.fn();
    const moving = addMotionChoice(withChair, "chair-abc123", { name: "Floating", strength: "lively", pace: "quick" });
    const w = mountInspector(chair, moving, apply);
    await w.find("[aria-label='Motion']").setValue("Flame");
    expect(apply).toHaveBeenCalledWith({ op: "motionAt", id: "chair-abc123", index: 0, choice: { name: "Flame", strength: "lively", pace: "quick" } });
    apply.mockClear();
    await w.find("[aria-label='Motion']").setValue("None");
    expect(apply).toHaveBeenCalledWith({ op: "motionAt", id: "chair-abc123", index: 0, choice: null });
  });

  it("says Custom for a hand-tuned motion and hides strength and pace", () => {
    const tuned = { ...withChair, stack: withChair.stack.map((i) => (i.kind === "layer" && i.id === "chair-abc123" ? { ...i, motions: [{ kind: "sway" as const, angle: 7, period: 5, phase: 1 }] } : i)) };
    const w = mountInspector(chair, tuned);
    expect(w.find("[data-testid=motion-custom]").exists()).toBe(true);
    expect(w.text()).not.toContain("Strength");
    expect(w.find("[data-testid=exact-motion]").text()).toContain("sway");
  });

  it("warns that only a flame flickers when a light is thrown by something else", () => {
    // Bug: the light looks broken (steady) with no word why.
    const lit = setThrowsLight(withChair, "chair-abc123", true, 1);
    expect(mountInspector(chair, lit).text()).toContain("Only a flame can throw a flickering light");
    expect(mountInspector(chair, withChair).text()).not.toContain("Only a flame can throw");
  });

  it("offers a cast shadow only to what stands, and only once there is a light to cast from", async () => {
    const w = mountInspector(chair);
    const toggle = w.find("[aria-label='Casts a shadow']");
    expect(toggle.attributes("disabled")).toBeDefined();
    const apply = vi.fn();
    const lit = setThrowsLight(withChair, "chair-abc123", true, 1);
    const w2 = mountInspector(chair, lit, apply);
    await w2.find("[aria-label='Casts a shadow']").trigger("click");
    expect(apply).toHaveBeenCalledWith({ op: "cast", id: "chair-abc123", cast: { light: "chair-abc123-glow", surface: "wall" } });
    const hung = mountInspector(chair, { ...lit, stack: lit.stack.map((i) => (i.kind === "layer" && i.id === "chair-abc123" ? { ...i, anchor: { x: 0.5, y: 0 } } : i)) });
    expect(hung.find("[aria-label='Casts a shadow']").exists()).toBe(false);
    expect(hung.find("[aria-label='Shadow under it']").exists()).toBe(false);
  });

  it("opens the side view from the depth link, and shows depth without asking for it", async () => {
    const w = mountInspector(chair);
    expect(w.find("#studio-depth").exists()).toBe(false);
    expect(w.find("[data-testid=depth-sentence]").text()).toContain("keeps the picture's depth");
    await button(w, "Set in the side view")?.trigger("click");
    expect(w.emitted("side-view")).toHaveLength(1);
  });

  it("closes Exact by default", () => {
    expect(mountInspector(chair).find("details").attributes("open")).toBeUndefined();
  });

  it("gives a touch its source and amount", async () => {
    const apply = vi.fn();
    const torch = addMotionChoice(addCutout(room, { id: "torch-abc123", src: "t", width: 100, height: 200 }, { x: 5, y: 5 }), "torch-abc123", { name: "Flame", strength: "gentle", pace: "steady" });
    const withGlow = { ...torch, stack: [...torch.stack, { kind: "light" as const, at: { x: 1, y: 1 }, depth: 1, radius: 100, color: [255, 190, 110] as [number, number, number], intensity: 0.6, id: "glow" }] };
    const index = withGlow.stack.length - 1;
    const w = mount(StudioInspector, { props: { target: { kind: "effect", index }, scene: withGlow, aspects, drawing: null, apply } });
    expect(w.text()).toContain("Where it comes from");
    await w.find("select").setValue("torch-abc123");
    expect(apply).toHaveBeenCalledWith({ op: "glowFollows", index, follows: "torch-abc123" });
    await button(w, "Lots")?.trigger("click");
    expect(apply).toHaveBeenCalledWith({ op: "touchAmount", index, amount: "lots" });
  });

  describe("stacked motions", () => {
    const stacked = () => {
      let sc = addCutout(withChair, { id: "apple-abc123", src: "a", width: 100, height: 100 }, { x: 5, y: 5 });
      sc = addMotion(sc, "chair-abc123", motionFor("Along a path", "gentle", "steady", { width: 400 }, 12, [{ x: 0, y: 0 }, { x: 50, y: 20 }]));
      return addMotion(sc, "chair-abc123", motionFor("Spinning", "gentle", "steady", { width: 400 }, 12));
    };

    it("lists every motion as its own row, and a stack is not Custom for being a stack", () => {
      // Bug: a part with a path and a spin reads as one custom motion, hiding both rows' controls.
      const w = mountInspector(chair, stacked());
      expect(w.findAll("[data-testid=motion-row]")).toHaveLength(2);
      expect(w.find("[data-testid=motion-custom]").exists()).toBe(false);
    });

    it("hides Strength for a path and a spin, which ignore it", () => {
      expect(mountInspector(chair, stacked()).text()).not.toContain("Strength");
    });

    it("adds a motion after the others, with the studio's default strength and pace", async () => {
      const apply = vi.fn();
      const w = mountInspector(chair, stacked(), apply);
      await w.find("[aria-label='Add a motion']").setValue("Floating");
      expect(apply).toHaveBeenCalledWith({ op: "addMotion", id: "chair-abc123", choice: { name: "Floating", strength: "gentle", pace: "steady" } });
    });

    it("changes the row's own place when its name, pace or start is chosen, and removes by place", async () => {
      // Bug: a row's control edits the first motion, or all of them.
      const apply = vi.fn();
      const w = mountInspector(chair, stacked(), apply);
      const spin = w.findAll("[data-testid=motion-row]")[1];
      await spin.findAll("button").find((b) => b.text() === "Quick")?.trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "motionAt", id: "chair-abc123", index: 1, choice: { name: "Spinning", strength: "gentle", pace: "quick" } });
      await spin.findAll("button").find((b) => b.text() === "½")?.trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "motionStart", id: "chair-abc123", index: 1, start: 0.5 });
      await spin.find("[aria-label='Remove this motion']").trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "motionAt", id: "chair-abc123", index: 1, choice: null });
    });

    it("gives a flame no Start, because it has no cycle", () => {
      const flame = addMotionChoice(withChair, "chair-abc123", { name: "Flame", strength: "gentle", pace: "steady" });
      expect(mountInspector(chair, flame).text()).not.toContain("Start");
    });

    it("turns a spin round the other way by replacing it with reverse set", async () => {
      const apply = vi.fn();
      const w = mountInspector(chair, stacked(), apply);
      await w.findAll("button").find((b) => b.text() === "Anticlockwise")?.trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "motionExact", id: "chair-abc123", index: 1, motion: expect.objectContaining({ kind: "spin", reverse: true }) });
    });

    it("sets a path round or there and back, and turning, keeping its points", async () => {
      // Bug: Goes drops the drawn points, or writes closed onto the wrong row.
      const apply = vi.fn();
      const w = mountInspector(chair, stacked(), apply);
      await w.findAll("button").find((b) => b.text() === "There and back")?.trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "motionExact", id: "chair-abc123", index: 0, motion: expect.objectContaining({ kind: "path", closed: false, points: [{ x: 0, y: 0 }, { x: 50, y: 20 }] }) });
    });

    it("shares with another cut-out and offers Spread and Stop sharing only once shared", async () => {
      const apply = vi.fn();
      const w = mountInspector(chair, stacked(), apply);
      expect(w.text()).not.toContain("Spread along it evenly");
      await w.find("[aria-label='Share this path with']").setValue("apple-abc123");
      expect(apply).toHaveBeenCalledWith({ op: "sharePath", id: "chair-abc123", index: 0, to: ["apple-abc123"] });
      const shared = applyOp(stacked(), { op: "sharePath", id: "chair-abc123", index: 0, to: ["apple-abc123"] });
      const w2 = mountInspector(chair, shared, apply);
      await button(w2, "Spread along it evenly")?.trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "spreadPath", group: "path-1" });
      await button(w2, "Stop sharing")?.trigger("click");
      expect(apply).toHaveBeenCalledWith({ op: "unsharePath", id: "chair-abc123", index: 0 });
    });

    it("asks the stage to draw this row's path, and to stop", async () => {
      const w = mountInspector(chair, stacked());
      await button(w, "Draw it")?.trigger("click");
      expect(w.emitted("draw-path")?.[0]).toEqual([0]);
    });
  });
});
