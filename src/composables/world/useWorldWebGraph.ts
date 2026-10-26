import { computed, reactive } from "vue";
import { defineConfigs } from "v-network-graph";
import { ForceLayout } from "v-network-graph/lib/force-layout";

import { groupClusteringForce, groupFenceForce } from "@/lib/worldWeb/groupClustering";
import { npcRelationshipCanvasColor } from "@/lib/npcDisplay";
import type { RestGraph } from "@/lib/worldWeb/model";
import type { WebKind } from "@/lib/worldWeb/kinds";
import type { TieFamily } from "@/lib/worldWeb/ties";

/**
 * Everything that turns the web at rest into a graph the library can draw: which
 * nodes and edges exist, what colour they are, and how the layout behaves.
 *
 * Data is passed in as getters rather than queried here, so this module shapes a
 * graph and does not also decide where rows come from.
 */
export interface WorldWebGraphInput {
  graph: () => RestGraph;
  /** The group being drawn (a faction, place or deity) with the people it gathers; null when nothing is grouped. */
  group: () => { anchor: string; members: ReadonlySet<string> } | null;
}

export interface WorldWebNode {
  name: string;
  kind: WebKind;
  /** Radius in screen pixels. */
  nodeSize: number;
  /** An NPC's fill: their attitude to the party. */
  nodeColor: string | undefined;
}

export interface WorldWebEdge {
  source: string;
  target: string;
  edgeColor: string;
  arrow: boolean;
  label: string | undefined;
  family: TieFamily;
}

/**
 * A theme custom property as a concrete value.
 *
 * The graph config takes colours as *values*: they end up on SVG presentation
 * attributes and in the layout engine, neither of which resolves `var()`. So the
 * ramps are read out of the document here, at the point the data is built, and
 * a rebuild after a theme switch picks up the new palette.
 */
export function cssValue(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

/** The token each family of tie is drawn in; kin keeps the family colour it had. */
export const FAMILY_TOKEN: Record<TieFamily, string> = {
  bond: "--link-bond",
  enmity: "--link-enmity",
  faith: "--link-faith",
  place: "--link-place",
  holding: "--link-holding",
  stance: "--link-stance",
  record: "--link-record",
  kin: "--relation-family",
};

export function familyColor(family: TieFamily): string {
  return cssValue(FAMILY_TOKEN[family], "#6b7280");
}

/** Node radius by kind, in screen pixels: PCs largest, an item smallest. */
const NODE_SIZE: Record<WebKind, number> = {
  npc: 18,
  party_member: 22,
  faction: 20,
  location: 18,
  deity: 19,
  item: 15,
  quest: 16,
};

export function nodeSizeFor(kind: WebKind): number {
  return NODE_SIZE[kind];
}

export function useWorldWebGraph(input: WorldWebGraphInput) {
  const graphNodes = computed<Record<string, WorldWebNode>>(() => {
    const nodes: Record<string, WorldWebNode> = {};
    for (const [key, entity] of input.graph().nodes) {
      nodes[key] = {
        name: entity.name,
        kind: entity.kind,
        nodeSize: NODE_SIZE[entity.kind],
        nodeColor: entity.attitude ? npcRelationshipCanvasColor(entity.attitude) : undefined,
      };
    }
    return nodes;
  });

  const graphEdges = computed<Record<string, WorldWebEdge>>(() => {
    const edges: Record<string, WorldWebEdge> = {};
    for (const edge of input.graph().edges) {
      edges[edge.key] = {
        source: edge.source,
        target: edge.target,
        edgeColor: familyColor(edge.family),
        arrow: edge.arrow,
        // A web of hundreds of lines cannot carry a word on each; kin does, as it always has.
        label: edge.family === "kin" ? edge.label : undefined,
        family: edge.family,
      };
    }
    return edges;
  });

  const groupSets = (): ReadonlyMap<string, ReadonlySet<string>> => {
    const group = input.group();
    return group ? new Map([["group", group.members]]) : new Map();
  };

  const graphConfigs = reactive(defineConfigs({
    view: {
      // The wheel is routed through useWorldWebCamera: a plain wheel pans, Ctrl/Cmd/Alt+wheel zooms.
      mouseWheelZoomEnabled: false,
      autoPanAndZoomOnLoad: "fit-content",
      layoutHandler: new ForceLayout({
        positionFixedByDrag: true,
        /**
         * The library's own four forces plus two of ours. Replacing
         * `createSimulation` means restating the defaults (there is no "extend"
         * hook), so `edge`, `charge`, `collide` and `center` are v-network-graph's
         * own, copied deliberately rather than tuned.
         *
         * `group` gathers whatever "Group by" chose, so a record has some bearing
         * on where someone ends up; `fence` holds the group's own node on the
         * outline of that gathering.
         */
        createSimulation: (d3, nodes, edges) =>
          d3
            .forceSimulation(nodes)
            .force("edge", d3.forceLink(edges).id((d: { id: string }) => d.id).distance(100))
            .force("charge", d3.forceManyBody())
            .force("collide", d3.forceCollide(50).strength(0.2))
            .force("center", d3.forceCenter().strength(0.05))
            .force("group", groupClusteringForce(groupSets))
            .force("fence", groupFenceForce(input.group))
            .alphaMin(0.001),
      }),
    },
    node: {
      // Switched off while Space is held so a left drag over a node pans (useWorldWebCamera).
      draggable: true,
      normal: {
        color: (n) => (n as { nodeColor?: string }).nodeColor ?? "#6b7280",
        radius: (n) => (n as { nodeSize: number }).nodeSize,
      },
      hover: {
        color: (n) => (n as { nodeColor?: string }).nodeColor ?? "#6b7280",
        radius: (n) => (n as { nodeSize: number }).nodeSize + 3,
      },
      label: {
        visible: true,
        fontSize: 11,
        direction: "south",
        margin: 6,
        // A function, not a value: `graphConfigs` is built once at setup, so a
        // literal here is frozen at whatever the theme was then.
        color: () => cssValue("--foreground", "#e2d9c8"),
      },
      focusring: { visible: false },
      selectable: false,
    },
    edge: {
      normal: {
        color: (e) => (e as unknown as WorldWebEdge).edgeColor,
        width: 2,
      },
      hover: {
        color: (e) => (e as unknown as WorldWebEdge).edgeColor,
        width: 4,
      },
      marker: {
        source: { type: "none" },
        target: { type: ([e]) => ((e as unknown as WorldWebEdge).arrow ? "arrow" : "none") },
      },
      label: {
        fontSize: 10,
        color: () => cssValue("--muted-foreground", "#6b7280"),
      },
    },
  }));

  return { graphNodes, graphEdges, graphConfigs, nodeCount: computed(() => Object.keys(graphNodes.value).length) };
}
