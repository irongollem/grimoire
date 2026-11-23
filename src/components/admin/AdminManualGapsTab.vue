<template>
  <div class="space-y-4">
    <p class="text-caption text-muted-foreground italic">
      Questions about the app that Ask's manual could not answer, reworded
      without names and folded together, so the count says how often each one
      comes up. Write the page, then mark the gap covered.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl v-model="adminUi.manualGapsStatus" :options="STATUS_OPTIONS" size="sm" />
      <AppButton
        v-if="adminUi.manualGapsHasActiveFilters"
        variant="subtle"
        size="sm"
        label="Clear"
        @click="adminUi.resetManualGapsFilters()"
      />
    </div>

    <ListSkeleton v-if="gapsQuery.isPending.value" variant="rows" :count="3" :columns="1" />
    <div v-else-if="gapsQuery.isError.value" class="text-destructive text-body">
      Failed to load the manual gaps.
    </div>
    <p v-else-if="!gaps.length" class="text-muted-foreground text-body italic">
      {{ emptyText }}
    </p>

    <div v-else class="space-y-3">
      <div
        v-for="gap in gaps"
        :key="gap.id"
        class="rounded-lg border border-border bg-card p-4 space-y-2"
      >
        <!-- Plain interpolation: the question started as a user's words. -->
        <p class="text-body text-foreground wrap-break-word">{{ gap.question }}</p>

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          <span>asked {{ gap.asked_count }} {{ gap.asked_count === 1 ? "time" : "times" }}</span>
          <span>first {{ timeAgo(gap.first_asked_at) }}</span>
          <span>last {{ timeAgo(gap.last_asked_at) }}</span>
          <span v-if="gap.covered_at">covered {{ timeAgo(gap.covered_at) }}</span>
        </div>

        <div v-if="gap.pages_checked.length" class="flex flex-wrap items-center gap-1.5">
          <span class="text-caption-sm text-muted-foreground">Pages checked</span>
          <AppButton
            v-for="page in gap.pages_checked"
            :key="page"
            as="span"
            variant="tinted"
            size="xs"
            :label="page"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <AppButton
            v-if="gap.covered_at === null"
            variant="primary"
            size="xs"
            label="Mark covered"
            :disabled="busy"
            @click="actions.markCovered.mutate(gap.id, { onError: fail })"
          />
          <AppButton
            v-else
            variant="outline"
            size="xs"
            label="Reopen"
            :disabled="busy"
            @click="actions.reopen.mutate(gap.id, { onError: fail })"
          />
          <AppButton
            variant="subtle"
            size="xs"
            label="Remove"
            :disabled="busy"
            @click="removeGap(gap)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin → Manual gaps. What Ask could not find in its manual, most-asked
 * first: the writing list for `src/manual/`. The page is not campaign data, so
 * a change refetches the list itself and nothing here listens for rings.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { useAdminManualGaps, useManualGapActions, type ManualGap } from "@/composables/admin/useAdminManualGaps";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { timeAgo } from "@/lib/utils";
import { useAdminUiStore } from "@/stores/ui/admin";

const STATUS_OPTIONS = [
  { value: "open" as const, label: "Open" },
  { value: "covered" as const, label: "Covered" },
  { value: "all" as const, label: "All" },
];

const adminUi = useAdminUiStore();
const gapsQuery = useAdminManualGaps();
const actions = useManualGapActions();
const { confirm } = useConfirm();
const toast = useToast();

const gaps = computed(() => {
  const all = gapsQuery.data.value ?? [];
  const status = adminUi.manualGapsStatus;
  if (status === "all") return all;
  return all.filter((g) => (status === "open") === (g.covered_at === null));
});

const emptyText = computed(() => {
  if (adminUi.manualGapsStatus === "open") {
    return "No open gaps. Ask has answered everything it was asked about the app.";
  }
  return adminUi.manualGapsStatus === "covered" ? "No gap has been marked covered yet." : "No gaps recorded yet.";
});

const busy = computed(
  () => actions.markCovered.isPending.value || actions.reopen.isPending.value || actions.remove.isPending.value,
);

function fail(e: unknown) {
  toast.error(toast.fromError(e, "Could not change the gap."));
}

async function removeGap(gap: ManualGap) {
  const ok = await confirm(`Remove this question? "${gap.question}"`, {
    title: "Remove gap",
    confirmLabel: "Remove",
  });
  if (!ok) return;
  actions.remove.mutate(gap.id, { onError: fail });
}
</script>
