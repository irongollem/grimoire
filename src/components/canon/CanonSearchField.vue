<template>
  <div class="flex items-center gap-2" data-testid="canon-search">
    <AppInput v-model="ui.query" type="search" tone="filled" size="body" class="min-w-0 flex-1" placeholder="Search the whole canon…" aria-label="Search the whole canon" />
    <AppButton v-if="ui.query.trim() !== ''" variant="ghost" size="sm" label="Clear" data-testid="search-clear" @click="ui.query = ''" />
  </div>
</template>

<script setup lang="ts">
/** The Canon's one search, held in the page header (and under the title on a phone): while it is set its results stand in place of the chapter. */
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

const ui = useCanonUiStore();
</script>
