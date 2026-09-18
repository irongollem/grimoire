<template>
  <div v-if="shortfalls.length" class="space-y-2 rounded-md border border-tone-caution/40 bg-tone-caution/5 p-3">
    <p class="text-caption font-semibold text-foreground">This would go past your plan's limits</p>
    <ul class="space-y-1">
      <li v-for="s in shortfalls" :key="s.kind" class="text-caption text-muted-foreground">
        {{ getEntityKindEntry(s.kind).labelPlural }}: this would add {{ s.wouldAdd }}, and your plan has room for
        {{ s.room }} more.
      </li>
    </ul>
    <p class="text-caption text-muted-foreground">
      Link or ignore some entries until it fits, or upgrade. Importing part of a page leaves everything that points at
      the missing entries unlinked, so nothing is imported until it fits.
    </p>
    <AppButton variant="subtle" size="inline" label="See plans" @click="router.push('/billing')" />
  </div>
</template>

<script setup lang="ts">
/**
 * The pre-flight plan-limit notice for a document import review — shown by
 * both the quest paste panel and the settings wizard's summary, above the
 * button it blocks. `reviewDecisions.ts`'s `quotaShortfalls` decides what is
 * over; this only says so.
 */
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import type { QuotaShortfall } from "@/lib/documentImport/reviewDecisions";

const { shortfalls } = defineProps<{ shortfalls: readonly QuotaShortfall[] }>();

const router = useRouter();
</script>
