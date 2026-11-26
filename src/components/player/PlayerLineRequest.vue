<template>
  <section aria-labelledby="world-line-request" class="space-y-2" data-testid="player-line-request">
    <div>
      <h2 id="world-line-request" class="text-label text-muted-foreground">Ask for a line or veil</h2>
      <p class="text-caption text-muted-foreground">A line is never in the story. A veil happens off screen. Only your DM reads this.</p>
    </div>
    <CanonAddRow v-if="!readOnly" v-model="draft" placeholder="Something you would rather not see at the table…" input-label="What to ask for" label="Send" :create="send">
      <SegmentedControl v-model="kind" :options="KIND_OPTIONS" class="shrink-0" aria-label="Line or veil" />
      <AppCheckbox v-model="signed" label="Put my name on it" label-role="label" data-testid="line-request-signed" />
    </CanonAddRow>
    <p v-if="sent" class="text-caption text-muted-foreground italic" role="status" data-testid="line-request-sent">{{ sent }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * "Ask for a line or veil" on the player's World tab (#1279 item 29): a private request to the DM's Premise chapter. The
 * name goes with it only when the player ticks the box, which starts off, and the answer after sending says which it was.
 * A DM looking through a player's eyes reads, and does not ask on their behalf.
 */
import { computed, ref } from "vue";
import CanonAddRow from "@/components/canon/CanonAddRow.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { lineRequestSentMessage, useAskLineOrVeil } from "@/composables/canon/useCanonLineRequests";
import { useAppUiStore } from "@/stores/ui/app";

const KIND_OPTIONS: SegmentedOption<"line" | "veil">[] = [
  { value: "line", label: "Line" },
  { value: "veil", label: "Veil" },
];

const appUi = useAppUiStore();
const readOnly = computed(() => appUi.dmPreviewMode);
const { mutateAsync: ask } = useAskLineOrVeil();
const kind = ref<"line" | "veil">("line");
const signed = ref(false);
const draft = ref("");
const sent = ref<string | null>(null);

async function send(body: string) {
  const wasSigned = signed.value;
  await ask({ kind: kind.value, body, signed: wasSigned });
  sent.value = lineRequestSentMessage(wasSigned);
  // The name never carries over to the next request by accident.
  signed.value = false;
}
</script>
