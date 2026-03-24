<template>
  <div class="p-4 md:p-6">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <p v-else-if="error" class="text-destructive font-fell text-sm">Failed to load spell.</p>
    <SpellDetail v-else :spell="spell ?? null" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useSpell } from "@/composables/useSpells";
import SpellDetail from "@/components/spells/SpellDetail.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const route = useRoute();
const id = computed(() => route.params.id as string | undefined);

const isNew = computed(() => !id.value || id.value === "new");

const { data: spell, isLoading, error } = useSpell(isNew.value ? "" : (id.value ?? ""));
</script>
