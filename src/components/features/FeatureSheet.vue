<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Action bar: an official row is read-only unless you are the admin -->
    <div v-if="canEdit" class="flex items-center justify-end gap-2">
      <AppButton variant="destructive" size="md" :icon="IconDelete" label="Delete" @click="handleDelete" />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconEdit"
        label="Edit"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Identity card -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-label font-semibold bg-primary/10 text-primary rounded px-2 py-0.5">
            {{ feature.kind === 'feat' ? 'Feat' : activationLabel }}
          </span>
          <span v-if="feature.kind === 'feat' && feature.feat_category" class="text-label font-semibold bg-primary/10 text-primary rounded px-2 py-0.5">
            {{ FEAT_CATEGORY_LABELS[feature.feat_category] }}
          </span>
          <span v-if="feature.kind === 'feat' && feature.repeatable" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            Repeatable
          </span>
          <span v-if="isOfficial" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">Official</span>
          <span v-if="bookTitle" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ bookTitle }}
          </span>
          <span v-if="feature.ruleset" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ feature.ruleset }} rules
          </span>
          <span v-if="!isOfficial" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
            {{ feature.campaign_id ? 'Campaign-scoped' : 'All campaigns' }}
          </span>
        </div>
        <p v-if="isOfficial && !canEdit" class="text-caption text-muted-foreground">
          This comes from {{ bookTitle ?? 'a published book' }} and is shared with every table, so it can be read but not changed.
        </p>
        <p v-if="feature.prerequisite" class="text-body text-muted-foreground italic">
          Prerequisite: {{ feature.prerequisite }}
        </p>
        <div v-if="feature.tags.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in feature.tags"
            :key="tag"
            class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Description card -->
    <div v-if="hasDescription" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
      </div>
      <div class="p-4">
        <RichTextViewer :content="feature.description" />
      </div>
    </div>

    <!-- Feat conditions and increase -->
    <div v-if="featLines.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Feat</span>
      </div>
      <dl class="p-4 flex flex-col gap-3">
        <div v-for="g in featLines" :key="g.heading" class="flex flex-col gap-1">
          <dt class="text-eyebrow text-muted-foreground">{{ g.heading }}</dt>
          <dd>
            <ul class="flex flex-col gap-0.5 text-body text-foreground">
              <li v-for="line in g.lines" :key="line">{{ line }}</li>
            </ul>
          </dd>
        </div>
      </dl>
    </div>

    <!-- Mechanics -->
    <div v-if="hasMechanics" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Mechanics</span>
      </div>
      <div class="p-4">
        <MechanicsSummary :mechanics="mechanics" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteFeature } from "@/composables/rules/useFeatures";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { parseMechanics } from "@/rules/features/mechanics";
import { ACTIVATION_LABELS, FEAT_CATEGORY_LABELS, type ClassFeature } from "@/types/feature.types";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";
import MechanicsSummary from "@/components/features/mechanics/MechanicsSummary.vue";
import { describeAbilityIncrease, describePrerequisites, summarizeMechanics, type SummaryGroup } from "@/components/features/mechanics/mechanicsSummary";

const { feature, canEdit = true } = defineProps<{
  feature: ClassFeature;
  /** False for an official row and a non-admin: no Edit, no Delete. */
  canEdit?: boolean;
}>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteFeature();
const { titleFor } = useSourceTitles();

const isOfficial = computed(() => feature.user_id === null);
const bookTitle = computed(() => titleFor(feature.source));
const mechanics = computed(() => parseMechanics(feature.mechanics).mechanics);
const hasMechanics = computed(() => summarizeMechanics(mechanics.value).length > 0);
const activationLabel = computed(() => (mechanics.value.activation ? ACTIVATION_LABELS[mechanics.value.activation] : "Passive"));
const listPath = computed(() => (feature.kind === "feat" ? "/codex/feats" : "/codex/abilities"));

const featLines = computed<SummaryGroup[]>(() => {
  if (feature.kind !== "feat") return [];
  const groups: SummaryGroup[] = [];
  const conditions = describePrerequisites(feature.prerequisites);
  if (conditions.length > 0) groups.push({ heading: "Prerequisites", lines: conditions });
  const increase = describeAbilityIncrease(feature.ability_increase);
  if (increase) groups.push({ heading: "Ability score increase", lines: [increase] });
  return groups;
});

function hasContent(field: string | null | undefined): boolean {
  if (!field) return false;
  try {
    const doc = JSON.parse(field);
    const texts: string[] = [];
    function walk(n: { text?: string; content?: unknown[] }) {
      if (n.text) texts.push(n.text);
      (n.content as typeof n[] | undefined)?.forEach(walk);
    }
    walk(doc);
    return texts.join("").trim().length > 0;
  } catch {
    return String(field).trim().length > 0;
  }
}

const hasDescription = computed(() => hasContent(feature.description));

async function handleDelete() {
  const ok = await confirm(`Delete "${feature.name}"? This cannot be undone.`, {
    title: feature.kind === "feat" ? "Delete Feat" : "Delete Ability",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  router.push(listPath.value);
  await deleteMut.mutateAsync(feature.id);
}
</script>
