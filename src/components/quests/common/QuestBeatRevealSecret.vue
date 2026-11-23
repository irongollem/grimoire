<template>
  <div v-if="secret && secret.revealed_at === null" class="flex max-w-60 flex-col items-center gap-1 border border-border bg-muted/40 p-2 text-center" role="group" aria-label="Reveal the canon secret" data-testid="beat-reveal-secret">
    <p class="text-caption text-foreground">Reveal the secret to the party too?</p>
    <p class="text-caption text-muted-foreground">{{ secret.title }}</p>
    <div class="flex gap-1.5">
      <AppButton variant="primary" size="xs" label="Reveal it" :disabled="!ready" data-testid="beat-reveal-secret-yes" @click="revealIt" />
      <AppButton variant="outline" size="xs" label="Not yet" data-testid="beat-reveal-secret-no" @click="emit('done')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Asked right after a beat tied to a canon secret is revealed (#1255 item 21): the beat and the secret are two
 * reveals, so the DM chooses the second. Nothing shows when the secret is already revealed, and the beat alone is
 * revealed exactly as before.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useRevealSecret } from "@/composables/canon/useRevealSecret";

const { secretId } = defineProps<{ secretId: string }>();
const emit = defineEmits<{ done: [] }>();

const { data: entries } = useCanonEntries();
const secret = computed(() => (entries.value ?? []).find((e) => e.id === secretId && e.part === "secret"));
const { ready, revealSecret } = useRevealSecret();

function revealIt() {
  if (revealSecret(secretId)) emit("done");
}
</script>
