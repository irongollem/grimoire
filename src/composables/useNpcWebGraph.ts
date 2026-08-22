import { computed } from "vue";
import { defineConfigs } from "v-network-graph";
import { ForceLayout } from "v-network-graph/lib/force-layout";

import { npcRelationshipCanvasColor } from "@/lib/npcDisplay";
import { useUiStore } from "@/stores/ui";
import { NPC_RELATIONSHIP_INVERSE, NPC_RELATIONSHIP_TYPE_VAR } from "@/types/npc.types";
import type { Npc, NpcPcNote, NpcRelation, NpcRelationshipType } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

/**
 * Everything that turns campaign rows into a graph: which nodes and edges exist,
 * what colour they are, and how the layout behaves.
 *
 * Split out of `NpcWebView` when it passed the 600-line mark. The seam is real
 * rather than a line-count dodge — the view's other half is *interaction* state
 * (what is selected, which link is being drawn, which panel is open), and the
 * only thing that crosses between them is `pinnedKeys`: a node being linked has
 * to survive the search filter, or the second click of a shift-link vanishes the
 * node you are linking from.
 *
 * Data is passed in as getters rather than queried here, so this module shapes a
 * graph and does not also decide where rows come from — the view already holds
 * those queries for its panels.
 */
/**
 * Only the columns the graph reads. `useAllNpcPcNotes` selects a subset of the
 * row, so typing this as the full `NpcPcNote` would claim columns that query
 * never fetches — the type would be lying about what is in memory.
 */
export type NpcWebPcNote = Pick<NpcPcNote, "npc_id" | "party_member_id" | "relationship_type">;

export interface NpcWebGraphInput {
  npcs: () => Npc[] | undefined;
  partyMembers: () => PartyMember[] | undefined;
  relations: () => NpcRelation[] | undefined;
  pcNotes: () => NpcWebPcNote[] | undefined;
  /** Nodes that must render regardless of the search box — see above. */
  pinnedKeys: () => ReadonlySet<string>;
  getDescendantIds: (rootId: string) => Set<string>;
  /**
   * When a faction is focused, the node keys that belong to it. Empty means no
   * focus and nothing is dimmed.
   *
   * Dimming has to go through `color`, because v-network-graph's node and edge
   * styles carry no opacity of their own — see `dim()`.
   */
  focusedKeys: () => ReadonlySet<string>;
}

export interface NpcWebNode {
  name: string;
  nodeType: "npc" | "pc";
  nodeColor: string;
  nodeSize: number;
  /**
   * Outside the focused faction. Carried on the node rather than recomputed by
   * each consumer, because the fade has to reach three separately-drawn things —
   * the circle, its label, and its faction badges — and a node lit in one of
   * them and faded in the other two is worse than no focus at all.
   */
  dimmed: boolean;
}

export interface NpcWebEdge {
  source: string;
  target: string;
  edgeColor: string;
  dashed: boolean;
}

/**
 * A theme custom property as a concrete value.
 *
 * The graph config takes colours as *values* — they end up on SVG presentation
 * attributes and in the layout engine, neither of which resolves `var()` or
 * knows what a utility class is. So the ramps are read out of the document here
 * rather than the graph keeping its own palette, which is what let its previous
 * private copy rot (#742/#744).
 *
 * Resolved when the graph data is built, so a rebuild after a theme switch picks
 * up the new palette.
 */
export function cssValue(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

/** `var(--x)` from a ramp map, resolved to a value the graph can paint with. */
export function resolveVar(varExpr: string | undefined, fallback: string): string {
  const token = varExpr?.match(/^var\((--[^)]+)\)$/)?.[1];
  return token ? cssValue(token, fallback) : fallback;
}

/**
 * Fade a resolved colour.
 *
 * `color-mix` rather than a parsed rgba because these arrive as whatever the
 * custom property holds — `hsl(0 72% 51%)` today, anything tomorrow — and
 * re-parsing every colour syntax to reach its alpha is the kind of thing that
 * works until a theme is written in oklch.
 */
function dim(color: string): string {
  return `color-mix(in srgb, ${color} 22%, transparent)`;
}

function npcMatchesSearch(npc: { name: string; disguise_name?: string | null }, q: string): boolean {
  const lower = q.toLowerCase();
  return npc.name.toLowerCase().includes(lower) || (npc.disguise_name ?? "").toLowerCase().includes(lower);
}

export function useNpcWebGraph(input: NpcWebGraphInput) {
  const ui = useUiStore();

  // Node colours come from the shared relationship ramp, resolved to concrete
  // values because the graph paints to SVG attributes (#742).
  //
  // This view used to keep its own copy of the map, still keyed on the *old*
  // relationship values — `ally`/`neutral`/`enemy`, replaced by the 5e reaction
  // scale in `20260519000001_npc_relationship_5e_scale`. That migration remapped
  // the rows and updated the AI prompt, but a duplicated lookup in an unrelated
  // view is invisible to a schema change: it kept compiling, kept matching
  // nothing, and every NPC node fell through to the default grey. The graph had
  // carried no relationship information since.
  const graphNodes = computed<Record<string, NpcWebNode>>(() => {
    const nodes: Record<string, NpcWebNode> = {};
    const q = ui.npcWebSearch.trim();
    const pinned = input.pinnedKeys();
    const focused = input.focusedKeys();

    const locationDescendants = ui.npcWebFilterLocation
      ? input.getDescendantIds(ui.npcWebFilterLocation)
      : null;

    for (const npc of input.npcs() ?? []) {
      const key = `npc:${npc.id}`;
      if (q && !npcMatchesSearch(npc, q) && !pinned.has(key)) continue;
      if (locationDescendants && !locationDescendants.has(npc.location_id ?? "")) continue;
      // Attitude, set by clicking the legend. PCs are exempt below: they have no
      // attitude toward the party, being the party.
      if (ui.npcWebFilterRelationship && npc.relationship !== ui.npcWebFilterRelationship) continue;
      const color = npcRelationshipCanvasColor(npc.relationship);
      const dimmed = focused.size > 0 && !focused.has(key);
      nodes[key] = {
        name: npc.name,
        nodeType: "npc",
        nodeColor: dimmed ? dim(color) : color,
        nodeSize: 18,
        dimmed,
      };
    }

    if (ui.npcWebShowPcs) {
      for (const pc of input.partyMembers() ?? []) {
        const key = `pc:${pc.id}`;
        if (q && !pc.name.toLowerCase().includes(q.toLowerCase()) && !pinned.has(key)) continue;
        // Party members are the theme accent, not a relationship step.
        const color = cssValue("--primary", "#d97706");
        const dimmed = focused.size > 0 && !focused.has(key);
        nodes[key] = {
          name: pc.name,
          nodeType: "pc",
          nodeColor: dimmed ? dim(color) : color,
          nodeSize: 22,
          dimmed,
        };
      }
    }

    return nodes;
  });

  const graphEdges = computed<Record<string, NpcWebEdge>>(() => {
    const edges: Record<string, NpcWebEdge> = {};
    const focused = input.focusedKeys();
    // Lit only when the tie is *within* the faction. An edge with one end
    // outside is the faction's reach into the rest of the web, and drawing it at
    // full strength would say the outsider belongs too.
    const edgeColor = (color: string, a: string, b: string) =>
      focused.size && !(focused.has(a) && focused.has(b)) ? dim(color) : color;

    for (const rel of input.relations() ?? []) {
      const rawType = rel.relationship_type as NpcRelationshipType;
      if (
        ui.npcWebFilterType &&
        rawType !== ui.npcWebFilterType &&
        NPC_RELATIONSHIP_INVERSE[rawType] !== ui.npcWebFilterType
      ) {
        continue;
      }
      const a = `npc:${rel.npc_id}`;
      const b = `npc:${rel.related_npc_id}`;
      const key = a < b ? `${a}--${b}` : `${b}--${a}`;
      if (!edges[key]) {
        edges[key] = {
          source: a,
          target: b,
          edgeColor: edgeColor(resolveVar(NPC_RELATIONSHIP_TYPE_VAR[rawType], "#6b7280"), a, b),
          dashed: false,
        };
      }
    }

    if (ui.npcWebShowPcs) {
      for (const note of input.pcNotes() ?? []) {
        if (ui.npcWebFilterType && note.relationship_type !== ui.npcWebFilterType) continue;
        const npcKey = `npc:${note.npc_id}`;
        const pcKey = `pc:${note.party_member_id}`;
        const key = `${npcKey}--${pcKey}`;
        if (!edges[key]) {
          edges[key] = {
            source: npcKey,
            target: pcKey,
            edgeColor: edgeColor(resolveVar(NPC_RELATIONSHIP_TYPE_VAR[note.relationship_type], "#d97706"), npcKey, pcKey),
            dashed: true,
          };
        }
      }
    }

    return edges;
  });

  const nodeCount = computed(() => Object.keys(graphNodes.value).length);

  const graphConfigs = defineConfigs({
    view: {
      autoPanAndZoomOnLoad: "fit-content",
      /**
       * The library's own defaults, unmodified.
       *
       * A weak same-faction attraction lived here, meant to gather a faction
       * before a boundary was drawn round it. Measured on a real campaign it did
       * not: it pulled *every* faction at once, and since NPCs sit in several,
       * the pulls pointed in conflicting directions and largely cancelled. What
       * it did reliably do was perturb the relationship layout, which is the
       * actual subject of this view, in exchange for nothing.
       *
       * The fence handles spread instead, by drawing one shape per group of
       * members who are already near each other — geometry rather than physics,
       * and it moves nobody. See `clusterByProximity`.
       */
      layoutHandler: new ForceLayout({
        positionFixedByDrag: true,
      }),
    },
    node: {
      normal: {
        color: (n) => (n as { nodeColor: string }).nodeColor,
        radius: (n) => (n as { nodeSize: number }).nodeSize,
        strokeWidth: 2,
        strokeColor: "#00000040",
      },
      hover: {
        color: (n) => (n as { nodeColor: string }).nodeColor,
        radius: (n) => (n as { nodeSize: number }).nodeSize + 3,
      },
      label: {
        visible: true,
        fontSize: 11,
        /**
         * A function, not a value: `graphConfigs` is built once at setup, so a
         * literal here is frozen at whatever the theme was then. Read at draw
         * time it follows the theme on the next redraw — the same caveat
         * `npcRelationshipCanvasColor` states for the node fills, and the reason
         * this module resolves colours through `cssValue` rather than storing them.
         *
         * It was the literal `#e2d9c8` — Grimoire's parchment `--foreground`,
         * hard-coded in the one field that skipped the `cssValue` helper the rest
         * of it uses. On Tome that is cream on near-white: rgb(226,217,200) on
         * rgb(246,244,238), a contrast ratio of 1.27:1. Every NPC name on the web
         * was invisible on the default theme, and the nodes still worked, so you
         * could click a label you could not see.
         */
        color: (n) => {
          const fg = cssValue("--foreground", "#e2d9c8");
          return (n as { dimmed?: boolean }).dimmed ? dim(fg) : fg;
        },
      },
      focusring: { visible: false },
      selectable: false,
    },
    edge: {
      normal: {
        color: (e) => (e as unknown as { edgeColor: string }).edgeColor,
        width: 2,
        dasharray: (e) => ((e as unknown as { dashed: boolean }).dashed ? "5,4" : "0"),
      },
      hover: {
        color: (e) => (e as unknown as { edgeColor: string }).edgeColor,
        width: 3,
      },
      marker: {
        source: { type: "none" },
        target: { type: "none" },
      },
    },
  });

  return { graphNodes, graphEdges, graphConfigs, nodeCount };
}
