<template>
  <li class="flex min-w-0 flex-col gap-3 border-b border-border py-4 last:border-b-0" :class="untold ? 'bg-muted/20' : ''" :data-told="!untold" data-testid="lore-passage">
    <div class="flex min-w-0 flex-col gap-2">
      <span v-if="byline" class="text-label text-muted-foreground" data-testid="passage-byline">{{ byline }}</span>
      <div class="flex items-center gap-2">
        <span class="text-label text-primary">{{ numeral }}</span>
        <AppInput v-model="draft.title" size="body" tone="filled" aria-label="Passage heading" placeholder="A heading, such as What Bell-Note believes" class="min-w-0 flex-1" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" aria-label="Move this passage earlier" :disabled="!canMoveUp" @click="emit('move', -1)" />
        <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" aria-label="Move this passage later" :disabled="!canMoveDown" @click="emit('move', 1)" />
      </div>
      <RichTextEditor v-model="draft.body" size="sm" toolbar="focus" allow-secrets placeholder="What is told in this passage…" />
      <AutosaveStatus :status="status" :error="saveError" />
    </div>

    <div class="flex flex-col gap-2 border-l border-border pl-3 text-label" data-testid="passage-margin">
      <template v-if="first">
        <span class="inline-flex items-center gap-1.5 font-bold text-foreground" data-testid="passage-state">Told with the entry</span>
        <span class="text-muted-foreground">The first passage is what sharing the entry means.</span>
      </template>
      <template v-else-if="playersOwn">
        <!-- A player's passage is told when written, and the player places nothing of it: the DM edits it, no more. -->
        <span class="inline-flex items-center gap-1.5 font-bold text-foreground" data-testid="passage-state">Told {{ toldOn }}<template v-if="toldTo"> to {{ toldTo }}</template></span>
      </template>
      <template v-else>
        <span class="inline-flex items-center gap-1.5 font-bold text-foreground" data-testid="passage-state">
          <template v-if="untold">Not yet told</template>
          <template v-else>Told {{ toldOn }}<template v-if="toldTo"> to {{ toldTo }}</template></template>
        </span>
        <div v-if="untold" class="flex flex-wrap items-center gap-2">
          <AppButton variant="primary" size="sm" :label="tellTarget ? `Tell ${tellTarget.name}` : 'Tell the party'" data-testid="tell" @click="tellFirst" />
          <AppButton v-if="tellTarget" variant="ghost" size="sm" label="Tell the party" data-testid="tell-party" @click="tell(passage)" />
        </div>
        <AppButton v-else variant="outline" size="sm" label="Take back" class="self-start" data-testid="take-back" @click="takeBack" />

        <span class="text-eyebrow text-muted-foreground">Comes out at</span>
        <div class="flex flex-wrap items-center gap-2">
          <CanonRef v-if="where && where.name" :kind="where.kind" :name="where.name" />
          <span v-else-if="!where" class="italic text-muted-foreground" data-testid="passage-nowhere">Nowhere in particular</span>
          <AppButton variant="ghost" size="xs" :label="choosing ? 'Done' : 'Change'" @click="choosing = !choosing" />
        </div>
        <WherePicker v-if="choosing" v-model:kind="whereKind" nowhere-label="Nowhere" @choose="setWhere" />
      </template>

      <template v-if="clueTo.length > 0">
        <span class="text-eyebrow text-muted-foreground">Also a clue to</span>
        <RouterLink
          v-for="secret in clueTo"
          :key="secret.id"
          :to="{ path: '/canon', query: { entry: secret.id } }"
          class="text-body underline-offset-2 hover:underline"
          data-testid="passage-clue-to"
        >{{ secret.title }}</RouterLink>
      </template>

      <AppButton variant="ghost" size="xs" :icon="IconDelete" icon-size="xs" label="Remove passage" class="self-start" @click="remove" />
    </div>
  </li>
</template>

<script setup lang="ts">
/**
 * One passage of a lore entry (frame 04b): a heading and rich text that save themselves, then what is told of it. The
 * first passage is told with the entry and is never offered to Tell; a later one shows who it was told to and a
 * Take back (which asks first), where it comes out, and any secret it is also a clue to. In a backstory (frame 14) it
 * also says whose words it is, a player's own offers no Tell or place, and the DM's tells its character first.
 */
import { computed, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import CanonRef from "./CanonRef.vue";
import WherePicker, { type Where, type WhereTarget } from "./WherePicker.vue";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { passageWhere, wherePatch } from "@/composables/canon/useCanonPassages";
import { updateCanonPassage, useTellPassage, useUpdateCanonPassage } from "@/composables/canon/useCanonPassageEdits";
import { useClueWhere } from "@/composables/canon/useClueWhere";
import { useParty } from "@/composables/party/useParty";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { IconChevronDown, IconChevronUp, IconDelete } from "@/lib/icons";
import type { CanonLorePassage } from "@/types/canon.types";

const { passage, index, first, canMoveUp, canMoveDown, byline = null, playersOwn = false, tellTarget = null } = defineProps<{
  passage: CanonLorePassage;
  index: number;
  first: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Whose words these are, in a backstory ("Written by Lotte · before play", "Your passage"). */
  byline?: string | null;
  /** A backstory passage its character's player wrote: told when written, so it offers no Tell and no place. */
  playersOwn?: boolean;
  /** A backstory passage is told to its character first: "Tell Tansy" beside "Tell the party". */
  tellTarget?: { id: string; name: string } | null;
}>();
const emit = defineEmits<{ move: [by: -1 | 1]; remove: [] }>();

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const numeral = computed(() => `${NUMERALS[index] ?? index + 1} ·`);

interface PassageDraft { title: string; body: string | null }
const draft = reactive<PassageDraft>({ title: passage.title, body: passage.body });
const { status, saveError, dirty, reset, hold } = useAutosave<PassageDraft>({
  draft,
  initial: () => ({ title: passage.title, body: passage.body }),
  equal: (a, b) => a.title === b.title && a.body === b.body,
  save: (snapshot) => updateCanonPassage(passage.id, { title: snapshot.title, body: snapshot.body }),
});
watch(() => [passage.title, passage.body], () => {
  if (!dirty.value && (passage.title !== draft.title || passage.body !== draft.body)) reset({ title: passage.title, body: passage.body });
});

const untold = computed(() => passage.told_at === null);
const toldOn = computed(() => (passage.told_at ? new Date(passage.told_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""));

const { data: party } = useParty();
const toldTo = computed(() => {
  const members = party.value ?? [];
  if (members.length === 0 || passage.player_visible_to.length === 0) return "";
  if (members.every((m) => passage.player_visible_to.includes(m.id))) return "the whole party";
  return members.filter((m) => passage.player_visible_to.includes(m.id)).map((m) => m.name).join(", ");
});

const { tell, takeBack: take } = useTellPassage();
function tellFirst() {
  if (tellTarget) void tell(passage, [tellTarget.id]);
  else void tell(passage);
}
const { confirm } = useConfirm();
async function takeBack() {
  const ok = await confirm(`Take this passage back? It leaves the players' pages until you tell it again.`, { title: "Take the passage back", confirmLabel: "Take back", danger: false });
  if (ok) take(passage);
}

const whereOf = useClueWhere();
const where = computed(() => whereOf.value(passage));
const choosing = ref(false);
const whereKind = ref<Where>(passageWhere(passage)?.kind ?? "location");
const { mutate: update } = useUpdateCanonPassage();
function setWhere(target: WhereTarget | null) {
  update({ id: passage.id, patch: wherePatch(target) });
  choosing.value = false;
}

const { data: clues } = useCanonClues();
const { data: entries } = useCanonEntries();
const clueTo = computed(() => {
  const ids = new Set((clues.value ?? []).filter((c) => c.passage_id === passage.id).map((c) => c.secret_id));
  return (entries.value ?? []).filter((e) => e.part === "secret" && ids.has(e.id));
});

async function remove() {
  const ok = await confirm(`Remove this passage? "${draft.title || "Untitled passage"}" is deleted.`, { title: "Remove this passage", confirmLabel: "Remove" });
  if (!ok) return;
  await hold();
  emit("remove");
}
</script>
