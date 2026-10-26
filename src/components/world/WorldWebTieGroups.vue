<template>
  <!--
    Ties as answers (#1084 board 07): each group is what the others are to the
    subject, "Worships The Drowned Lady" over the ones who do, so the panel reads
    as a sentence rather than a table. Every row is a 44px target that moves the
    focus; the DM also gets a pencil to retype, re-word or remove it.
  -->
  <div class="flex flex-col gap-4">
    <section v-for="group in groups" :key="group.word" class="flex flex-col gap-1">
      <h3 class="text-label font-bold uppercase text-muted-foreground">
        {{ capitalise(group.word) }}
        <span class="font-normal">({{ group.items.length }})</span>
      </h3>

      <template v-for="item in group.items" :key="rowKey(item.tie)">
        <div class="flex items-stretch gap-1">
          <AppButton variant="menu" size="md" block class="min-h-11 min-w-0 flex-1 gap-2.5 px-1.5" @click="emit('node', item.key)">
            <svg width="30" height="30" viewBox="-15 -15 30 30" class="shrink-0" aria-hidden="true">
              <WorldNodeShape :kind="item.kind" :name="item.name" :size="11" :image="item.image" />
            </svg>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-body font-semibold text-foreground">{{ item.name }}</span>
              <span v-if="caption(item.tie)" class="block truncate text-caption italic text-muted-foreground">{{ caption(item.tie) }}</span>
            </span>
            <span
              class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: `var(${FAMILY_TOKEN[tieFamily(item.tie)]})` }"
              :title="TIE_FAMILY_LABELS[tieFamily(item.tie)]"
              aria-hidden="true"
            />
          </AppButton>
          <AppButton
            v-if="editable && isEditableTie(item.tie)"
            variant="ghost"
            size="icon-sm"
            :icon="IconEdit"
            :active="editing === rowKey(item.tie)"
            :label="`Edit how ${item.name} is tied`"
            class="min-h-11 min-w-11"
            @click="editing = editing === rowKey(item.tie) ? null : rowKey(item.tie)"
          />
        </div>

        <div
          v-if="editing === rowKey(item.tie)"
          class="mb-1 flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-2.5"
        >
          <div v-if="choicesFor(item).length" class="flex flex-col gap-1.5">
            <p class="text-label-lg font-semibold text-foreground">
              {{ subjectName }} is
            </p>
            <TypeChoiceChips
              :choices="choicesFor(item)"
              :current="{ key: item.tie.type, subjectIsFrom: fromKey(item.tie) === subjectKey }"
              :busy="busy"
              @pick="emit('retype', item.tie, $event)"
            />
          </div>

          <div v-if="item.tie.source === 'link'" class="flex flex-col gap-1.5">
            <label class="text-label-lg font-semibold text-foreground" :for="`note-${item.tie.row_id}`">Your note</label>
            <AppInput
              :id="`note-${item.tie.row_id}`"
              v-model="note"
              block
              size="body"
              placeholder="Only you read this"
            />
            <label class="text-label-lg font-semibold text-foreground" :for="`told-${item.tie.row_id}`">What players are told</label>
            <AppInput
              :id="`told-${item.tie.row_id}`"
              v-model="told"
              block
              size="body"
              placeholder="A line for those who know of it"
            />
            <AppButton
              variant="outline"
              size="sm"
              label="Save"
              class="self-start"
              :disabled="busy || (told === (item.tie.told ?? '') && note === (item.tie.note ?? ''))"
              @click="emit('words', item.tie, { note, told })"
            />
          </div>

          <AppButton
            variant="destructive"
            size="sm"
            :icon="IconDelete"
            label="Remove this tie"
            class="self-start"
            :disabled="busy"
            @click="emit('remove', item.tie)"
          />
        </div>
      </template>
    </section>

    <p v-if="!groups.length" class="text-body italic text-muted-foreground">Nothing is tied to this yet.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import WorldNodeShape from "@/components/world/WorldNodeShape.vue";
import TypeChoiceChips from "@/components/connections/TypeChoiceChips.vue";
import { FAMILY_TOKEN } from "@/composables/world/useWorldWebGraph";
import { IconDelete, IconEdit } from "@/lib/icons";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { membershipCaption } from "@/lib/worldWeb/badges";
import { isLinkKind, parseNodeKey } from "@/lib/worldWeb/kinds";
import { fromKey, isEditableTie, tieFamily, TIE_FAMILY_LABELS, type TieGroup, type TieItem, type WorldTie } from "@/lib/worldWeb/ties";

const { groups, subjectKey, subjectName, editable = false, busy = false } = defineProps<{
  groups: readonly TieGroup[];
  subjectKey: string;
  subjectName: string;
  /** The DM, outside a player's read. */
  editable?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  node: [key: string];
  retype: [tie: WorldTie, choice: TypeChoice];
  remove: [tie: WorldTie];
  words: [tie: WorldTie, words: { note: string; told: string }];
}>();

const editing = ref<string | null>(null);
const told = ref("");
const note = ref("");

watch(editing, (key) => {
  const item = groups.flatMap((g) => g.items).find((i) => rowKey(i.tie) === key);
  // An editor starts from what is stored; an absent line is an empty field, which saves as no line.
  told.value = item?.tie.told ?? "";
  note.value = item?.tie.note ?? "";
});
// Another subject is another list: an open editor from the last one would point at nothing.
watch(() => subjectKey, () => { editing.value = null; });

function rowKey(tie: WorldTie): string {
  return `${tie.source}:${tie.row_id}:${tie.type}:${tie.from_id}>${tie.to_id}`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A membership says its role, a quest its status; a plain link says nothing more. */
function caption(tie: WorldTie): string | null {
  if (tie.source === "membership") {
    const said = membershipCaption({ role: tie.role, status: tie.status, active: tie.status === null || tie.status === "Active" });
    return said === "Member" ? null : said;
  }
  if (tie.source === "quest") return tie.status;
  return tie.told;
}

function choicesFor(item: TieItem): TypeChoice[] {
  const subject = parseNodeKey(subjectKey);
  if (!subject || !isLinkKind(subject.kind) || !isLinkKind(item.kind)) return [];
  return typeChoices(subject.kind, item.kind);
}
</script>
