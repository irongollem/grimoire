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
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
      >← Party</RouterLink>
      <button
        v-if="member"
        type="button"
        class="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="editOpen = true"
      >
        <Pencil class="h-3.5 w-3.5" />
        Edit
      </button>
    </div>

    <PlayerCharacterView :member-id="id" />

    <PartyMemberForm
      v-if="editOpen && member"
      :member="member"
      @close="editOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { Pencil } from "lucide-vue-next";
import { useParty } from "@/composables/useParty";
import PlayerCharacterView from "@/views/play/PlayerCharacterView.vue";
import PartyMemberForm from "@/components/party/PartyMemberForm.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);

// Look up the member from the shared cache rather than adding a new fetch —
// the party list is already loaded by the time this view mounts from /party.
const { data: party } = useParty();
const member = computed(() => (party.value ?? []).find((m) => m.id === id.value) ?? null);

const editOpen = ref(false);
</script>
