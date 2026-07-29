<template>
  <div class="max-w-2xl mx-auto pb-8 space-y-6">
    <!-- Header: source entity + step indicator -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h1 class="text-heading-lg font-bold text-foreground">Forge a Simulacrum</h1>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground transition-colors"
          title="Cancel"
          @click="router.push('/minis')"
        >
          <IconClose class="h-4 w-4" />
        </button>
      </div>

      <div v-if="sourceEntity" class="flex items-center gap-2.5">
        <div class="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          <img v-if="sourcePortraitUrl" :src="sourcePortraitUrl" alt="" class="h-full w-full object-cover" />
        </div>
        <span class="text-body text-muted-foreground">{{ sourceEntity.name }}</span>
      </div>

      <WizardStepIndicator :steps="WIZARD_STEPS" :current-index="stepIndex" />
    </div>

    <!-- Step: Format -->
    <div v-if="stepIndex === 0" class="space-y-4">
      <MiniFormatStep :model-value="format" @update:model-value="format = $event" />
      <div class="flex justify-end pt-2 border-t border-border">
        <button
          type="button"
          :disabled="!format"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="stepIndex = 1"
        >
          Continue →
        </button>
      </div>
    </div>

    <!-- Step: Stylize -->
    <MiniStylizeStep
      v-else-if="stepIndex === 1 && format && campaignId"
      :mini="mini"
      :source-portrait-url="sourcePortraitUrl"
      :source-table="sourceTable"
      :source-id="sourceId"
      :format="format"
      :campaign-id="campaignId"
      @stylized="onStylized"
      @continue="stepIndex = 2"
    />

    <!-- Step: Sculpt -->
    <MiniSculptStep
      v-else-if="stepIndex === 2 && mini"
      :mini="mini"
      @update:mini="mini = $event"
      @back="stepIndex = 1"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import WizardStepIndicator from "@/components/common/WizardStepIndicator.vue";
import type { WizardStep } from "@/components/common/WizardStepIndicator.vue";
import { IconClose } from "@/lib/icons";
import MiniFormatStep from "@/components/simulacrum/MiniFormatStep.vue";
import MiniStylizeStep from "@/components/simulacrum/MiniStylizeStep.vue";
import MiniSculptStep from "@/components/simulacrum/MiniSculptStep.vue";
import type { Mini, MiniFormat, MiniSourceTable } from "@/types/mini.types";

const { sourceTable, sourceId, resumeMiniId = null } = defineProps<{
  sourceTable: MiniSourceTable;
  sourceId: string;
  resumeMiniId?: string | null;
}>();

const router = useRouter();
const campaign = useCampaignStore();
const campaignId = computed(() => campaign.activeCampaignId);

const WIZARD_STEPS: WizardStep[] = [
  { id: "format", label: "Format" },
  { id: "stylize", label: "Stylize" },
  { id: "sculpt", label: "Sculpt" },
  { id: "done", label: "Done" },
];

const stepIndex = ref(0);
const format = ref<MiniFormat | null>(null);
const mini = ref<Mini | null>(null);
let initializedResume = false;

// ── Source entity (header portrait + name) ──────────────────────────────────
interface SourceEntity { id: string; name: string; portrait_url: string | null }

async function fetchSourceEntity(): Promise<SourceEntity | null> {
  const portraitColumn = sourceTable === "monsters" ? "image_url" : "portrait_url";
  const { data, error } = await supabase
    .from(sourceTable)
    .select(`id, name, ${portraitColumn}`)
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Record<string, string | null>;
  return { id: row.id as string, name: row.name as string, portrait_url: row[portraitColumn] };
}

const { data: sourceEntity } = useQuery({
  queryKey: computed(() => ["mini-forge-source", sourceTable, sourceId]),
  queryFn: fetchSourceEntity,
  enabled: () => !!sourceId,
});

const sourcePortraitUrl = computed(() => sourceEntity.value?.portrait_url ?? null);

// ── Resume an existing mini ─────────────────────────────────────────────────
async function fetchMini(id: string): Promise<Mini> {
  const { data, error } = await supabase.from("minis").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Mini;
}

const { data: resumedMini } = useQuery({
  queryKey: computed(() => ["minis", resumeMiniId]),
  queryFn: () => fetchMini(resumeMiniId!),
  enabled: () => !!resumeMiniId,
});

watch(
  resumedMini,
  (row) => {
    if (!row) return;
    mini.value = row;
    format.value = row.format;
    if (initializedResume) return;
    initializedResume = true;
    // Resume position: an in-flight or already-resolved sculpt goes straight
    // to the sculpt step (which handles picking the wait back up / retrying);
    // anything earlier (stylizing/image_ready) lands on the stylize step so
    // the user can review or continue the render.
    stepIndex.value = ["sculpting", "downloading", "ready", "failed"].includes(row.status) ? 2 : 1;
  },
  { immediate: true },
);

function onStylized(updated: Mini) {
  mini.value = updated;
}
</script>
