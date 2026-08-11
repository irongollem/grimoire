<template>
  <SettingsSection
    title="Download My Data"
    description="A copy of everything this account holds, as one JSON file."
  >
    <div class="space-y-4">
      <p class="text-body text-muted-foreground">
        Your profile, campaign memberships, subscription and consent records, credit history,
        journals, notes and preferences — plus a list of every file stored under your account.
        API keys and invite links are left out, so the file is safe to keep but can't be used to
        sign in anywhere.
      </p>
      <AppButton
        variant="outline"
        size="md"
        block
        label="Download my data"
        :loading="exporting"
        @click="exportData"
      />
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
/**
 * GDPR access & portability (#632) — the self-serve half of Art. 15/20.
 *
 * Placed above the deletion block on purpose: the two rights are read in that
 * order ("give me a copy" then "now erase it"), and erasure is irreversible
 * with no grace period (see context/compliance/data-subject-rights.md §5), so
 * the export has to be the thing a user meets first rather than the thing they
 * wish they had found.
 */
import SettingsSection from "@/components/common/SettingsSection.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useDataExport } from "@/composables/useDataExport";

const { exporting, error, exportData } = useDataExport();
</script>
