<template>
  <!--
    One character's row on the NPC page: who they are, whether they can see this
    NPC, when they met, and the connection note they read as "Your connection".
    The row owns the connection's autosave, so each character's note saves
    itself and a blank note is never created.
  -->
  <li class="rounded-lg border border-border bg-card" data-testid="party-row">
    <div class="flex items-start gap-3 p-3">
      <div class="flex min-w-0 flex-1 items-start gap-3" :class="shared ? '' : 'opacity-60'" data-testid="party-row-identity">
        <div class="h-16 w-12 shrink-0 overflow-hidden rounded">
          <FocalImage
            :src="member.portrait_url"
            :focal-point="member.portrait_focal_point"
            format="portrait"
            :placeholder="placeholderUrl('character')"
          />
        </div>
        <div class="min-w-0">
          <p class="truncate text-heading-sm font-bold text-foreground">{{ member.name }}</p>
          <p class="truncate text-caption text-muted-foreground">{{ subtitle }}</p>
          <p class="mt-0.5 text-caption" :class="metAt ? 'text-foreground' : 'italic text-muted-foreground'">
            {{ metLabel }}
          </p>
        </div>
      </div>
      <AppButton
        :variant="shared ? 'tinted' : 'subtle'"
        :tone="shared ? 'success' : undefined"
        :emphasis="shared ? 'soft' : undefined"
        size="xs"
        :label="shared ? 'Shared' : 'Share'"
        :aria-pressed="shared"
        class="shrink-0"
        @click="emit('toggle')"
      />
    </div>

    <div class="border-t border-border px-3 pb-3 pt-2">
      <template v-if="editing">
        <div class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AppSelect
            :model-value="selectedChoice"
            tone="filled"
            size="xs"
            class="font-semibold uppercase text-primary"
            :aria-label="`${firstName}'s relationship to ${npc.name}`"
            :disabled="choosing"
            @update:model-value="choose($event)"
          >
            <option v-if="!connection" value="" disabled>Their connection…</option>
            <option v-for="c in choices" :key="choiceValue(c)" :value="choiceValue(c)">{{ c.word }}</option>
          </AppSelect>
          <span class="text-caption italic text-muted-foreground">{{ firstName }} reads this</span>
          <AutosaveStatus
            class="ml-auto"
            :status="status"
            :error="saveError"
            paused-label="Saves once you write something"
          />
          <OverflowMenu
            v-if="connection"
            variant="ghost"
            :label="`More actions for ${firstName}'s connection`"
            :items="MENU"
            size="icon-sm"
            @select="removeConnection"
          />
        </div>
        <RichTextEditor
          :key="revision"
          v-model="draft.told"
          :placeholder="`How does ${firstName} know them…`"
          size="sm"
          :sticky-toolbar="false"
        />
      </template>
      <AppButton
        v-else
        variant="ghost"
        size="inline-xs"
        :label="`+ ${firstName}'s connection`"
        @click="editing = true"
      />
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import {
  useCreateConnection,
  useRemoveConnection,
  useRetypeConnection,
  useUpdateLink,
} from "@/composables/connections/useConnections";
import { isBlankNote } from "@/composables/notes/useMyEntityNote";
import { useAutosave } from "@/composables/useAutosave";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import type { Connection } from "@/types/connections.types";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";

const { npc, member, shared, metAt = null, connection = null } = defineProps<{
  npc: NpcListRow;
  member: PartyMember;
  shared: boolean;
  /** ISO timestamp this character first met the NPC; null when they have not. */
  metAt?: string | null;
  /** The `world_links` tie between this NPC and this character, read from the NPC's side. */
  connection?: Connection | null;
}>();

const emit = defineEmits<{ (e: "toggle"): void }>();

const MENU: OverflowMenuEntry[] = [{ key: "remove", label: "Remove connection", danger: true }];
/** The type a told line files under when the DM writes one before choosing a type. */
const DEFAULT_TYPE = "contact";

// Every link type two people can hold; a record type (kin) has its own home on the kin tab.
const choices = typeChoices("npc", "party_member").filter((c) => c.home === undefined);
const choiceValue = (c: Pick<TypeChoice, "key" | "subjectIsFrom">) => `${c.key}:${c.subjectIsFrom ? "from" : "to"}`;
const choiceOf = (value: string): TypeChoice => {
  const found = choices.find((c) => choiceValue(c) === value);
  if (!found) throw new Error(`"${value}" is not a type an NPC can hold towards a character`);
  return found;
};

const firstName = computed(() => member.name.trim().split(/\s+/)[0] ?? member.name);
const subtitle = computed(() => [member.class, `Level ${member.level}`].filter(Boolean).join(" · "));
const subject = computed(() => ({ kind: "npc" as const, id: npc.id }));
const other = computed(() => ({ kind: "party_member" as const, id: member.id, name: member.name }));

// ── When they met ─────────────────────────────────────────────────────────────
const metLabel = computed(() => {
  if (!metAt) return "Not met";
  const date = new Date(metAt);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const text = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
  return `Met · ${text}`;
});

// ── The connection: a type picked in place, a told line saving itself ─────────
const create = useCreateConnection();
const retype = useRetypeConnection();
const update = useUpdateLink();
const remove = useRemoveConnection();

const choosing = computed(() => create.isPending.value || retype.isPending.value);
const selectedChoice = computed(() =>
  connection ? choiceValue({ key: connection.type, subjectIsFrom: connection.outward }) : "",
);

/** Whoever the link is revealed to, plus this character: writing to or typing a link tells its player. */
const revealedTo = (row: Connection | null): string[] => {
  const known = row?.player_visible_to ?? [];
  return known.includes(member.id) ? known : [...known, member.id];
};

async function choose(value: string) {
  if (value === "" || value === selectedChoice.value) return;
  const choice = choiceOf(value);
  if (!connection) {
    await create.mutateAsync({
      subject: subject.value,
      other: other.value,
      choice,
      told: told(draft.told),
      playerVisibleTo: [member.id],
    });
    return;
  }
  await retype.mutateAsync({ connection, subject: subject.value, choice });
  if (connection.player_visible_to?.includes(member.id) !== true) {
    await update.mutateAsync({ id: connection.row_id, playerVisibleTo: revealedTo(connection) });
  }
}

async function removeConnection() {
  if (!connection) return;
  await remove.mutateAsync({ connection, subject: subject.value });
  editing.value = false;
}

interface ToldDraft {
  told: string | null;
}

const told = (value: string | null): string => (value === null || isBlankNote(value) ? "" : value);
const fromConnection = (row: Connection | null): ToldDraft => ({ told: row?.told ? row.told : null });

const draft = reactive<ToldDraft>(fromConnection(connection));
const editing = ref(connection !== null);

async function save(snapshot: ToldDraft) {
  const line = told(snapshot.told);
  if (!connection) {
    // A line written before any type was chosen files under the default type; a blank one writes nothing.
    if (line === "") return;
    await create.mutateAsync({
      subject: subject.value,
      other: other.value,
      choice: choiceOf(choiceValue({ key: DEFAULT_TYPE, subjectIsFrom: true })),
      told: line,
      playerVisibleTo: [member.id],
    });
    return;
  }
  // Clearing the line keeps the link; removing it is the menu's job.
  await update.mutateAsync({ id: connection.row_id, told: line, playerVisibleTo: revealedTo(connection) });
}

const autosave = useAutosave({
  draft,
  initial: () => fromConnection(connection),
  equal: (a, b) => a.told === b.told || (isBlankNote(a.told) && isBlankNote(b.told)),
  save,
  canSave: () => connection !== null || !isBlankNote(draft.told),
  errorMessage: "Could not save the connection",
});
const { status, saveError } = autosave;

// RichTextEditor reads its value once and then only emits, so text replaced from
// here (another device, a refetch) needs a new key to reach it.
const revision = ref(0);
watch(
  () => connection,
  (row) => {
    if (autosave.dirty.value || autosave.saving.value) return;
    const next = fromConnection(row);
    if (next.told !== draft.told) revision.value++;
    autosave.reset(next);
    editing.value = row !== null || editing.value;
  },
);
</script>
