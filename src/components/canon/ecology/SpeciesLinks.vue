<template>
  <div class="flex flex-col gap-2" data-testid="species-links">
    <ul v-if="mine.length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="row in rows" :key="row.link.id" class="flex flex-col gap-1" data-testid="species-link">
        <div class="flex items-start gap-1">
          <AppButton variant="ghost" size="inline-body" class="min-w-0 flex-1 flex-wrap justify-start text-left font-normal text-foreground" :aria-expanded="openId === row.link.id" :aria-label="`Edit: ${row.sentence}`" data-testid="species-link-open" @click="openId = openId === row.link.id ? null : row.link.id">
            <span class="min-w-0 text-left">
              <template v-for="(t, i) in row.tokens" :key="i">
                <span v-if="t.type === 'word'" data-testid="link-word">{{ t.text }}</span>
                <!-- The mention chip in its static (editor) look: the sentence is already a button, so a chip may not be one. -->
                <EntityMentionChip v-else-if="t.type === 'species'" entity-type="species" :id="t.id" :editable="true" data-testid="link-species" />
                <EntityMentionChip v-else-if="statBlockOf(t.id) !== null" entity-type="monster" :id="statBlockOf(t.id) as string" :editable="true" data-testid="link-form" />
                <span v-else data-testid="link-form">{{ t.name }}</span>
                {{ " " }}
              </template>
              <span v-if="row.link.note" class="italic text-muted-foreground" data-testid="link-note">{{ row.link.note }}</span>
            </span>
          </AppButton>
          <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove: ${row.sentence}`" data-testid="remove-link" @click="removeLink(row.link.id)" />
        </div>
        <SpeciesLinkEditor v-if="openId === row.link.id" :link="row.link" :species="species" />
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">Nothing yet. A link says what this species does to another: what it eats, what it competes with, what it shelters.</p>

    <form class="flex flex-wrap items-start gap-2" @submit.prevent="add">
      <AppSelect v-model="kind" size="sm" aria-label="What it does">
        <option v-for="k in LINK_KINDS" :key="k" :value="k">{{ LINK_KIND_LABEL[k] }}</option>
      </AppSelect>
      <div class="min-w-[min(100%,12rem)] flex-1">
        <MentionTextarea
          v-model="line"
          :items="others"
          :rows="1"
          :placeholder="targetOptional ? '@ the other species, or leave empty for other animals' : '@ the other species…'"
          aria-label="The other species"
          input-class="field-input w-full resize-none text-body"
          @item-selected="(s) => (picked = { id: s.item.id, token: s.token })"
          @keydown.enter="onEnter"
        />
      </div>
      <AppButton type="submit" variant="outline" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" label="Add link" :disabled="!canAdd" />
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * What a species does among the others (#1283), each link read from THIS species' side ("eats @Pith Piper", "is eaten by
 * @Rime bear"), with its note after it in italics. Clicking a sentence opens its small editor. The add row is a kind and
 * an @ of another species; shelters and carries may name no one ("other animals").
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";
import SpeciesLinkEditor from "./SpeciesLinkEditor.vue";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { LINK_KIND_LABEL, linkSentence, linkWords } from "@/lib/canon/ecology";
import { LINK_KINDS, type LinkKind, type Species } from "@/lib/canon/ecologyTypes";
import { IconAdd, IconClose } from "@/lib/icons";

const { species } = defineProps<{ species: Species }>();
const { species: everyone, forms, links, statBlockNameByForm, addLink, removeLink } = useSpeciesEditing();
/** A form's stat block id (the DM's own or a book's), or null when the form has none. */
const statBlockOf = (formId: string): string | null => {
  const form = forms.value.find((f) => f.id === formId);
  if (form === undefined) return null;
  return form.monsterId !== null ? form.monsterId : form.libraryMonsterId;
};

const ctx = computed(() => ({
  speciesById: new Map(everyone.value.map((s) => [s.id, s])),
  formsById: new Map(forms.value.map((f) => [f.id, f])),
  statBlockNameByForm: statBlockNameByForm.value,
}));
const mine = computed(() => links.value.filter((l) => l.fromSpeciesId === species.id || l.toSpeciesId === species.id));
const rows = computed(() =>
  mine.value.map((link) => {
    const tokens = linkWords(link, species.id, ctx.value);
    return { link, tokens, sentence: linkSentence(tokens) };
  }),
);
const openId = ref<string | null>(null);

const others = computed(() => everyone.value.filter((s) => s.id !== species.id).map((s) => ({ id: s.id, label: s.name, entityType: "species" as const })));

const kind = ref<LinkKind>("eats");
const line = ref("");
const picked = ref<{ id: string; token: string } | null>(null);
// A pick whose words were deleted from the line is no pick.
const target = computed(() => (picked.value !== null && line.value.includes(picked.value.token) ? picked.value.id : null));
const targetOptional = computed(() => kind.value === "shelters" || kind.value === "carries");
const canAdd = computed(() => target.value !== null || targetOptional.value);

function onEnter(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  e.preventDefault();
  void add();
}

async function add() {
  if (!canAdd.value) return;
  const made = await addLink({ fromSpeciesId: species.id, kind: kind.value, toSpeciesId: target.value });
  // A refused link is already a toast; the line stays to be changed.
  if (made === null) return;
  line.value = "";
  picked.value = null;
}
</script>
