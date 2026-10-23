import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import {
  useClearOpenBookEntries,
  useOpenBookEntries,
  useSetOpenBookEntries,
} from "@/composables/openBook/useOpenBookEntries";
import { useOpenBook } from "@/composables/openBook/useOpenBook";
import { isInBook } from "@/lib/openBook/eligibility";
import type { RevealAdapter } from "@/lib/reveal";
import { useCampaignStore } from "@/stores/campaign";
import type { OpenBookEntityType } from "@/types/openBook.types";
import type { PartyMember } from "@/types/party.types";

/** Which entry the reveal control is about, when that kind of entry can go in the Open Book. */
export interface BookEntryRef {
  type: OpenBookEntityType;
  id: string;
}

/** An entry kind's own answer to "can it go in the book", when it differs from "the whole party sees it". */
export interface BookRule {
  eligible: boolean;
  /** The caption while blocked; null falls back to the whole-party caption. */
  blockedCaption: string | null;
}

/** The first party member who cannot yet see the entry, or null when the whole party can (or there is no party). */
export function firstMissingMember(
  party: readonly Pick<PartyMember, "id" | "name">[],
  isMemberVisible: (id: string) => boolean,
): string | null {
  const missing = party.find((member) => !isMemberVisible(member.id));
  return missing ? missing.name : null;
}

/** The caption under the switch while it cannot be turned on. */
export function bookBlockedCaption(missingName: string | null): string {
  return missingName === null
    ? "Share with the whole party first."
    : `Share with the whole party first, so a stranger never reads it before ${missingName} does.`;
}

/**
 * What a write must do for an entry to end up in or out of the book. An entry row is an exception to the book's
 * default, so asking for the default itself clears the row rather than recording it.
 */
export function bookWrite(wantInBook: boolean, includeShared: boolean): "clear" | "set" {
  return wantInBook === includeShared ? "clear" : "set";
}

/**
 * The Open Book half of a reveal control (#1085).
 *
 * Present only for the campaign owner (RLS returns the book row to nobody else, so co-DMs and players never get a
 * section) and only once the campaign has a book. `eligible` follows the adapter, so an editor bound to an unsaved
 * draft shows what saving will mean; the database re-derives eligibility at release time either way. Kinds whose
 * rule is not "the whole party sees it" (NPCs also need a shared name, and can ride a place) pass their own `rule`.
 */
export function useBookReveal(
  entry: MaybeRefOrGetter<BookEntryRef | undefined>,
  adapter: RevealAdapter,
  rule?: MaybeRefOrGetter<BookRule | undefined>,
) {
  const campaign = useCampaignStore();
  const toast = useToast();
  const { data: partyData } = useParty();

  // Disabled queries (no entry, or not the owner) cost nothing, which matters: this runs on every card in a list.
  const campaignId = computed(() =>
    toValue(entry) !== undefined && campaign.isOwner ? campaign.activeCampaignId : null,
  );
  const { data: book } = useOpenBook(campaignId);
  const { data: entries } = useOpenBookEntries(() => (book.value ? campaignId.value : null));
  const setEntries = useSetOpenBookEntries();
  const clearEntries = useClearOpenBookEntries();

  const party = computed(() => partyData.value ?? []);
  const available = computed(() => toValue(entry) !== undefined && book.value != null);
  const missingMemberName = computed(() => firstMissingMember(party.value, adapter.isMemberVisible));
  const eligible = computed(
    () => toValue(rule)?.eligible ?? (party.value.length > 0 && missingMemberName.value === null),
  );
  const blockedCaption = computed(
    () => toValue(rule)?.blockedCaption ?? bookBlockedCaption(missingMemberName.value),
  );
  const choice = computed(() => {
    const ref = toValue(entry);
    return ref === undefined
      ? undefined
      : entries.value?.find((row) => row.entity_type === ref.type && row.entity_id === ref.id)?.included;
  });
  const inBook = computed(
    () => available.value && isInBook(eligible.value, choice.value, book.value?.include_shared ?? false),
  );

  async function toggle() {
    const ref = toValue(entry);
    const current = book.value;
    if (ref === undefined || !current || !eligible.value) return;
    const payload = { campaignId: current.campaign_id, entityType: ref.type, ids: [ref.id] };
    try {
      if (bookWrite(!inBook.value, current.include_shared) === "clear") {
        await clearEntries.mutateAsync(payload);
      } else {
        await setEntries.mutateAsync({ ...payload, included: !inBook.value });
      }
    } catch (e) {
      toast.error(toast.fromError(e, "Could not update the Open Book."));
    }
  }

  return { available, eligible, inBook, blockedCaption, toggle };
}
