import { linkEnds } from "@/lib/kinship/keys";
import type { KinKind, KinLink } from "@/types/kinship.types";

/** How one kin link is drawn on the Relationship Web. */
export interface KinWebEdge {
  /** Same key shape the bond edges use, so a pair with both collapses to this one. */
  key: string;
  /** The parent for a parent link, so the arrowhead lands on the child. */
  source: string;
  target: string;
  kind: KinKind;
  /** CSS custom property that colours the line. */
  colorVar: string;
  dashed: boolean;
  arrow: boolean;
  label: string;
}

const LOOK: Record<KinKind, { colorVar: string; label: string }> = {
  parent: { colorVar: "--relation-family", label: "parent" },
  spouse: { colorVar: "--relation-lover", label: "spouse" },
  former_spouse: { colorVar: "--relation-lover", label: "former spouse" },
  sibling: { colorVar: "--relation-sibling", label: "sibling" },
  relative: { colorVar: "--muted-foreground", label: "relative" },
};

/** The stronger fact wins when two people are linked more than one way. */
const PRIORITY: Record<KinKind, number> = { parent: 0, spouse: 1, former_spouse: 2, sibling: 3, relative: 4 };

/** The legend entries for kin, in the order the web draws them. */
export const KIN_WEB_LEGEND: { kind: KinKind; colorVar: string; label: string; dashed: boolean }[] = [
  { kind: "parent", ...LOOK.parent, dashed: false },
  { kind: "spouse", ...LOOK.spouse, dashed: false },
  { kind: "former_spouse", ...LOOK.former_spouse, dashed: true },
  { kind: "sibling", ...LOOK.sibling, dashed: false },
  { kind: "relative", ...LOOK.relative, dashed: false },
];

/** Edge key for an unordered pair: an NPC always comes first against a PC, matching the PC-note edges. */
export function webPairKey(a: string, b: string): string {
  const aPc = a.startsWith("pc:");
  const bPc = b.startsWith("pc:");
  if (aPc !== bPc) return aPc ? `${b}--${a}` : `${a}--${b}`;
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

/** One edge per unordered pair, strongest kind first-wins. */
export function kinWebEdges(links: readonly KinLink[]): KinWebEdge[] {
  const ordered = [...links].sort((x, y) => PRIORITY[x.kind] - PRIORITY[y.kind]);
  const byKey = new Map<string, KinWebEdge>();
  for (const link of ordered) {
    const { from, to } = linkEnds(link);
    if (from === to) continue;
    const key = webPairKey(from, to);
    if (byKey.has(key)) continue;
    const look = LOOK[link.kind];
    byKey.set(key, {
      key,
      source: from,
      target: to,
      kind: link.kind,
      colorVar: look.colorVar,
      dashed: link.kind === "former_spouse" || (link.kind === "parent" && link.adoptive),
      arrow: link.kind === "parent",
      label: link.kind === "parent" && link.adoptive ? "adoptive parent" : look.label,
    });
  }
  return [...byKey.values()];
}
