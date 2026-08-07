<template>
  <PageHeader :title="spell?.name ?? 'New Spell'" :description="subtitle">
    <template v-if="!isNew && canEdit" #actions>
      <PageHeaderAction
        v-if="!isEditing"
        label="Edit"
        :icon="IconEdit"
        @click="startEditing"
      />
      <PageHeaderAction
        v-else
        label="View"
        :icon="IconDocument"
        @click="stopEditing"
      />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <p v-else-if="error" class="text-destructive text-body">Failed to load spell.</p>
    <template v-else>
      <SpellSheet v-if="!isEditing && spell" :spell="spell" />
      <SpellDetail v-else :spell="spell ?? null" :is-shared="isLibrarySpell" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDocument, IconEdit } from '@/lib/icons';
import { useResolvedSpell } from "@/composables/useSpells";
import { useLibrarySpellArt } from "@/composables/useLibrarySpellArt";
import { spellLevelLabel } from "@/types/spell.types";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SpellDetail from "@/components/spells/SpellDetail.vue";
import SpellSheet from "@/components/spells/SpellSheet.vue";

const auth = useAuthStore();
const ui = useUiStore();
const canEdit = computed(() => auth.isDM && !ui.dmPreviewMode);

const route = useRoute();
const router = useRouter();

const id = computed(() => route.params.id as string | undefined);
const isNew = computed(() => !id.value || id.value === "new");
const isEditing = computed(() => (isNew.value || route.query.edit === "true") && canEdit.value);

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const lookupId = computed(() => isNew.value ? "" : (id.value ?? ""));
const { data: resolved, isLoading, error } = useResolvedSpell(lookupId);
const { data: artMap } = useLibrarySpellArt();
const isLibrarySpell = computed(() => resolved.value?.isShared === true);

const resolvedLibrarySpell = computed(() => {
  const s = resolved.value?.spell;
  if (!s) return null;
  const art = artMap.value?.[s.id];
  if (!art) return s;
  return { ...s, image_url: art.image_url ?? s.image_url, image_focal_point: art.portrait_focal_point ?? s.image_focal_point };
});

const spell = computed(() => isLibrarySpell.value ? resolvedLibrarySpell.value : (resolved.value?.spell ?? null));

const subtitle = computed(() => {
  const s = spell.value;
  if (!s) return "";
  return `${spellLevelLabel(s.level)} · ${s.school}${s.ritual ? " · Ritual" : ""}${s.concentration ? " · Concentration" : ""}`;
});
</script>
