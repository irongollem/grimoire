import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useScriptoriumDocuments } from "@/composables/scriptorium/useScriptorium";

/**
 * What a `give_handout` payoff needs from the Scriptorium, shared by the beat
 * payoff list and the quest rules panel. Unlike the beat attacher (which also
 * offers account-wide documents, `isDocumentUsableIn`), the options here are the
 * quest's own campaign's documents only: a handout is given to *that*
 * campaign's party, and `quest_consequences` refuses a document of any other
 * campaign (migration `20261004110516`).
 */
export function useHandoutPayoff(campaignId: MaybeRefOrGetter<string | null>) {
  const { data: documents } = useScriptoriumDocuments();
  const handoutOptions = computed(() => (documents.value ?? [])
    .filter((doc) => doc.campaign_id !== null && doc.campaign_id === toValue(campaignId))
    .map((doc) => ({ id: doc.id, name: doc.title })));

  /** The title of a stored document id, or null while loading or when it is gone. */
  function documentLabel(id: string | null): string | null {
    if (!id) return null;
    return documents.value?.find((doc) => doc.id === id)?.title ?? null;
  }

  return { handoutOptions, documentLabel };
}
