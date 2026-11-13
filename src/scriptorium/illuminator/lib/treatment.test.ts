import { describe, expect, it } from "vitest";
import { DEFAULT_COLOUR_GRADING } from "./colourGrading";
import { DEFAULT_PAPER_SIDE } from "./tornPaper";
import { aiStepOf, baseImageUrl, hashSettings, hasSteps, parseSettings, pictureUrls, withAiStep, type IlluminateSettings } from "./treatment";

const grade = (brightness: number): IlluminateSettings["steps"][number] => ({
  type: "grade",
  options: { ...DEFAULT_COLOUR_GRADING, brightness },
});

const settings = (steps: IlluminateSettings["steps"], seed = 1): IlluminateSettings => ({ v: 1, seed, steps });

describe("hashSettings", () => {
  it("does not change when object keys are written in another order", () => {
    const a = settings([{ type: "grade", options: { brightness: 0.2, contrast: 0, saturation: 0, temperature: 0, hue: 0 } }]);
    const b = settings([{ type: "grade", options: { hue: 0, temperature: 0, saturation: 0, contrast: 0, brightness: 0.2 } }]);
    expect(hashSettings(a)).toBe(hashSettings(b));
  });

  it("does not change when the steps are listed in another order, since they run in one fixed order", () => {
    const vignette = { type: "vignette", options: { strength: 0.5, softness: 0.5, mode: "transparent", colour: "#000000" } } as const;
    expect(hashSettings(settings([grade(0.1), vignette]))).toBe(hashSettings(settings([vignette, grade(0.1)])));
  });

  it("changes when a value, the seed or a stored picture changes", () => {
    const base = hashSettings(settings([grade(0.1)]));
    expect(hashSettings(settings([grade(0.2)]))).not.toBe(base);
    expect(hashSettings(settings([grade(0.1)], 2))).not.toBe(base);
    const mask = (url: string) => hashSettings(settings([{ type: "mask", url }]));
    expect(mask("https://cdn/a.png")).not.toBe(mask("https://cdn/b.png"));
  });
});

describe("parseSettings", () => {
  it("keeps what it understands and drops unknown or broken steps", () => {
    const parsed = parseSettings({
      v: 1,
      seed: 4,
      steps: [{ type: "grade", options: { brightness: 0.3 } }, { type: "sparkle" }, "nope", { type: "mask" }, { type: "texture", url: "" }],
    });
    expect(parsed?.steps.map((s) => s.type)).toEqual(["grade"]);
    expect(parsed?.seed).toBe(4);
  });

  it("fills missing and non-numeric options from the defaults", () => {
    const parsed = parseSettings({ v: 1, seed: 0, steps: [{ type: "grade", options: { brightness: "high", hue: Number.NaN, contrast: 0.5 } }] });
    expect(parsed?.steps[0]).toEqual({ type: "grade", options: { ...DEFAULT_COLOUR_GRADING, contrast: 0.5 } });
  });

  it("reads the JSON text furniture props store", () => {
    const text = JSON.stringify(settings([grade(0.3)]));
    expect(parseSettings(text)?.steps).toHaveLength(1);
  });

  it("never throws, and gives null for anything that is not version 1 settings", () => {
    for (const bad of [null, undefined, 7, "not json", "{", [], {}, { v: 2, steps: [] }, { v: 1 }, { v: 1, steps: "x" }]) {
      expect(parseSettings(bad)).toBeNull();
    }
  });

  it("keeps the last of two steps of one type and puts the steps in running order", () => {
    const parsed = parseSettings({
      v: 1,
      seed: 0,
      steps: [{ type: "mask", url: "m" }, { type: "grade", options: { brightness: 0.1 } }, { type: "grade", options: { brightness: 0.9 } }],
    });
    expect(parsed?.steps.map((s) => s.type)).toEqual(["grade", "mask"]);
    expect(parsed?.steps[0]).toMatchObject({ options: { brightness: 0.9 } });
  });

  it("tells the two edge styles apart and defaults an unknown style to classic", () => {
    const paper = parseSettings({ v: 1, seed: 0, steps: [{ type: "edges", style: "paper", top: { enabled: true, depth: 0.9 } }] });
    expect(paper?.steps[0]).toMatchObject({ style: "paper", top: { ...DEFAULT_PAPER_SIDE, enabled: true, depth: 0.9 } });
    const odd = parseSettings({ v: 1, seed: 0, steps: [{ type: "edges", style: "zigzag" }] });
    expect(odd?.steps[0]).toMatchObject({ style: "classic" });
  });

  it("round-trips its own output unchanged", () => {
    const once = parseSettings(settings([grade(0.1), { type: "texture", url: "t", blendMode: "overlay", opacity: 0.4, scale: 1 }]));
    expect(parseSettings(JSON.parse(JSON.stringify(once)) as unknown)).toEqual(once);
  });
});

describe("pictureUrls and hasSteps", () => {
  it("lists every stored picture a step points at", () => {
    const urls = pictureUrls(
      settings([
        { type: "texture", url: "t.png", blendMode: "overlay", opacity: 1, scale: 1 },
        { type: "mask", url: "m.png" },
        { type: "ai", action: "cut-out", output: "ai.webp" },
        grade(0),
      ]),
    );
    expect(urls.sort()).toEqual(["ai.webp", "m.png", "t.png"]);
    expect(pictureUrls(null)).toEqual([]);
  });

  it("says a recipe with no steps changes nothing", () => {
    expect(hasSteps(settings([]))).toBe(false);
    expect(hasSteps(null)).toBe(false);
    expect(hasSteps(settings([grade(0)]))).toBe(true);
  });
});

describe("baseImageUrl", () => {
  const ai = { type: "ai", action: "ink", output: "https://cdn/ai.webp" } as const;

  // Bug: a renderer that loaded `original` straight away ignored the AI result the author paid for.
  it("is the AI output when the recipe has one, else the original", () => {
    expect(baseImageUrl("o.webp", settings([grade(0.1), ai]))).toBe("https://cdn/ai.webp");
    expect(baseImageUrl("o.webp", settings([grade(0.1)]))).toBe("o.webp");
    expect(baseImageUrl("o.webp", null)).toBe("o.webp");
  });
});

describe("withAiStep", () => {
  it("replaces the AI step, keeps the other steps and the seed, and removes it on null", () => {
    const first = withAiStep(settings([grade(0.1)], 7), { type: "ai", action: "cutout", output: "a" }, 99);
    expect(first.seed).toBe(7);
    expect(first.steps.map((s) => s.type)).toEqual(["ai", "grade"]);
    const second = withAiStep(first, { type: "ai", action: "cutout+ink", output: "b" }, 99);
    expect(aiStepOf(second)).toMatchObject({ action: "cutout+ink", output: "b" });
    expect(second.steps).toHaveLength(2);
    expect(withAiStep(second, null, 99).steps.map((s) => s.type)).toEqual(["grade"]);
  });

  it("starts a recipe from the given seed when there was none", () => {
    expect(withAiStep(null, { type: "ai", action: "ink", output: "a" }, 42).seed).toBe(42);
  });
});

describe("the wash step", () => {
  const wash = (over: Record<string, unknown> = {}) => ({ type: "wash", from: "right", reach: 0.5, brush: 0.4, dry: 0.3, seed: 9, ...over });
  const parse = (steps: unknown[]) => parseSettings({ v: 1, seed: 1, steps });

  // Fails on: a wash recipe being dropped as an unknown step, so a saved wash vanishes on reload.
  it("parses and keeps its values", () => {
    expect(parse([wash()])?.steps).toEqual([wash()]);
  });

  // Fails on: a hand-edited recipe with from "middle" reaching the renderer, or numbers outside the range drawing nothing sensible.
  it("defaults an unknown side to left and clamps the numbers", () => {
    expect(parse([wash({ from: "middle", reach: 5, brush: -1, dry: 9 })])?.steps).toEqual([wash({ from: "left", reach: 0.9, brush: 0, dry: 1 })]);
    expect(parse([wash({ reach: 0 })])?.steps[0]).toMatchObject({ reach: 0.15 });
  });

  // Fails on: the wash drawn before the edges (the torn edge would cut the wash) or after the DM's mask (the brush no longer paints on top).
  it("runs after edges and before the mask, whatever order it is listed in", () => {
    const edge = { type: "edges", style: "classic" };
    const types = parse([{ type: "mask", url: "m.png" }, wash(), edge])?.steps.map((s) => s.type);
    expect(types).toEqual(["edges", "wash", "mask"]);
  });

  // Fails on: the hash taking the raw step, so a wash with a missing optional field re-bakes as an edit.
  it("hashes two spellings of the same wash the same, and a new seed differently", () => {
    const a = settings([wash() as unknown as IlluminateSettings["steps"][number]]);
    const b = settings([parse([wash({ extra: 1 })])!.steps[0]]);
    expect(hashSettings(a)).toBe(hashSettings(b));
    expect(hashSettings(settings([wash({ seed: 10 }) as unknown as IlluminateSettings["steps"][number]]))).not.toBe(hashSettings(a));
  });
});

describe("the paint step", () => {
  const layer = (over: Record<string, unknown> = {}) => ({ id: "a", name: "Ink", blend: "multiply", opacity: 0.5, visible: true, lockAlpha: false, chunks: { "0,0": "u/ill-paint-1.webp" }, ...over });
  const parse = (step: Record<string, unknown>) => parseSettings({ v: 1, seed: 0, steps: [{ type: "paint", width: 2000, height: 1000, paper: null, layers: [layer()], ...step }] });

  // Fails on: the step being dropped on reload, which would lose every painted layer.
  it("keeps a well formed step and lists every chunk url", () => {
    const s = parse({ layers: [layer(), layer({ id: "b", chunks: { "1,0": "u/ill-paint-2.webp" } })] });
    expect(s?.steps[0]).toMatchObject({ type: "paint", width: 2000, height: 1000 });
    expect(pictureUrls(s)).toEqual(["u/ill-paint-1.webp", "u/ill-paint-2.webp"]);
  });

  // Fails on: a blank sheet losing the paper it was started on.
  it("keeps a step with no layers and its paper", () => {
    expect(parse({ layers: [], paper: "parchment" })?.steps[0]).toMatchObject({ layers: [], paper: "parchment" });
  });

  // Fails on: a bad size reaching a renderer (a divide by zero or a canvas the browser refuses).
  it("drops a step whose size is not a whole number from 1 to 8192", () => {
    for (const bad of [{ width: 0 }, { width: -4 }, { height: 1.5 }, { width: 8193 }, { height: "9" }]) expect(parse(bad)?.steps).toEqual([]);
  });

  // Fails on: one bad layer, chunk key or url wiping the whole painting, or a chunk outside the grid being kept.
  it("drops bad layers and chunks but keeps the rest", () => {
    const s = parse({ layers: [
      layer({ blend: "dodge" }),
      layer({ id: "" }),
      "nope",
      layer({ id: "ok", chunks: { "0,0": "keep", "5,0": "outside", "x,y": "bad", "1,0": "", "1,1": 4 } }),
    ] });
    const step = s?.steps[0];
    expect(step?.type === "paint" && step.layers.map((l) => l.id)).toEqual(["ok"]);
    expect(pictureUrls(s)).toEqual(["keep"]);
  });

  // Fails on: an opacity outside 0..1 reaching globalAlpha.
  it("clamps opacity", () => {
    const step = parse({ layers: [layer({ opacity: 7 }), layer({ id: "b", opacity: -2 })] })?.steps[0];
    expect(step?.type === "paint" && step.layers.map((l) => l.opacity)).toEqual([1, 0]);
  });
});

describe("saved versions of a painting", () => {
  const rec = (id: string, url: string) => ({ id, name: "Ink", blend: "multiply", opacity: 0.5, visible: true, lockAlpha: false, chunks: { "0,0": url } });
  const version = (n: number, over: Record<string, unknown> = {}) => ({ id: `v${n}`, name: `Version ${n}`, savedAt: "2026-11-12T10:00:00.000Z", layers: [rec("a", `u/ill-paint-v${n}.webp`)], ...over });
  const make = (versions: unknown[]) => parseSettings({ v: 1, seed: 0, steps: [{ type: "paint", width: 1000, height: 1000, paper: null, layers: [rec("a", "u/ill-paint-now.webp")], versions }] });

  // Fails on: a version repeating the paint marker, which the free plan's canvas count reads as a second painting (ten versions would count as eleven canvases).
  it("serialises the paint marker once, however many versions it holds", () => {
    const s = make(Array.from({ length: 10 }, (_, i) => version(i + 1)));
    const json = JSON.stringify(s);
    expect(json.match(/"type":\s*"paint"/g)).toHaveLength(1);
    expect(JSON.stringify(s, null, 2).match(/"type":\s*"paint"/g)).toHaveLength(1);
    const step = s?.steps[0];
    expect(step?.type === "paint" && step.versions).toHaveLength(10);
  });

  // Fails on: cleanup deleting a version's chunk files because only the current layers were counted.
  it("lists a url only a version names", () => {
    expect(pictureUrls(make([version(1)]))).toContain("u/ill-paint-v1.webp");
  });

  // Fails on: one malformed version wiping the painting or crashing the parse.
  it("drops a malformed version and keeps the rest", () => {
    const s = make([version(1), { id: "", layers: [] }, "junk", version(2, { layers: "x" }), version(3, { savedAt: "" }), version(4)]);
    const step = s?.steps[0];
    expect(step?.type === "paint" && step.versions?.map((v) => v.id)).toEqual(["v1", "v4"]);
    expect(step?.type === "paint" && step.layers).toHaveLength(1);
  });

  // Fails on: saving a version changing the bake hash, which would rebake every picture for an edit the picture never shows.
  it("does not change the hash", () => {
    expect(hashSettings(make([version(1)])!)).toBe(hashSettings(make([])!));
  });
});
