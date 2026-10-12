<template>
  <!--
    One form for adding a line and for editing one (#1019). Adding keeps the
    kind, people, session and visibility after a save and clears only the body,
    because a DM logs several lines of one scene in a row at the table.
  -->
  <form class="space-y-2" data-testid="npc-memory-form" @submit.prevent="submit">
    <SegmentedControl v-model="kind" :options="KIND_OPTIONS" size="sm" wrap aria-label="Kind of memory" />
    <AppInput
      v-model="body"
      maxlength="1000"
      :placeholder="NPC_MEMORY_KIND_HINTS[kind]"
      aria-label="What was said or done"
      data-testid="npc-memory-body"
      @keydown.enter.prevent="submit"
    />

    <div v-if="members.length" class="flex flex-wrap items-center gap-1.5">
      <span class="text-caption text-muted-foreground">Who was there</span>
      <AppButton
        v-for="m in members"
        :key="m.id"
        variant="chip"
        size="xs"
        type="button"
        :active="present.includes(m.id)"
        :aria-pressed="present.includes(m.id)"
        :label="m.name"
        @click="togglePresent(m.id)"
      />
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <AppCheckbox v-model="sharedModel" size="sm" label="Players see this" />
      <LearnedSessionSelect v-model="sessionModel" aria-label="Session this belongs to" />
      <div class="ml-auto flex items-center gap-2">
        <AppButton v-if="cancellable" variant="ghost" size="sm" type="button" label="Cancel" @click="emit('cancel')" />
        <AppButton
          variant="primary"
          size="sm"
          type="submit"
          :label="submitLabel"
          :loading="saving"
          :disabled="!canSubmit"
        />
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import LearnedSessionSelect from "@/components/sessions/LearnedSessionSelect.vue";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { defaultMemorySessionId, NPC_MEMORY_KIND_HINTS, NPC_MEMORY_KIND_LABELS } from "@/lib/npcs/npcMemories";
import { NPC_MEMORY_KINDS, type NpcMemory, type NpcMemoryKind } from "@/types/npcMemory.types";

/** What the form hands back; the host turns it into an insert or a patch. */
export interface NpcMemoryDraft {
  kind: NpcMemoryKind;
  body: string;
  session_id: string | null;
  party_member_ids: string[];
  player_visible_to: string[];
}

const {
  members,
  initial = null,
  submitLabel = "Add",
  cancellable = false,
  save,
} = defineProps<{
  members: readonly { id: string; name: string }[];
  /** A memory being edited; absent when adding. */
  initial?: NpcMemory | null;
  submitLabel?: string;
  cancellable?: boolean;
  /** Resolves true when the save went through; the body then clears on add. */
  save: (draft: NpcMemoryDraft) => Promise<boolean>;
}>();
const emit = defineEmits<{ cancel: [] }>();

const KIND_OPTIONS = NPC_MEMORY_KINDS.map((value) => ({ value, label: NPC_MEMORY_KIND_LABELS[value] }));

const kind = ref<NpcMemoryKind>(initial?.kind ?? "revealed");
const body = ref(initial?.body ?? "");
const present = ref<string[]>(initial ? [...initial.party_member_ids] : []);
const shared = ref(initial ? initial.player_visible_to.length > 0 : false);
const saving = ref(false);
// An edit keeps the line's exact audience until the DM changes who was there or
// the share box: a line shared with some of the party (over MCP, say) must not
// widen to everyone because its typo was fixed.
const audienceTouched = ref(false);

// undefined = the DM has not chosen, so the default may still follow the running session.
const picked = ref<string | null | undefined>(initial ? initial.session_id : undefined);
const { session, isRunning } = useCampaignSession();
const { data: log } = useCampaignSessions();
const running = computed(() => (isRunning.value ? session.value : null));
const sessionModel = computed<string | null>({
  get: () => {
    if (picked.value !== undefined) return picked.value;
    // Until the log arrives only the running session is known.
    if (!log.value) return running.value ? running.value.id : null;
    return defaultMemorySessionId(running.value, log.value);
  },
  set: (id) => (picked.value = id),
});
const sharedModel = computed({
  get: () => shared.value,
  set: (value: boolean) => {
    shared.value = value;
    audienceTouched.value = true;
  },
});

const canSubmit = computed(() => body.value.trim().length > 0 && !saving.value);

function togglePresent(id: string) {
  audienceTouched.value = true;
  present.value = present.value.includes(id) ? present.value.filter((p) => p !== id) : [...present.value, id];
}

/** Marked-present members only, or the whole party when nobody is marked. */
function audienceFor(): string[] {
  if (initial && !audienceTouched.value) return initial.player_visible_to;
  if (!shared.value) return [];
  return present.value.length ? present.value : members.map((m) => m.id);
}

async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    const ok = await save({
      kind: kind.value,
      body: body.value.trim(),
      session_id: sessionModel.value,
      party_member_ids: present.value,
      player_visible_to: audienceFor(),
    });
    if (ok && !initial) body.value = "";
  } finally {
    saving.value = false;
  }
}
</script>
