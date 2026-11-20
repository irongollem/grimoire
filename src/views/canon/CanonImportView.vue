<template>
  <PageHeader title="Bring in a book" description="A book, a PDF, page photos, pasted text or a wiki export, taken apart into the campaign's own sections.">
    <template #actions>
      <AppButton to="/canon" variant="ghost" size="md" :icon="IconChevronLeft" label="Back to the canon" />
    </template>
    <div class="px-4 pb-8 pt-4 md:px-6" data-testid="canon-import">
      <div class="max-w-3xl">
        <DocumentImportTab />
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * Bring in a book (#1226, frame 10): the document import, moved out of Campaign settings onto its own page under the
 * Canon, since a book's lore, truths and secrets land in the canon first. The importer itself is unchanged; this page
 * only hosts it. It stays reachable with AI off, because a wiki export is read without AI (#932).
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import DocumentImportTab from "@/components/campaign/DocumentImportTab.vue";
import { IconChevronLeft } from "@/lib/icons";
</script>
