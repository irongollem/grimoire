<template>
  <form class="flex flex-col gap-3" @submit.prevent="submit">
    <p class="text-label-lg font-semibold text-foreground">Something they learned that you forgot to share</p>

    <div class="flex flex-wrap gap-1.5" role="group" aria-label="What kind of thing">
      <AppButton
        v-for="k in KINDS"
        :key="k.kind"
        type="button"
        variant="subtle"
        size="sm"
        :active="kind === k.kind"
        :label="k.label"
        @click="chooseKind(k.kind)"
      />
    </div>

    <EntityCombobox v-model="entityId" :options="options" :placeholder="`Find ${KIND_NOUN[kind]}…`" />

    <fieldset class="flex flex-col gap-1.5">
      <legend class="text-caption text-muted-foreground">Who learned it</legend>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <AppCheckbox v-for="m in party" :key="m.id" v-model="memberIds" :value="m.id" :label="m.name" />
      </div>
    </fieldset>

    <div class="flex items-center gap-2">
      <AppButton
        type="submit"
        variant="primary"
        size="sm"
        :disabled="!entityId || memberIds.length === 0"
        :loading="busy"
        :label="`Share and file under ${sessionName}`"
      />
      <AppButton type="button" variant="ghost" size="sm" label="Cancel" @click="emit('done')" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useShareCandidates, type ShareKind } from "@/composables/sessions/useShareCandidates";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useFileShared } from "@/composables/sessions/useSessionLearned";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";

/**
 * The correction for something the DM told the table and never shared in the
 * app (#985): share it now, through the same write the entity's own Share
 * control makes, then file the reveal rows that write created under this
 * session. Quests are deliberately not offered: a quest is begun on its own
 * surface (the quest runner), which stamps the session itself.
 */
const { sessionId } = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ done: [] }>();

const KINDS: readonly { kind: ShareKind; label: string }[] = [
  { kind: "person", label: "A person" },
  { kind: "place", label: "A place" },
  { kind: "handout", label: "A handout" },
  { kind: "creature", label: "A creature" },
];
const KIND_NOUN: Record<ShareKind, string> = {
  person: "a person",
  place: "a place",
  handout: "a handout",
  creature: "a creature",
};

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const { data: log } = useCampaignSessions();
const sessionName = computed(() => {
  const found = (log.value ?? []).find((s) => s.id === sessionId);
  return found ? sessionShortLabel(found) : "this session";
});

const kind = ref<ShareKind>("person");
const entityId = ref("");
// The whole party by default; the DM unticks who was not there.
const memberIds = ref<string[]>(party.value.map((m) => m.id));
watch(party, (next) => {
  if (memberIds.value.length === 0) memberIds.value = next.map((m) => m.id);
});

const { options, share } = useShareCandidates(kind);
const filing = useFileShared();
const toast = useToast();
const busy = ref(false);

function chooseKind(next: ShareKind) {
  kind.value = next;
  entityId.value = "";
}

async function submit() {
  if (!entityId.value || memberIds.value.length === 0) return;
  busy.value = true;
  try {
    const filed = await share(entityId.value, memberIds.value);
    await filing.mutateAsync({ ...filed, sessionId });
    toast.success(`Shared and filed under ${sessionName.value}.`);
    emit("done");
  } catch (e) {
    toast.error(toast.fromError(e, "Could not share that."));
  } finally {
    busy.value = false;
  }
}
</script>
