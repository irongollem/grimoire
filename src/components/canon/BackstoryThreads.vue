<template>
  <div class="flex flex-col gap-2" data-testid="backstory-threads">
    <ul v-if="threads.length > 0" class="flex flex-col gap-1" data-testid="backstory-thread-list">
      <li v-for="thread in threads" :key="thread.id" class="flex min-w-0 items-baseline gap-2" data-testid="backstory-thread">
        <RouterLink :to="{ path: '/canon', query: { entry: thread.id } }" class="min-w-0 text-body text-foreground hover:underline">{{ thread.title }}</RouterLink>
        <span class="shrink-0 text-label text-muted-foreground">{{ thread.part === "secret" ? "a secret" : "a question" }}</span>
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground" data-testid="no-threads">Nothing this past leaves open yet. A question it raises can be kept here, so it is not lost.</p>
    <div v-if="paidOff.length > 0" class="flex flex-col gap-1" data-testid="backstory-paid-off">
      <AppButton variant="link" size="inline-caption" :icon="paidOpen ? IconChevronUp : IconChevronDown" icon-size="xs" :label="`Paid off (${paidOff.length})`" class="self-start" :aria-expanded="paidOpen" data-testid="paid-off-toggle" @click="paidOpen = !paidOpen" />
      <ul v-if="paidOpen" class="flex flex-col gap-1" data-testid="paid-off-list">
        <li v-for="thread in paidOff" :key="thread.id" class="flex min-w-0 flex-col" data-testid="paid-off-thread">
          <RouterLink :to="{ path: '/canon', query: { entry: thread.id } }" class="min-w-0 text-body text-foreground hover:underline">{{ thread.title }}</RouterLink>
          <span class="text-caption text-muted-foreground" data-testid="paid-off-became">{{ became(thread) }}</span>
        </li>
      </ul>
    </div>
    <CanonAddRow placeholder="A thread this past leaves open…" input-label="A thread this past leaves open" label="Add thread" :create="add" />
  </div>
</template>

<script setup lang="ts">
/**
 * What a character's past leaves unanswered (#1255 item 13; #1258 item 5 keeps the paid-off ones under "Paid off"): the open questions and unrevealed secrets tied to this
 * backstory. Adding one makes an open question and then ties it to the backstory, in that order; if the tie fails the
 * question stays (it is a real entry the DM can still tie by hand) and the DM is told.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonAddRow from "./CanonAddRow.vue";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCanonEntries, useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks, useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { openThreads, paidOffThreads } from "@/lib/canon/backstoryThreads";
import { writtenWhen } from "@/lib/canon/canonBackstory";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry }>();

const { data: entries } = useCanonEntries();
const { data: links } = useCampaignLinks();
const threads = computed(() => openThreads(entry.id, entries.value ?? [], links.value ?? []));
const paidOff = computed(() => paidOffThreads(entry.id, entries.value ?? [], links.value ?? []));
const paidOpen = ref(false);
const { data: sessions } = useCampaignSessions();

/** What a paid-off thread became (the entry that answers it, else the DM's closing words), and when it closed. */
function became(thread: CanonEntry): string {
  const target = thread.became_entry_id === null ? null : (entries.value ?? []).find((e) => e.id === thread.became_entry_id);
  const what = target ? `became "${target.title}"` : thread.closed_note !== null && thread.closed_note !== "" ? thread.closed_note : thread.part === "secret" ? "revealed" : "answered";
  const at = thread.closed_at ?? thread.revealed_at;
  const when = at === null ? "before play" : writtenWhen(at, sessions.value ?? []);
  return when === "before play" ? what : `${what}, ${when}`;
}

const ui = useCanonUiStore();
const { mutateAsync: createEntry } = useCreateCanonEntry();
const { mutateAsync: connect } = useCreateConnectionInCampaign();
const related = typeChoices("canon", "canon").find((c) => c.key === "related_to" && c.subjectIsFrom);

async function add(title: string): Promise<void> {
  if (!related) throw new Error("A canon entry has no `related_to` tie to another");
  // The question is made first; creating it tells the DM itself when it fails, and nothing is tied then.
  const question = await createEntry({ part: "question", title, arc_id: ui.arcFilter });
  try {
    await connect({
      input: { subject: { kind: "canon", id: entry.id }, other: { kind: "canon", id: question.id, name: question.title }, choice: related },
      campaignId: entry.campaign_id,
    });
  } catch (e) {
    toast.error(`The question was added, but it could not be tied to this backstory. ${toast.fromError(e)}`);
  }
}
</script>
