<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <h2 class="text-heading-sm font-semibold text-foreground">
      Official classes, subclasses, features and feats
    </h2>
    <p class="text-caption text-muted-foreground italic">
      Reads every open-licensed book on Open5e and writes the one shared set every account sees,
      with each feature at every level it is gained and the SRD mechanics applied. Re-running is
      safe: rows are matched by book and record, and nothing is deleted.
    </p>
    <AppButton
      variant="primary"
      size="sm"
      :icon="IconDownload"
      :loading="importer.isPending.value"
      :label="importer.isPending.value ? 'Importing…' : 'Import from Open5e'"
      @click="importer.mutate()"
    />
    <p v-if="importer.error.value" class="text-caption text-destructive" role="alert">
      {{ importer.error.value.message }}
    </p>
    <dl v-if="result" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption text-foreground">
      <dt class="text-muted-foreground">Features and feats</dt>
      <dd>{{ result.features.inserted }} added, {{ result.features.updated }} updated</dd>
      <dt class="text-muted-foreground">Subclasses</dt>
      <dd>{{ result.subclasses.inserted }} added, {{ result.subclasses.updated }} updated</dd>
      <dt class="text-muted-foreground">Other classes</dt>
      <dd>{{ result.classes.inserted }} added, {{ result.classes.updated }} updated</dd>
      <dt class="text-muted-foreground">SRD classes</dt>
      <dd>{{ result.systemClasses.updated }} feature maps written</dd>
      <dt class="text-muted-foreground">No longer listed</dt>
      <dd>{{ notListedTotal }} kept (not deleted)</dd>
      <template v-if="result.skippedDocuments.length">
        <dt class="text-muted-foreground">Skipped books</dt>
        <dd>{{ result.skippedDocuments.join(", ") }}</dd>
      </template>
      <template v-if="result.catalogueWarnings.length">
        <dt class="text-muted-foreground">Catalogue warnings</dt>
        <dd>
          <ul class="list-disc pl-4">
            <li v-for="warning in result.catalogueWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </dd>
      </template>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconDownload } from "@/lib/icons";
import { useOfficialClassContentImport } from "@/composables/admin/useOfficialClassContentImport";

const importer = useOfficialClassContentImport();
const result = computed(() => importer.data.value ?? null);
const notListedTotal = computed(() => {
  const n = result.value?.notListed;
  return n ? n.features + n.subclasses + n.classes : 0;
});
</script>
