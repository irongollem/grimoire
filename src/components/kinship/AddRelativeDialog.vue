<template>
  <AppModal :open="open" size="md" align="sheet" @close="emit('close')">
    <ModalHeader title="Add a relative" :subtitle="`Adding a ${OTHER_NOUNS[relation]}`" :icon="IconAddUser" tone="primary" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <div>
        <span class="field-label">{{ subjectName }} is the…</span>
        <SegmentedControl v-model="relation" :options="RELATION_OPTIONS" size="sm" wrap aria-label="Relation" />
      </div>

      <AddRelativeWho
        v-model="other"
        :options="whoOptions"
        :draft-label="draftLabel"
        :creating="creating"
        @create="createNpc"
        @draft="draftWithAi"
      />

      <div v-if="otherName" class="space-y-2">
        <AppCheckbox v-if="spouse && relation === 'parent'" v-model="alsoSpouse" :label="`Also ${spouse.name}’s child`" />
        <p v-if="secondRefusal && spouse" class="text-caption italic text-muted-foreground" data-testid="second-parent-refusal">
          {{ spouse.name }} will not be added as a parent: {{ secondRefusal }}.
        </p>
        <div v-if="isParentLink">
          <span class="field-label">Which parent is {{ relation === "parent" ? subjectName : otherName }}?</span>
          <SegmentedControl v-model="role" :options="ROLE_OPTIONS" size="sm" aria-label="Parent role" />
        </div>
        <AppCheckbox v-if="isParentLink" v-model="adoptive" label="Adoptive" />
      </div>

      <div v-if="otherName">
        <label class="field-label" :for="noteId">Note <span class="font-normal normal-case italic text-muted-foreground">optional</span></label>
        <AppInput :id="noteId" v-model="note" tone="card" size="body" block placeholder="e.g. born the winter the river froze" />
      </div>

      <AddRelativeVerdict
        v-if="shownVerdict"
        :verdict="shownVerdict"
        :subject="subject"
        :relation="relation"
        :subject-name="subjectName"
        :other-name="otherName"
        :shared-names="sharedNames"
        @swap="relation = flipRelation(relation)"
        @keep="datesAcknowledged = true"
        @dismiss="emit('close')"
        @change="save"
      />
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton variant="primary" size="sm" :label="SAVE_LABELS[relation]" :loading="saving" :disabled="!canSave" @click="save" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AddRelativeVerdict from "@/components/kinship/AddRelativeVerdict.vue";
import AddRelativeWho, { type WhoOption } from "@/components/kinship/AddRelativeWho.vue";
import {
  OTHER_NOUNS,
  RELATION_OPTIONS,
  SAVE_LABELS,
  checkRelation,
  draftKinFor,
  flipRelation,
  parentRefusal,
  updateFor,
} from "@/components/kinship/addRelative";
import { lifeMeta, type RowPerson } from "@/components/kinship/familyRows";
import { useKinClock } from "@/composables/kinship/useKinClock";
import { useCreateKinLink, useUpdateKinLink } from "@/composables/kinship/useKinLinks";
import { useDmKinGraph } from "@/composables/kinship/useKinGraph";
import { useCreateNpc } from "@/composables/npcs/useNpcs";
import { useToast } from "@/composables/useToast";
import { spousesOf } from "@/lib/kinship/graph";
import { kinInsertFor, personKey } from "@/lib/kinship/keys";
import { isQuotaExceeded } from "@/lib/quotaError";
import { IconAddUser } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import type { KinLink, KinRelation, ParentRole, PersonKey } from "@/types/kinship.types";

/**
 * Add relative (frame 03). The dialog speaks the DM's sentence, "<Subject> is
 * the <relation> of <Who>", and `kinInsertFor` turns it into the one row that
 * stores it, so "Parent of" and "Child of" can never write a link backwards.
 * The DM's graph is always the source: players never write kin.
 */
const { subject, open, initialRelation = "parent" } = defineProps<{
  subject: PersonKey;
  open: boolean;
  initialRelation?: KinRelation;
}>();
const emit = defineEmits<{ close: []; added: [link: KinLink] }>();

const source = useDmKinGraph();
const campaign = useCampaignStore();
const clock = useKinClock();
const router = useRouter();
const toast = useToast();
const createLink = useCreateKinLink();
const updateLink = useUpdateKinLink();
const createNpcMutation = useCreateNpc();
const noteId = useId();

const relation = ref<KinRelation>(initialRelation);
const other = ref<PersonKey | null>(null);
const alsoSpouse = ref(true);
const role = ref<"none" | ParentRole>("none");
const adoptive = ref(false);
const note = ref("");
const datesAcknowledged = ref(false);
const saving = ref(false);
const creating = ref(false);
/** NPCs created from this dialog before the NPC list has refetched them. */
const justCreated = ref<RowPerson[]>([]);

const ROLE_OPTIONS = [
  { value: "none", label: "Parent" },
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
] as const;

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    relation.value = initialRelation;
    other.value = null;
    alsoSpouse.value = true;
    role.value = "none";
    adoptive.value = false;
    note.value = "";
    datesAcknowledged.value = false;
    justCreated.value = [];
  },
  { immediate: true },
);
// A new pairing or relation is a new question: the dates answer no longer applies.
watch([relation, other], () => (datesAcknowledged.value = false));

const people = computed(() => {
  const map = new Map<PersonKey, RowPerson>(source.people.value);
  for (const p of justCreated.value) map.set(p.key, p);
  return map;
});
const nameOf = (key: PersonKey | null) => (key ? (people.value.get(key)?.name ?? "") : "");
const subjectName = computed(() => nameOf(subject) || "They");
const otherName = computed(() => nameOf(other.value));
const isParentLink = computed(() => relation.value === "parent" || relation.value === "child");

const whoOptions = computed<WhoOption[]>(() =>
  [...people.value.values()]
    .filter((p) => p.key !== subject)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      key: p.key,
      name: p.name,
      meta: [...lifeMeta(p, clock.value), ...(p.isPc ? ["PC"] : [])].join(" · ") || "no birth date",
    })),
);

// The subject's one current spouse, when there is exactly one: the likely other parent.
const spouse = computed(() => {
  const current = spousesOf(source.graph.value, subject).filter((s) => !s.former);
  if (current.length !== 1 || current[0].key === other.value) return null;
  const p = people.value.get(current[0].key);
  return p ? { key: current[0].key, name: p.name } : null;
});

const verdict = computed(() => (other.value ? checkRelation(source.graph.value, subject, relation.value, other.value) : null));
const shownVerdict = computed(() => {
  const v = verdict.value;
  if (!v || v.kind === "ok") return null;
  if (v.kind === "dates" && datesAcknowledged.value) return null;
  return v;
});
// The second parent link meets the same checks as the first before it is written.
const secondRefusal = computed(() => {
  const second = spouse.value;
  const target = other.value;
  if (!second || !target || relation.value !== "parent" || !alsoSpouse.value) return null;
  return parentRefusal(checkRelation(source.graph.value, second.key, "parent", target), second.name, otherName.value);
});
const sharedNames = computed(() => {
  const v = verdict.value;
  if (v?.kind !== "implied-sibling") return "";
  const names = v.sharedParents.map(nameOf);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
});

const canSave = computed(() => !!other.value && !saving.value && shownVerdict.value === null);

const draftKin = computed(() => draftKinFor(relation.value));
const draftLabel = computed(() => (draftKin.value && campaign.isAiEnabled ? `Draft a ${draftKin.value} with AI` : null));

function draftWithAi() {
  const kin = draftKin.value;
  if (!kin) return;
  const query: Record<string, string> = { kin, of: subject };
  if (relation.value === "parent" && spouse.value) query.also = spouse.value.key;
  emit("close");
  void router.push({ path: "/npcs", query });
}

async function createNpc(name: string) {
  creating.value = true;
  try {
    const npc = await createNpcMutation.mutateAsync({
      name,
      race: null,
      alignment: null,
      age: null,
      occupation: null,
      appearance: null,
      personality: null,
      backstory: null,
      notes: null,
      status: "alive",
      relationship: "unknown",
      portrait_url: null,
      cutout_url: null,
      disguise_name: null,
      disguise_portrait_url: null,
      is_revealed: false,
      tags: [],
      stat_block: null,
      scriptorium_doc_id: null,
      player_visible_to: [],
      player_visible_fields: [],
    });
    const key = personKey("npc", npc.id);
    justCreated.value = [
      ...justCreated.value,
      { key, name: npc.name, bornYear: null, diedYear: null, dead: false, isPc: false, portraitUrl: null, subtitle: null, to: `/npcs/${npc.id}` },
    ];
    other.value = key;
  } catch (e) {
    toast.error(isQuotaExceeded(e) ? "You have reached your NPC limit on this plan." : toast.fromError(e, "Could not create the NPC."));
  } finally {
    creating.value = false;
  }
}

async function save() {
  const target = other.value;
  if (!target || saving.value) return;
  saving.value = true;
  try {
    const details = {
      parent_role: isParentLink.value && role.value !== "none" ? role.value : null,
      adoptive: isParentLink.value && adoptive.value,
      note: note.value.trim(),
    };
    const row = kinInsertFor(subject, relation.value, target, details);
    const v = verdict.value;
    let link: KinLink;
    if (v?.kind === "existing") {
      // One link per pair: the DB refuses a second (23505), so the old row is rewritten.
      link = await updateLink.mutateAsync({ id: v.link.id, patch: updateFor(row) });
    } else {
      link = await createLink.mutateAsync(row);
      const second = spouse.value;
      if (relation.value === "parent" && alsoSpouse.value && second && secondRefusal.value === null) {
        try {
          await createLink.mutateAsync(kinInsertFor(second.key, "parent", target, { adoptive: adoptive.value }));
        } catch {
          // The first link is saved: say so, rather than a failure that hides it.
          toast.error(`Added ${otherName.value} as ${subjectName.value}’s ${OTHER_NOUNS[relation.value]}. Could not add ${second.name} as the second parent.`);
          emit("added", link);
          emit("close");
          return;
        }
      }
    }
    toast.success(`Added ${otherName.value} as ${subjectName.value}’s ${OTHER_NOUNS[relation.value]}.`);
    emit("added", link);
    emit("close");
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? e.code : null;
    toast.error(code === "23505" ? "They are already linked." : toast.fromError(e, "Could not save the link."));
  } finally {
    saving.value = false;
  }
}
</script>
