<template>
  <!--
    One spell, in whichever form the situation calls for — the same branches as
    `MonsterDetailView`, in the same reading order. Reading on tablet and up is a
    modal over the spellbook, which stays mounted behind it; editing is a
    commitment and keeps the full page at every width; phones take over the
    screen for reading. See `useDetailModal`.
  -->
  <SpellDetailModal v-if="asModal" :id="id" @close="close" />

  <SpellSheetMobile
    v-else-if="showMobileRead && spell"
    :spell="spell"
    :can-edit="canEdit"
    :show-dm-note="showDmNote"
  />

  <!-- Editing a spell on a phone is inside the reading takeover, which hides the
       app's own bars, and PageHeader drops its title below md: this bar names
       what is being edited and leads back to the sheet, as MonsterEditMobile's
       does. A new spell is a flat route that keeps the app's bars. -->
  <header
    v-if="showMobileEditBar"
    class="sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur md:hidden"
  >
    <AppButton variant="ghost" size="sm" label="View" :icon="IconDocument" class="shrink-0" @click="stopEditing" />
    <h1 class="min-w-0 flex-1 truncate text-center text-heading-sm font-bold text-foreground">{{ pageTitle }}</h1>
    <span class="w-16 shrink-0" aria-hidden="true" />
  </header>

  <PageHeader v-if="!asModal && !showMobileRead" :title="pageTitle" :description="pageDescription">
    <template v-if="!isNew && canEdit && !isMobile" #actions>
      <!-- Back to reading: the modal over the spellbook. -->
      <PageHeaderAction v-if="isEditing" label="View" :icon="IconDocument" @click="stopEditing" />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <p v-else-if="error" class="text-destructive text-body">Failed to load spell.</p>
    <template v-else>
      <SpellDetail v-if="isEditing" :key="id" :spell="spell" :is-shared="isLibrarySpell" />
      <!-- An `?edit=true` link opened by someone who cannot edit lands here. -->
      <SpellSheet v-else-if="spell" :spell="spell" />
    </template>
  </PageHeader>

  <!-- Reading on a phone, before the row has arrived. -->
  <div v-if="!asModal && showMobileRead && !spell" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDocument } from "@/lib/icons";
import { useSpellWithArt } from "@/composables/spells/useSpellWithArt";
import { useDetailModal } from "@/composables/useDetailModal";
import { isUuid } from "@/lib/library/contentIdentity";
import { spellLevelLabel } from "@/types/spell.types";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import AppButton from "@/components/common/AppButton.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SpellDetail from "@/components/spells/SpellDetail.vue";
import SpellDetailModal from "@/components/spells/SpellDetailModal.vue";
import SpellSheet from "@/components/spells/SpellSheet.vue";
import SpellSheetMobile from "@/components/spells/SpellSheetMobile.vue";

const auth = useAuthStore();
const ui = useUiStore();
const canEdit = computed(() => auth.isDM && !ui.dmPreviewMode);

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "spell-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

// The same reasoning SpellsView uses to decide whether to keep drawing the
// grid, so the two cannot disagree about which one the user is looking at.
const { asModal, close, isMobile } = useDetailModal("/spells");

// Broader than the composable's `?edit=true` test, because /spells/new is an
// edit screen without ever saying so in the query.
const isEditing = computed(() => (isNew.value || route.query.edit === "true") && canEdit.value);
const showMobileRead = computed(() => isMobile.value && !isNew.value && route.query.edit !== "true");
const showMobileEditBar = computed(() => isMobile.value && !isNew.value && isEditing.value);

function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  void router.replace({ query: q });
}

// The art override and the library flag, shared with the modal.
const { spell: resolvedSpell, isLibrarySpell, isLoading: resolvedLoading, error } = useSpellWithArt(id);

const isLoading = computed(() => !isNew.value && resolvedLoading.value);
const spell = computed(() => (isNew.value ? null : resolvedSpell.value));

// A note is stored against a row in `spells`: only a custom spell the DM can edit.
const showDmNote = computed(() => canEdit.value && !isLibrarySpell.value && isUuid(id.value));

const pageTitle = computed(() => (isNew.value ? "New Spell" : (spell.value?.name ?? "Loading…")));

const pageDescription = computed(() => {
  const s = spell.value;
  if (!s) return "";
  return `${spellLevelLabel(s.level)} · ${s.school}${s.ritual ? " · Ritual" : ""}${s.concentration ? " · Concentration" : ""}`;
});
</script>
