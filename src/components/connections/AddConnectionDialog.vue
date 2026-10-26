<template>
  <AppModal :open="open" size="lg" align="sheet" @close="emit('close')">
    <ModalHeader
      title="Add a connection"
      :subtitle="`Connect ${subjectName} to…`"
      :icon="IconNetwork"
      tone="primary"
      closeable
      @close="emit('close')"
    />

    <div class="grid min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain px-5 py-4 md:grid-cols-2">
      <div class="min-w-0">
        <span class="field-label">Who or what</span>
        <WorldEntityPicker :subject="subject" @pick="onPick" />
      </div>

      <div class="min-w-0" data-testid="add-connection-right">
        <p v-if="!other" class="py-6 text-center text-caption italic text-muted-foreground">
          Pick who or what {{ subjectName }} is tied to, then say how.
        </p>

        <div v-else class="flex flex-col gap-3">
          <div>
            <span class="field-label">How is {{ subjectName }} tied to {{ other.name }}?</span>
            <div class="flex flex-wrap gap-1" role="group" aria-label="Type">
              <AppButton
                v-for="c in visibleChoices"
                :key="choiceKey(c)"
                size="sm"
                :active="choice !== null && choiceKey(choice) === choiceKey(c)"
                :label="c.word"
                :data-choice="choiceKey(c)"
                @click="choice = c"
              />
              <AppButton v-if="!showMore && split.more.length > 0" size="sm" label="more…" data-testid="more-types" @click="showMore = true" />
            </div>
            <AppInput
              v-if="showMore"
              v-model="typeFilter"
              type="search"
              size="caption"
              block
              class="mt-2"
              placeholder="Find a type…"
              aria-label="Find a type"
            />
            <p v-if="choices.length === 0" class="text-caption italic text-muted-foreground">
              Nothing ties a {{ KIND_NOUN[subject.kind] }} to a {{ KIND_NOUN[other.kind] }} yet.
            </p>
            <p v-if="alreadyWords.length > 0" class="mt-1 text-caption italic text-muted-foreground" data-testid="already">
              Already: {{ alreadyWords.join(", ") }}. A second type is a second link.
            </p>
            <AddConnectionKinNote
              v-if="isPersonPair"
              :subject="subject"
              :other="other"
              :subject-name="subjectName"
              :other-name="other.name"
            />
          </div>

          <template v-if="choice">
            <p class="text-body text-foreground" data-testid="sentence">
              {{ subjectName }} {{ choice.word }} {{ other.name }}
              <span class="block text-caption italic text-muted-foreground">
                and on {{ other.name }}’s sheet: {{ opposite }} {{ subjectName }}
              </span>
            </p>

            <!-- A record has fields of its own; a link has a note, a told line and who knows. -->
            <template v-if="choice.home === 'membership'">
              <div>
                <span class="field-label">Role</span>
                <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Role">
                  <AppButton
                    v-for="r in commonRoles"
                    :key="r"
                    size="sm"
                    :active="role === r"
                    :label="r"
                    @click="role = r"
                  />
                  <AppSelect v-model="role" tone="filled" size="caption" weight="normal" aria-label="More roles">
                    <option v-for="r in roleList" :key="r" :value="r">{{ r }}</option>
                  </AppSelect>
                </div>
                <p v-if="headed" class="mt-1 text-caption italic text-muted-foreground">
                  This faction already has a head, so Leader and Head of house are not offered.
                </p>
              </div>
            </template>
            <p v-else-if="replacesLine" class="text-caption italic text-muted-foreground" data-testid="replaces">{{ replacesLine }}</p>

            <template v-if="!choice.home">
              <div>
                <label class="field-label" :for="noteId">Note <span class="font-normal normal-case italic text-muted-foreground">yours</span></label>
                <AppInput :id="noteId" v-model="note" tone="card" size="body" block placeholder="Why they are tied" />
              </div>
              <div>
                <label class="field-label" :for="toldId">Told <span class="font-normal normal-case italic text-muted-foreground">what someone who knows reads</span></label>
                <AppInput :id="toldId" v-model="told" tone="card" size="body" block placeholder="What the party would say" />
              </div>
              <div>
                <span class="field-label">Who knows</span>
                <AudienceRevealControl
                  :visible-to="visibleTo"
                  :name="`${subjectName} and ${other.name}`"
                  @change="(next) => (visibleTo = next)"
                />
                <p class="mt-1 text-caption italic text-muted-foreground">Nobody, to begin with.</p>
              </div>
            </template>
            <p v-else-if="choice.home === 'kin'" class="text-caption italic text-muted-foreground">
              Kin keeps its own dialog, with birth-year checks, under Family.
            </p>
          </template>
        </div>
      </div>
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :label="choice?.home === 'kin' ? 'Add in Family' : 'Add connection'"
        :loading="create.isPending.value"
        :disabled="!canAdd"
        @click="add"
      />
    </div>
  </AppModal>

  <!-- Kin has its own dialog (birth-year checks, parentage); it is read only when asked for. -->
  <AddRelativeDialog
    v-if="relativeOpen && subjectPerson"
    :subject="subjectPerson"
    open
    :initial-relation="relation"
    @close="relativeOpen = false"
    @added="relativeOpen = false"
  />
</template>

<script setup lang="ts">
/**
 * Add a connection (#1084, board 04). The left side is the global search
 * engine, limited to what can hold a tie; once something is picked, the right
 * side offers the types the two kinds can hold, the sentence read both ways,
 * and either a link's note, told line and who knows, or a record's own fields
 * (a membership's role, what a one-valued record replaces). Kin is not
 * duplicated here: it opens the Add relative dialog at the right relation.
 *
 * The dialog closes on Add with no navigation: the new row appearing in the
 * block it was added from is the confirmation.
 */
import { computed, ref, useId, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import WorldEntityPicker from "@/components/common/entity/WorldEntityPicker.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import AddConnectionKinNote from "@/components/connections/AddConnectionKinNote.vue";
import AddRelativeDialog from "@/components/kinship/AddRelativeDialog.vue";
import {
  HOME_LABEL,
  kinRelationFor,
  offeredRoles,
  oppositeWord,
  splitChoices,
} from "@/components/connections/connectionRows";
import { useCreateConnection, type NamedRef } from "@/composables/connections/useConnections";
import { useFactionHeaded } from "@/composables/factions/useFactions";
import { useToast } from "@/composables/useToast";
import { IconNetwork } from "@/lib/icons";
import { personKey } from "@/lib/kinship/keys";
import { connectionWord, typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import type { Connection, WorldRef } from "@/types/connections.types";
import type { KinRelation } from "@/types/kinship.types";

const { open, subject, subjectName, connections } = defineProps<{
  open: boolean;
  subject: WorldRef;
  subjectName: string;
  /** The block's rows, to say what is already tied and what a one-valued record replaces. */
  connections: readonly Connection[];
}>();
const emit = defineEmits<{ close: [] }>();

const KIND_NOUN: Record<WorldRef["kind"], string> = {
  npc: "person",
  party_member: "character",
  faction: "faction",
  location: "place",
  deity: "deity",
  item: "item",
};
const COMMON_ROLES: readonly string[] = ["Leader", "Officer", "Member", "Initiate", "Patron"];

const toast = useToast();
const create = useCreateConnection();
const noteId = useId();
const toldId = useId();

const other = ref<NamedRef | null>(null);
const choice = ref<TypeChoice | null>(null);
const showMore = ref(false);
const typeFilter = ref("");
const note = ref("");
const told = ref("");
const visibleTo = ref<string[]>([]);
const role = ref("Member");
const relativeOpen = ref(false);
const relation = ref<KinRelation>("relative");

function reset() {
  other.value = null;
  choice.value = null;
  showMore.value = false;
  typeFilter.value = "";
  note.value = "";
  told.value = "";
  visibleTo.value = [];
  role.value = "Member";
}
watch(() => open, (now) => { if (now) reset(); });

function onPick(picked: NamedRef) {
  other.value = picked;
  choice.value = null;
  showMore.value = false;
  typeFilter.value = "";
}

const choices = computed(() => (other.value ? typeChoices(subject.kind, other.value.kind) : []));
const split = computed(() => splitChoices(choices.value));
const visibleChoices = computed(() => {
  const q = typeFilter.value.trim().toLowerCase();
  const list = showMore.value ? choices.value : split.value.common;
  return q ? list.filter((c) => c.word.toLowerCase().includes(q)) : list;
});
function choiceKey(c: TypeChoice): string {
  return `${c.key}:${c.subjectIsFrom}:${c.home ?? "link"}`;
}

const isPersonPair = computed(
  () => (subject.kind === "npc" || subject.kind === "party_member") && (other.value?.kind === "npc" || other.value?.kind === "party_member"),
);
const subjectPerson = computed(() => (subject.kind === "npc" || subject.kind === "party_member" ? personKey(subject.kind === "npc" ? "npc" : "pc", subject.id) : null));

/** Ties this pair already has in the block: a second type is a second link. */
const alreadyWords = computed(() => {
  const o = other.value;
  if (!o) return [];
  return connections.filter((c) => c.other_kind === o.kind && c.other_id === o.id).map((c) => connectionWord(c, subject.kind));
});

const opposite = computed(() => (other.value && choice.value ? oppositeWord(subject.kind, other.value.kind, choice.value) : ""));

// ── A membership's role ────────────────────────────────────────────────────────
const factionId = computed(() => {
  if (choice.value?.home !== "membership" || !other.value) return "";
  return subject.kind === "faction" ? subject.id : other.value.id;
});
const headed = useFactionHeaded(factionId);
const roleList = computed(() => offeredRoles(headed.value));
const commonRoles = computed(() => COMMON_ROLES.filter((r) => roleList.value.includes(r)));
watch(roleList, (list) => { if (!list.includes(role.value)) role.value = "Member"; });

/** "Moves Brenna's home from Thane's Crossing to Drover's Rest": a one-valued record replaces its old value. */
const replacesLine = computed(() => {
  const c = choice.value;
  const o = other.value;
  if (!c?.single || !c.subjectIsFrom || !c.home || !o) return null;
  const existing = connections.find((x) => x.source === c.home && x.other_id !== o.id);
  if (!existing || c.home === "kin" || c.home === "quest") return null;
  return `Moves ${subjectName}’s ${HOME_LABEL[c.home]} from ${existing.other_name} to ${o.name}.`;
});

const canAdd = computed(() => other.value !== null && choice.value !== null && !create.isPending.value);

async function add() {
  const o = other.value;
  const c = choice.value;
  if (!o || !c) return;
  if (c.home === "kin") {
    relation.value = kinRelationFor(c);
    relativeOpen.value = true;
    emit("close");
    return;
  }
  try {
    await create.mutateAsync({
      subject,
      other: o,
      choice: c,
      ...(c.home === "membership" ? { role: role.value } : {}),
      ...(!c.home && note.value.trim() !== "" ? { note: note.value.trim() } : {}),
      ...(!c.home && told.value.trim() !== "" ? { told: told.value.trim() } : {}),
      ...(!c.home && visibleTo.value.length > 0 ? { playerVisibleTo: visibleTo.value } : {}),
    });
    emit("close");
  } catch (e) {
    toast.error(toast.fromError(e, "Could not add the connection. Please try again."));
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply mb-1 block text-label-lg font-semibold text-muted-foreground;
}
</style>
