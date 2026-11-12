import type { BrushPreset, DynamicControl, Varied } from "../engine/types";
import { clamp01, newBrush, varied } from "./brushDefaults";
import type { DescObject, DescValue } from "./abrDescriptor";

/*
 * Map one Photoshop preset descriptor onto a BrushPreset. Key names are Photoshop's own four-letter
 * ones ("Dmtr" diameter, "Spcn" spacing, "Hrdn" hardness...). Settings with no home in our model go to
 * `notes` so the painter knows what the imported brush lost.
 */

const isObj = (v: DescValue | undefined): v is DescObject => typeof v === "object" && !Array.isArray(v);
const num = (v: DescValue | undefined): number | undefined => (typeof v === "number" ? v : undefined);
const flag = (o: DescObject, key: string): boolean => o.items.get(key) === true;

function control(o: DescObject, notes: string[], label: string): DynamicControl {
  const raw = o.items.get("bVTy");
  const byNumber: Record<number, DynamicControl | "wheel"> = {
    0: "off",
    1: "fade",
    2: "pressure",
    3: "tilt",
    4: "wheel",
    5: "direction",
    6: "direction",
    7: "rotation",
    8: "rotation",
  };
  const byName: Record<string, DynamicControl | "wheel"> = {
    off: "off",
    fade: "fade",
    penPressure: "pressure",
    penTilt: "tilt",
    stylusWheel: "wheel",
    initialDirection: "direction",
    direction: "direction",
    initialRotation: "rotation",
    rotation: "rotation",
  };
  const found = typeof raw === "number" ? byNumber[raw] : typeof raw === "string" ? byName[raw] : undefined;
  if (found === "wheel") {
    notes.push(`${label} follows the stylus wheel, which is not supported, so it is left off`);
    return "off";
  }
  return found ?? "off";
}

/** A dynamics group: jitter and minimum are percentages. */
function variedFrom(group: DescValue | undefined, notes: string[], label: string): Varied {
  if (!isObj(group)) return varied();
  return varied(
    clamp01((num(group.items.get("jitter")) ?? 0) / 100),
    control(group, notes, label),
    clamp01((num(group.items.get("Mnm ")) ?? 0) / 100),
  );
}

const UNSUPPORTED: readonly (readonly [string, string])[] = [
  ["useDualBrush", "Dual brush is not supported"],
  ["dualBrush", "Dual brush is not supported"],
  ["useBrushPose", "Brush pose is not supported"],
  ["useNoise", "Noise is not supported"],
  ["Nz  ", "Noise is not supported"],
  ["Rpt ", "Build-up (airbrush) is not supported"],
  ["protectTexture", "Protect texture is not supported"],
];

export interface PresetFromDescriptor {
  preset: BrushPreset;
  /** The sample this preset's tip names, when it is a sampled one. */
  sampledId: string | null;
  notes: string[];
}

export function presetFromDescriptor(node: DescObject, index: number): PresetFromDescriptor | null {
  const tipNode = node.items.get("Brsh");
  if (!isObj(tipNode)) return null;
  const nameValue = node.items.get("Nm  ");
  const name = typeof nameValue === "string" && nameValue !== "" ? nameValue : `Brush ${index + 1}`;
  const notes: string[] = [];
  const brush = newBrush(index, name);

  const diameter = num(tipNode.items.get("Dmtr"));
  if (diameter !== undefined && diameter > 0) brush.tip.size = diameter;
  const spacing = num(tipNode.items.get("Spcn"));
  if (spacing !== undefined && spacing > 0) brush.tip.spacing = Math.min(10, spacing / 100);
  const angle = num(tipNode.items.get("Angl"));
  // Photoshop turns a positive angle counter-clockwise; ours runs clockwise.
  if (angle !== undefined) brush.tip.angle = ((-angle % 360) + 360) % 360;
  const roundness = num(tipNode.items.get("Rndn"));
  if (roundness !== undefined) brush.tip.roundness = Math.max(0.05, clamp01(roundness / 100));
  brush.tip.flipX = flag(tipNode, "flipX");
  brush.tip.flipY = flag(tipNode, "flipY");
  const hardness = num(tipNode.items.get("Hrdn"));
  if (hardness !== undefined) brush.tip.source = { kind: "round", hardness: clamp01(hardness / 100) };

  const sampled = tipNode.items.get("sampledData");
  const sampledId = typeof sampled === "string" && sampled !== "" ? sampled : null;

  if (flag(node, "useTipDynamics")) {
    const minRoundness = num(node.items.get("minimumRoundness"));
    brush.shape = {
      size: variedFrom(node.items.get("szVr"), notes, "Size"),
      angle: variedFrom(node.items.get("angleDynamics"), notes, "Angle"),
      roundness: {
        ...variedFrom(node.items.get("roundnessDynamics"), notes, "Roundness"),
        minimum: clamp01((minRoundness ?? 0) / 100),
      },
    };
    if (brush.shape.angle.control === "direction") {
      brush.tip.followDirection = true;
      brush.shape.angle = { ...brush.shape.angle, control: "off" };
    }
  }

  if (flag(node, "useScatter")) {
    const s = node.items.get("scatterDynamics");
    if (isObj(s)) {
      const count = num(node.items.get("Cnt ")) ?? num(s.items.get("Cnt ")) ?? 1;
      brush.scatter = {
        amount: Math.min(10, (num(s.items.get("jitter")) ?? 0) / 100),
        bothAxes: flag(s, "bothAxes"),
        count: Math.min(16, Math.max(1, Math.round(count))),
        countJitter: 0,
      };
      const cd = node.items.get("countDynamics");
      if (isObj(cd)) brush.scatter.countJitter = clamp01((num(cd.items.get("jitter")) ?? 0) / 100);
    }
  }

  if (flag(node, "usePaintDynamics")) {
    brush.transfer.opacityDynamics = variedFrom(node.items.get("opVr"), notes, "Opacity");
    brush.transfer.flowDynamics = variedFrom(node.items.get("prVr"), notes, "Flow");
  }

  if (flag(node, "Wtdg") || flag(node, "wetEdges")) brush.wetEdges = true;

  if (flag(node, "useColorDynamics")) {
    const c = node.items.get("clVr");
    if (isObj(c)) {
      const colour = {
        hue: clamp01((num(c.items.get("H   ")) ?? 0) / 100),
        saturation: clamp01((num(c.items.get("Strt")) ?? 0) / 100),
        value: clamp01((num(c.items.get("Brgh")) ?? 0) / 100),
      };
      if (colour.hue > 0 || colour.saturation > 0 || colour.value > 0) brush.colour = colour;
    }
  }

  if (flag(node, "Smth")) brush.smoothing = 0.3;
  if (flag(node, "useTexture")) notes.push("Texture is not imported (the texture picture is not read)");
  for (const [key, message] of UNSUPPORTED) {
    if (flag(node, key) && !notes.includes(message)) notes.push(message);
  }
  return { preset: brush, sampledId, notes };
}

/** Every preset in the descriptor: any object with a name and a "Brsh" tip, however deeply it is nested in groups. */
export function collectPresets(root: DescValue, out: DescObject[] = [], depth = 0): DescObject[] {
  if (depth > 24) return out;
  if (Array.isArray(root)) {
    for (const v of root) collectPresets(v, out, depth + 1);
  } else if (isObj(root)) {
    if (root.items.has("Nm  ") && isObj(root.items.get("Brsh"))) {
      out.push(root);
    } else {
      for (const v of root.items.values()) collectPresets(v, out, depth + 1);
    }
  }
  return out;
}
