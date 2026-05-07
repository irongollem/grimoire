<template>
  <PageHeader :title="spell?.name ?? 'New Spell'" :description="subtitle">
    <template v-if="!isNew && canEdit" #actions>
      <button
        v-if="!isEditing"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="startEditing"
      >
        <IconEdit class="h-3.5 w-3.5" />
        Edit
      </button>
      <button
        v-else
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        @click="stopEditing"
      >
        <IconReveal class="h-3.5 w-3.5" />
        View
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <p v-else-if="error" class="text-destructive font-fell text-sm">Failed to load spell.</p>
    <template v-else>
      <SpellSheet v-if="!isEditing && spell" :spell="spell" />
      <SpellDetail v-else :spell="spell ?? null" :is-srd="isSrdId" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconEdit, IconReveal } from '@/lib/icons';
import { useSpell, useSrdSpell } from "@/composables/useSpells";
import { useSrdSpellArt } from "@/composables/useSrdSpellArt";
import { spellLevelLabel } from "@/types/spell.types";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
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
const isSrdId = computed(() => !!id.value?.startsWith("srd_"));
const isEditing = computed(() => (isNew.value || route.query.edit === "true") && canEdit.value);

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}

const srdId = computed(() => (isSrdId.value ? (id.value ?? "") : ""));
const dbId  = computed(() => (!isSrdId.value && !isNew.value ? (id.value ?? "") : ""));

const { data: srdSpell,  isLoading: srdLoading } = useSrdSpell(srdId);
const { data: dbSpell,   isLoading: dbLoading, error } = useSpell(dbId);
const { data: artMap } = useSrdSpellArt();

const resolvedSrdSpell = computed(() => {
  const s = srdSpell.value;
  if (!s) return null;
  const art = artMap.value?.[s.id];
  if (!art) return s;
  return { ...s, image_url: art.image_url ?? s.image_url, image_focal_point: art.portrait_focal_point ?? s.image_focal_point };
});

const spell     = computed(() => isSrdId.value ? resolvedSrdSpell.value : dbSpell.value);
const isLoading = computed(() => isSrdId.value ? srdLoading.value : dbLoading.value);

const subtitle = computed(() => {
  const s = spell.value;
  if (!s) return "";
  return `${spellLevelLabel(s.level)} · ${s.school}${s.ritual ? " · Ritual" : ""}${s.concentration ? " · Concentration" : ""}`;
});
</script>
