<template>
  <!-- What the AI table's voices cost us, by the character (#1021). A voiced line is charged this cost times the
       margin, in credits, so these are the numbers to change when a speech service changes its price. -->
  <div class="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="admin-voice-pricing">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">Table voices</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        What a speech service charges per million characters of text sent to be spoken. A line read aloud at the AI table is charged this cost times the
        margin, once; a kept clip is free to hear again. A service with no rate here does not speak.
      </p>
      <p v-if="perMinute" class="text-caption text-foreground mt-1" data-testid="admin-voice-per-minute">{{ perMinute }}</p>
    </div>
    <p v-if="pricing.query.isError.value" role="alert" class="text-body text-destructive">The prices could not be read. Reload to try again.</p>
    <ul v-else class="flex flex-col divide-y divide-border">
      <li v-for="row in rows" :key="row.model" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-mono text-label-lg text-foreground">{{ row.model }}</span>
          <span class="truncate text-caption text-muted-foreground">{{ row.provider }}<template v-if="row.notes"> · {{ row.notes }}</template></span>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <span class="text-label text-muted-foreground">$</span>
          <AppInput
            type="text"
            inputmode="decimal"
            :model-value="drafts.drafts[row.model]?.rate"
            align="right"
            size="caption"
            :block="false"
            class="w-20 font-mono"
            :aria-label="`USD per million characters for ${row.model}`"
            @change="(e: Event) => setRate(row.model, e)"
          />
          <span class="text-label text-muted-foreground">/M chars</span>
        </div>
        <span class="shrink-0 text-label" :class="row.last_verified_at ? 'text-muted-foreground' : 'text-ink-caution'">
          {{ row.last_verified_at ? `checked ${dayOf(row.last_verified_at)}` : "not checked" }}
        </span>
        <AppButton variant="outline" size="sm" label="Save" :loading="saving[row.model] === true" :disabled="!validRate(row.model)" @click="save(row)" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useAdminModelPricing, type ModelPricing } from "@/composables/admin/useAdminModelPricing";
import { useKeyedRecordDrafts } from "@/composables/admin/useKeyedRecordDrafts";
import { useTableVoiceRates } from "@/composables/table/useTableVoice";
import { useToast } from "@/composables/useToast";

const pricing = useAdminModelPricing();
const rates = useTableVoiceRates();
const queryClient = useQueryClient();
const toast = useToast();

// Speech models are the rows priced by the character.
const rows = computed(() => (pricing.query.data.value ?? []).filter((r) => r.cost_per_million_characters_usd !== null));

const drafts = useKeyedRecordDrafts<ModelPricing, { rate: number | null }>((row) => ({ rate: row.cost_per_million_characters_usd }));
watch(rows, (now) => now.forEach((row) => drafts.sync(row.model, row)), { immediate: true });
const saving = reactive<Record<string, boolean>>({});

function setRate(model: string, e: Event): void {
  const draft = drafts.drafts[model];
  if (!draft) return;
  const value = parseFloat((e.target as HTMLInputElement).value.replace(",", "."));
  draft.rate = Number.isNaN(value) ? null : value;
}

/** A rate must be a positive number: the server refuses to speak for a service whose rate is not one. */
function validRate(model: string): boolean {
  const rate = drafts.drafts[model]?.rate;
  return typeof rate === "number" && rate > 0;
}

async function save(row: ModelPricing): Promise<void> {
  const draft = drafts.drafts[row.model];
  if (!draft || !validRate(row.model)) return;
  saving[row.model] = true;
  try {
    // Save means "I checked this against the provider", so it stamps the date, as the model prices do.
    await pricing.upsert.mutateAsync({ model: row.model, provider: row.provider, model_type: row.model_type, cost_per_million_characters_usd: draft.rate, last_verified_at: new Date().toISOString() });
    drafts.commit(row.model);
    await queryClient.invalidateQueries({ queryKey: ["table-voice-rates"] });
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't save the price."));
  } finally {
    saving[row.model] = false;
  }
}

const dayOf = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// What players are charged for a minute, as the server works it out from these rates, the margin and a credit's worth.
const perMinute = computed(() => {
  const now = rates.data.value;
  if (!now || !now.on) return null;
  const parts = [
    now.perMinute.elevenlabs === null ? null : `ElevenLabs ${now.perMinute.elevenlabs}`,
    now.perMinute.inworld === null ? null : `Inworld ${now.perMinute.inworld}`,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : `Players are charged, for a minute of speech: ${parts.join(", ")} credits (about 900 characters, at the margin set above).`;
});
</script>
