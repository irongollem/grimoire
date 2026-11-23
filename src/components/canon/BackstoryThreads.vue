<template>
  <div class="flex flex-col gap-2" data-testid="backstory-threads">
    <span class="text-eyebrow text-muted-foreground">Threads left open</span>
    <ul v-if="threads.length > 0" class="flex flex-col gap-1" data-testid="backstory-thread-list">
      <li v-for="thread in threads" :key="thread.id" class="flex min-w-0 items-baseline gap-2" data-testid="backstory-thread">
        <RouterLink :to="{ path: '/canon', query: { entry: thread.id } }" class="min-w-0 text-body text-foreground hover:underline">{{ thread.title }}</RouterLink>
        <span class="shrink-0 text-label text-muted-foreground">{{ thread.part === "secret" ? "a secret" : "a question" }}</span>
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground" data-testid="no-threads">Nothing this past leaves open yet. A question it raises can be kept here, so it is not lost.</p>
    <CanonAddRow placeholder="A thread this past leaves open…" input-label="A thread this past leaves open" label="Add thread" :create="add" />
  </div>
</template>

<script setup lang="ts">
/**
 * What a character's past leaves unanswered (#1255 item 13): the open questions and unrevealed secrets tied to this
 * backstory. Adding one makes an open question and then ties it to the backstory, in that order; if the tie fails the
 * question stays (it is a real entry the DM can still tie by hand) and the DM is told.
 */
import { computed } from "vue";
import CanonAddRow from "./CanonAddRow.vue";
import { useCanonEntries, useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks, useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { openThreads } from "@/lib/canon/backstoryThreads";
import { toast } from "@/lib/toast";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry }>();

const { data: entries } = useCanonEntries();
const { data: links } = useCampaignLinks();
const threads = computed(() => openThreads(entry.id, entries.value ?? [], links.value ?? []));

const { mutateAsync: createEntry } = useCreateCanonEntry();
const { mutateAsync: connect } = useCreateConnectionInCampaign();
const related = typeChoices("canon", "canon").find((c) => c.key === "related_to" && c.subjectIsFrom);

async function add(title: string): Promise<void> {
  if (!related) throw new Error("A canon entry has no `related_to` tie to another");
  // The question is made first; creating it tells the DM itself when it fails, and nothing is tied then.
  const question = await createEntry({ part: "question", title });
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
