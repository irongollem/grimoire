<template>
  <PageHeader :title="isNew ? 'New Faction' : faction?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div class="flex flex-col gap-6">
        <!-- Core fields: editor form when creating or `?edit=true`, otherwise
             the read-only sheet. Matches the sheet + editor + ?edit=true
             convention shared by NPC / Monster / Item / Spell / Location /
             Quest (#168). -->
        <FactionEditor
          v-if="isNew || isEditing"
          :key="faction?.id ?? 'new'"
          :faction="faction ?? null"
          :is-new="isNew"
        />
        <FactionSheet
          v-else-if="faction"
          :key="faction.id"
          :faction="faction"
        />

        <!-- Sub-sections (only on existing factions) — these are
             self-managing CRUD panels that are equally useful in both
             modes, so rendering them once below the sheet/editor avoids
             duplicating code and keeps them available without a full
             edit-mode flip. -->
        <template v-if="!isNew && faction">
          <div class="border-t border-border pt-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <FactionMembersSection :faction-id="faction.id" />
            <FactionPartyMembersSection :faction-id="faction.id" />
          </div>
          <div class="border-t border-border pt-6">
            <FactionRelationsSection :faction-id="faction.id" />
          </div>
          <div class="border-t border-border pt-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <FactionLocationsSection :faction-id="faction.id" />
            <FactionItemsSection :faction-id="faction.id" />
          </div>
          <div class="border-t border-border pt-6">
            <EntityNotesPanel entity-type="faction" :entity-id="faction.id" :campaign-id="faction.campaign_id" />
          </div>
        </template>
      </div>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useFaction } from "@/composables/useFactions";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FactionEditor from "@/components/factions/FactionEditor.vue";
import FactionSheet from "@/components/factions/FactionSheet.vue";
import FactionMembersSection from "@/components/factions/FactionMembersSection.vue";
import FactionPartyMembersSection from "@/components/factions/FactionPartyMembersSection.vue";
import FactionLocationsSection from "@/components/factions/FactionLocationsSection.vue";
import FactionItemsSection from "@/components/factions/FactionItemsSection.vue";
import FactionRelationsSection from "@/components/factions/FactionRelationsSection.vue";
import EntityNotesPanel from "@/components/common/EntityNotesPanel.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "faction-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: faction, isLoading: factionLoading } = useFaction(id);
const loading = computed(() => !isNew.value && factionLoading.value);
</script>
