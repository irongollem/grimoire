<template>
  <div class="flex flex-col gap-1.5" data-testid="generator-links">
    <span class="block text-caption text-muted-foreground">Ties</span>

    <div v-if="modelValue.length > 0" class="flex flex-wrap gap-1.5" role="list" aria-label="Ties chosen">
      <AppButton
        v-for="link in modelValue"
        :key="linkKey(link)"
        variant="chip"
        size="md"
        role="listitem"
        :label="linkChipLabel(link)"
        :icon-right="IconClose"
        :tooltip="`Remove: ${linkChipLabel(link)}`"
        :aria-label="`Remove ${linkChipLabel(link)}`"
        data-testid="generator-link-chip"
        @click="remove(link)"
      />
    </div>

    <AppButton
      class="self-start"
      variant="subtle"
      size="sm"
      :icon="IconNetwork"
      label="Tie it to…"
      data-testid="generator-link-add"
      @click="start"
    />

    <AppModal :open="open" size="lg" align="sheet" @close="close">
      <ModalHeader
        :title="`Tie ${noun} to…`"
        :subtitle="other ? `How is ${noun} tied to ${other.name}?` : 'Pick who or what it is tied to, then say how.'"
        :icon="IconNetwork"
        tone="primary"
        closeable
        @close="close"
      />
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
        <WorldEntityPicker v-if="!other" :kinds="kinds" @pick="onPick" />
        <template v-else>
          <div class="flex items-center justify-between gap-2 text-body text-foreground">
            <span>{{ other.name }}</span>
            <AppButton variant="subtle" size="sm" label="Pick another" @click="other = null" />
          </div>
          <TypeChoiceChips :key="other.id" :choices="choices" label="Type of tie" @pick="choose" />
        </template>
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
/**
 * "Tie it to…" for a generator panel: the ties the DM wants the new record to be made with, kept as removable chips
 * ("Worships · Auril") until the generator has saved the record and writes them (`useApplyGeneratorLinks`). The
 * maintainer's rule is that any sort of linking must be possible from the generators; the panel's own fields keep
 * what has a field of its own (a faction's role, kin), and this is the general way for every other tie.
 *
 * It composes the Connections block's own parts instead of a second picker: the search (`WorldEntityPicker`, limited
 * to the kinds the catalogue lets this kind hold) and the type chips (`TypeChoiceChips`, read from the new record, in
 * the direction the choice stores it). Nothing is written here: the new record has no id yet, so the caller keeps the
 * list. Family is not offered: kin has its own table, its own checks and its own field.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import WorldEntityPicker from "@/components/common/entity/WorldEntityPicker.vue";
import TypeChoiceChips from "@/components/connections/TypeChoiceChips.vue";
import { IconClose, IconNetwork } from "@/lib/icons";
import { LINK_KINDS, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { linkChipLabel, sameLink, type GeneratorLink } from "@/lib/worldLinks/generatorLinks";

const { modelValue, subjectKind, noun = "it" } = defineProps<{
  modelValue: readonly GeneratorLink[];
  /** The kind of the record being generated: what the catalogue reads the tie from. */
  subjectKind: LinkKind;
  /** What to call the new record in the dialog ("this NPC"). */
  noun?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [links: GeneratorLink[]] }>();

const open = ref(false);
const other = ref<{ kind: LinkKind; id: string; name: string } | null>(null);

/** What the new record can be to this one: everything the catalogue holds for the pair except family (its own field). */
function offered(otherKind: LinkKind): TypeChoice[] {
  return typeChoices(subjectKind, otherKind).filter((c) => c.home !== "kin");
}

/** Only kinds the new record can be tied to at all: a picker row that offers no type would be a dead end. */
const kinds = computed(() => LINK_KINDS.filter((kind) => offered(kind).length > 0));
const choices = computed(() => (other.value ? offered(other.value.kind) : []));

const linkKey = (link: GeneratorLink) => `${link.kind}:${link.id}:${link.choice.key}:${link.choice.subjectIsFrom}`;

function start() {
  other.value = null;
  open.value = true;
}
function close() {
  open.value = false;
  other.value = null;
}
function onPick(picked: { kind: LinkKind; id: string; name: string }) {
  other.value = picked;
}
function choose(choice: TypeChoice) {
  const picked = other.value;
  if (!picked) return;
  const link: GeneratorLink = { kind: picked.kind, id: picked.id, name: picked.name, choice };
  if (!modelValue.some((held) => sameLink(held, link))) emit("update:modelValue", [...modelValue, link]);
  close();
}
function remove(link: GeneratorLink) {
  emit("update:modelValue", modelValue.filter((held) => !sameLink(held, link)));
}
</script>
