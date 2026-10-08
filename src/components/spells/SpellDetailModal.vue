<template>
  <EntityDetailModal
    :title="displayName"
    :subtitle="subtitle"
    :loading="isLoading"
    height="content"
    :origin-key="`/spells/${id}`"
    @close="emit('close')"
  >
    <template v-if="canEdit" #actions>
      <AppButton
        variant="subtle"
        size="sm"
        label="Edit"
        :icon="IconEdit"
        :to="`/spells/${id}?edit=true`"
      />
    </template>

    <SpellSheet v-if="spell" :spell="spell">
      <template v-if="showDmNote" #dm-note>
        <DmNoteBox type="spell" :id="spell.id" :label="spell.name" />
      </template>
    </SpellSheet>
    <p v-else class="py-16 text-center text-body text-muted-foreground italic">
      This spell could not be found.
    </p>
  </EntityDetailModal>
</template>

<script setup lang="ts">
/**
 * A spell's read sheet, over the spellbook.
 *
 * The monster modal's twin: everything about being a modal belongs to
 * `EntityDetailModal`, and the art override is folded in by `useSpellWithArt`,
 * which the detail page shares.
 */
import { computed, toRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import EntityDetailModal from "@/components/common/EntityDetailModal.vue";
import SpellSheet from "@/components/spells/SpellSheet.vue";
import { useSpellWithArt } from "@/composables/spells/useSpellWithArt";
import { IconEdit } from "@/lib/icons";
import { isUuid } from "@/lib/library/contentIdentity";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { spellLevelLabel } from "@/types/spell.types";

const { id } = defineProps<{ id: string }>();

const emit = defineEmits<{ close: [] }>();

const auth = useAuthStore();
const ui = useUiStore();
const canEdit = computed(() => auth.isDM && !ui.dmPreviewMode);

const { spell, isLibrarySpell, isLoading } = useSpellWithArt(toRef(() => id));

const displayName = computed(() => spell.value?.name ?? "Spell");

// A note is stored against a row in `spells`, so only a custom spell (a uuid)
// the DM can edit has one; a library spell's id is text and never matches.
const showDmNote = computed(() => canEdit.value && !isLibrarySpell.value && isUuid(id));

const subtitle = computed(() => {
  const s = spell.value;
  if (!s) return undefined;
  const source = isLibrarySpell.value ? (s.source_title ?? s.source ?? "Reference") : null;
  return [
    `${spellLevelLabel(s.level)} ${s.school}${s.ritual ? " (ritual)" : ""}`,
    source,
  ]
    .filter(Boolean)
    .join(" · ");
});
</script>
