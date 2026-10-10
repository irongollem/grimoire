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
        <AppButton class="ml-auto" variant="outline" size="md" label="Export Sheet" :to="`/character-sheet/${member.id}`" />
        <AppButton variant="primary" size="md" :icon="IconEdit" label="Edit" @click="editOpen = true" />
        <!-- Retire first, the heavier word below the rule: only the DM marks a fall. -->
        <OverflowMenu
          v-if="!memorialInEffect"
          :label="`More actions for ${member.name}`"
          :items="menuItems"
          @select="(key) => (setDownMode = key === 'fallen' ? 'fallen' : 'retired')"
        />
      </template>
    </div>

    <PlayerCharacterView
      :member-id="id"
      hide-player-actions
      @level-up="editOpen = true"
    />

    <!-- Distinct from the character's own "Notes" above, which players read. -->
    <DmNoteBox v-if="member" type="party_member" :id="member.id" :label="member.name" />

    <!--
      DM-only: this view (unlike PlayerCharacterView, shared with the player
      portal) never renders for the player themselves, so session-note
      backlinks are safe to show here without leaking DM-side content.
    -->
    <EntityBacklinks v-if="member" :entity-id="member.id" />

    <SetDownDialog
      v-if="setDownMode"
      open
      :mode="setDownMode"
      :member="member"
      @close="setDownMode = null"
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
import PlayerCharacterView from "@/views/player/PlayerCharacterView.vue";
import AppButton from "@/components/common/AppButton.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/OverflowMenu.vue";
import SetDownDialog from "@/components/memorials/SetDownDialog.vue";
import { useCampaignMemorials } from "@/composables/memorials/useMemorials";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import EntityBacklinks from "@/components/common/EntityBacklinks.vue";

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

const { data: memorials } = useCampaignMemorials();
const memorialInEffect = computed(
  () => !!memorials.value && memorials.value.some((m) => m.party_member_id === id.value && m.restored_at === null),
);
const setDownMode = ref<"fallen" | "retired" | null>(null);
const menuItems: OverflowMenuEntry[] = [
  { key: "retire", label: "Retire…" },
  { key: "fallen", label: "Mark as fallen…", danger: true },
];
</script>
