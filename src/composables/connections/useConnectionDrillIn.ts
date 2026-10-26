import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useCampaignStore } from "@/stores/campaign";
import { peopleOf } from "@/lib/worldLinks/connections";
import { connectionsQueryKey, fetchConnections } from "@/lib/worldLinks/connectionsQuery";
import type { Connection } from "@/types/connections.types";

/** The two things in search that open to the people they hold. */
export type DrillInKind = "location" | "faction";

export function isDrillInKind(kind: string): kind is DrillInKind {
  return kind === "location" || kind === "faction";
}

/** Whether a person row matches what was typed in the drill-in's filter: name, or the role they hold. */
export function personMatches(person: Pick<Connection, "other_name" | "role">, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (needle === "") return true;
  return person.other_name.toLowerCase().includes(needle) || (person.role?.toLowerCase().includes(needle) ?? false);
}

/**
 * The people at a place or in a faction, for the search results to open in
 * place (#1084). It reads the thing's connections through the same query key a
 * sheet uses, so an open sheet and a drill-in share one cache entry; and it is
 * lazy: nothing is fetched until `open` is true.
 */
export function useConnectionDrillIn(
  subject: MaybeRefOrGetter<{ kind: DrillInKind; id: string }>,
  open: MaybeRefOrGetter<boolean>,
  filter: MaybeRefOrGetter<string>,
) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId ?? null);

  const query = useQuery({
    queryKey: computed(() => connectionsQueryKey(toValue(subject).kind, toValue(subject).id, campaignId.value)),
    queryFn: () => fetchConnections(toValue(subject).kind, toValue(subject).id, campaignId.value),
    enabled: () => toValue(open),
    staleTime: 30_000,
  });

  /** Everyone, before the filter; undefined until the first read answers. */
  const people = computed<Connection[] | undefined>(() => {
    const rows = query.data.value;
    return rows === undefined ? undefined : peopleOf(toValue(subject).kind, rows);
  });
  const filtered = computed<Connection[]>(() => (people.value ?? []).filter((p) => personMatches(p, toValue(filter))));
  /** Known only once opened (or when a sheet already read it). */
  const count = computed<number | null>(() => (people.value === undefined ? null : people.value.length));

  return { people, filtered, count, isLoading: query.isLoading, isError: query.isError };
}
