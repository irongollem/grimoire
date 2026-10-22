import { computed } from "vue";
import { buildKinGraph, type KinEdgeInput } from "@/lib/kinship/graph";
import type { KinGraphSource, KinPersonView } from "@/composables/kinship/useKinGraph";
import type { KinKind, KinLink, PersonKey } from "@/types/kinship.types";
import { endColumns } from "@/lib/kinship/keys";

/** Kin graph sources for the kinship and house component tests (test-only). */
export const k = (id: string): PersonKey => `npc:${id}`;
export const key = k;

export function person(id: string, name: string, bornYear: number | null, extra: Partial<KinPersonView> = {}): KinPersonView {
  return { key: k(id), name, bornYear, dead: false, isPc: false, portraitUrl: null, subtitle: null, to: `/npcs/${id}`, ...extra };
}

export function edge(id: string, from: string, to: string, kind: KinKind, extra: Partial<KinEdgeInput> = {}): KinEdgeInput {
  return { id, from: k(from), to: k(to), kind, parent_role: null, adoptive: false, ...extra };
}

export function sourceOf(people: KinPersonView[], edges: KinEdgeInput[]): KinGraphSource {
  const map = new Map(people.map((p) => [p.key, p]));
  const links = edges.map(
    (e): KinLink => ({
      id: e.id,
      user_id: "u",
      campaign_id: "c",
      ...endColumns(e.from, e.to),
      kind: e.kind,
      parent_role: e.parent_role,
      adoptive: e.adoptive,
      note: "",
      needs_sorting: false,
      created_at: "",
      updated_at: "",
    }),
  );
  return {
    graph: computed(() => buildKinGraph(people, edges)),
    people: computed(() => map),
    links: computed(() => links),
    houses: computed(() => []),
    isLoading: computed(() => false),
  };
}

/**
 * A small family for the tree tests: Aldous + Hesta have Bren and Odile; Bren has Brenna (PC) and Tomas;
 * Odile has Corin, who has Pip (a branch away from Brenna, so it folds). Without birth years it reads like a
 * player's source: no dates, and nowhere to go.
 */
export function makeSource(opts: { withBirth?: boolean } = {}): KinGraphSource {
  const withBirth = opts.withBirth ?? true;
  const rows: [string, number, { dead?: boolean; pc?: boolean }?][] = [
    ["aldous", 1399, { dead: true }], ["hesta", 1402, { dead: true }], ["bren", 1428], ["odile", 1433],
    ["brenna", 1459, { pc: true }], ["tomas", 1462], ["corin", 1460], ["pip", 1485],
  ];
  const people = rows.map(([id, born, flags]) =>
    person(id, id[0]?.toUpperCase() + id.slice(1), withBirth ? born : null, {
      dead: flags?.dead ?? false,
      isPc: flags?.pc ?? false,
      subtitle: flags?.pc ? "Ranger" : "Smith",
      to: withBirth ? `/npcs/${id}` : null,
    }),
  );
  let seq = 0;
  const link = (from: string, to: string, kind: KinKind) => edge(`l${seq++}`, from, to, kind);
  return sourceOf(people, [
    link("aldous", "hesta", "spouse"),
    link("aldous", "bren", "parent"), link("hesta", "bren", "parent"),
    link("aldous", "odile", "parent"), link("hesta", "odile", "parent"),
    link("bren", "brenna", "parent"), link("bren", "tomas", "parent"),
    link("odile", "corin", "parent"), link("corin", "pip", "parent"),
  ]);
}
