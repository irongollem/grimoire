<template>
  <div class="flex flex-col gap-4 p-4 md:p-6">
    <!-- Breadcrumb + Edit button.
         PartyMemberView was the one entry on the #168 audit list that already
         rendered a read-only sheet (PlayerCharacterView) by default — the
         missing bit was a DM-side Edit flow. PartyMemberForm existed but
         was orphaned in the codebase; wiring it up here as a side-sheet
         modal gives the DM a single-click path into the full character
         editor without navigating away. -->
    <div class="flex items-center gap-3">
      <RouterLink
        to="/party"
        class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
      >← Party</RouterLink>
      <template v-if="member">
        <RouterLink
          :to="`/character-sheet/${member.id}`"
          class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        >
          Export Sheet
        </RouterLink>
        <AppButton variant="primary" size="md" :icon="IconEdit" label="Edit" @click="editOpen = true" />
      </template>
    </div>

    <PlayerCharacterView
      :member-id="id"
      hide-player-actions
      @level-up="editOpen = true"
    />

    <PartyMemberForm
      v-if="editOpen && member"
      :member="member"
      @close="editOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { IconEdit } from '@/lib/icons';
import { useParty } from "@/composables/party/useParty";
import PlayerCharacterView from "@/views/play/PlayerCharacterView.vue";
import AppButton from "@/components/common/AppButton.vue";

// Lazy-load to avoid pulling Tiptap into the same chunk (prevents TDZ init error)
const PartyMemberForm = defineAsyncComponent(
  () => import("@/components/party/PartyMemberForm.vue"),
);

const route = useRoute();
const id = computed(() => route.params.id as string);

// Look up the member from the shared cache rather than adding a new fetch —
// the party list is already loaded by the time this view mounts from /party.
const { data: party } = useParty();
const member = computed(() => (party.value ?? []).find((m) => m.id === id.value) ?? null);

const editOpen = ref(false);
</script>
