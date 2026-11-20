<template>
  <!-- A note a sitting at the AI table left (#1021 row 19): the facts are there; this has the sitting told as a story
       above them, as a Dungeon Master would write it up. Only on such a note, and not once it was rewritten by hand. -->
  <section v-if="tellable" class="flex flex-col gap-2 border border-border bg-card px-3.5 py-3" aria-label="Tell this sitting as a story" data-testid="note-tell">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="min-w-0 flex-1 basis-56 text-body text-foreground">Have this sitting told as a story, written from what happened at the table and put above the facts.</span>
      <AppButton variant="outline" size="md" label="Tell it as a story" :loading="busy" data-testid="note-tell-go" @click="tell" />
    </div>
    <p class="text-caption text-muted-foreground">It costs about what a turn at the table costs, and replaces an earlier telling. It holds only what the party knows.</p>
    <p v-if="problem" role="alert" class="text-caption text-destructive" data-testid="note-tell-problem">{{ problem }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useToast } from "@/composables/useToast";
import { supabase } from "@/lib/supabase";
import type { AiProvenance } from "@/ai/provenance";

/** Calls `agent-recap` and hands back the raw response. The seam a test replaces. */
type TellTransport = (noteId: string) => Promise<Response>;

const sendToAgentRecap: TellTransport = async (noteId) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-recap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ noteId }),
  });
};

const { note, transport = undefined } = defineProps<{
  note: { id: string; ai_provenance?: AiProvenance | null };
  transport?: TellTransport;
}>();

const client = useQueryClient();
const toast = useToast();
const busy = ref(false);
const problem = ref<string | null>(null);

// The mark `agent-leave` puts on the note a sitting leaves; a note a person has rewritten is theirs.
const tellable = computed(() => note.ai_provenance?.generatorType === "agent_table_record" && note.ai_provenance.edited !== true);

async function tell(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  problem.value = null;
  try {
    const response = await (transport ?? sendToAgentRecap)(note.id);
    const body = (await response.json().catch(() => null)) as { error?: unknown; message?: unknown; credits?: unknown } | null;
    if (!response.ok) {
      // `error` is a code and `message` the server's sentence for a person (#1234): the sentence is what is shown.
      const code = body && typeof body.error === "string" ? body.error : null;
      const sentence = body && typeof body.message === "string" ? body.message : null;
      problem.value =
        response.status === 402 || code === "insufficient_credits"
          ? "You are out of credits, so the sitting could not be told. Nothing was charged."
          : sentence !== null && response.status !== 500
            ? sentence
            : "The sitting could not be told right now. Nothing was charged.";
      return;
    }
    const credits = body && typeof body.credits === "number" ? body.credits : 0;
    toast.success(credits > 0 ? `The sitting is told. ${credits} ${credits === 1 ? "credit" : "credits"} charged.` : "The sitting is told.");
    await client.invalidateQueries({ queryKey: ["notes"] });
  } catch {
    problem.value = "The sitting could not be told right now. Nothing was charged.";
  } finally {
    busy.value = false;
  }
}
</script>
