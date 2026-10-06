<template>
  <div class="flex min-h-full shrink-0 flex-col">
    <!-- The wall paints its own ground, so the way back sits on it as part of the page. -->
    <!-- grow + shrink-0 (here and on the wrapper): the layout scrolls a flex column, and a
         min-h-full item there may otherwise shrink to the viewport, spilling the cards off
         the wall's ground. -->
    <HallOfTheFallen scope="dm" class="grow" @edit-account="editing = $event">
      <template #before>
        <AppButton
          to="/party"
          variant="link"
          size="sm"
          :icon="IconChevronLeft"
          label="Party Tracker"
          class="self-start"
        />
      </template>
    </HallOfTheFallen>

    <SetDownDialog mode="edit" :open="editing !== null" :memorial="editing" @close="editing = null" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import HallOfTheFallen from "@/components/memorials/HallOfTheFallen.vue";
import SetDownDialog from "@/components/memorials/SetDownDialog.vue";
import { IconChevronLeft } from "@/lib/icons";
import type { CharacterMemorial } from "@/types/memorial.types";

/** The memorial whose account the DM is revising, or null. */
const editing = ref<CharacterMemorial | null>(null);
</script>
