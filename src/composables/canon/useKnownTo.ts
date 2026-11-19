import { computed, type MaybeRefOrGetter } from "vue";
import { typeChoices } from "@/lib/worldLinks/connections";
import { useConnections, useCreateConnection, useRemoveConnection, type NamedRef } from "@/composables/connections/useConnections";
import { toast } from "@/lib/toast";
import type { Connection } from "@/types/connections.types";
import type { AiProvenance } from "@/ai/provenance";

/** The ties that say who knows a truth: links of type `known_to` that run from the entry out to a person or faction. */
export function knownToOf(connections: readonly Connection[]): Connection[] {
  return connections.filter((c) => c.source === "link" && c.type === "known_to" && c.outward);
}

/** The kinds that can know a truth: a person (NPC or character) or a faction. */
export const KNOWER_KINDS = ["npc", "party_member", "faction"] as const;

/** Who knows one canon entry, read from its connections, and the two writes that change it. */
export function useKnownTo(entryId: MaybeRefOrGetter<string | null>) {
  const query = useConnections("canon", entryId);
  const knowers = computed(() => knownToOf(query.data.value ?? []));
  const create = useCreateConnection();
  const remove = useRemoveConnection();

  /** `aiProvenance` marks a tie that came with an accepted AI suggestion, as every accepted link does. */
  async function nameKnower(id: string, other: NamedRef, aiProvenance?: AiProvenance): Promise<void> {
    if (knowers.value.some((c) => c.other_kind === other.kind && c.other_id === other.id)) return;
    const choice = typeChoices("canon", other.kind).find((c) => c.key === "known_to" && c.subjectIsFrom);
    if (!choice) throw new Error(`a ${other.kind} cannot know a truth`);
    try {
      await create.mutateAsync({ subject: { kind: "canon", id }, other, choice, ...(aiProvenance ? { aiProvenance } : {}) });
    } catch (e) {
      toast.error(toast.fromError(e));
    }
  }

  async function forgetKnower(id: string, connection: Connection): Promise<void> {
    try {
      await remove.mutateAsync({ connection, subject: { kind: "canon", id } });
    } catch (e) {
      toast.error(toast.fromError(e));
    }
  }

  return { knowers, isLoading: query.isLoading, isError: query.isError, nameKnower, forgetKnower };
}
