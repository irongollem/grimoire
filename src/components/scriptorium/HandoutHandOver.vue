<template>
  <div class="grid min-h-0 flex-1 overflow-y-auto overscroll-contain md:grid-cols-2">
    <section class="flex flex-col gap-1 border-b border-border px-5 py-4 md:border-r md:border-b-0">
      <p v-if="!party.length" class="text-body text-muted-foreground">This campaign has no party members yet.</p>
      <template v-else>
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="text-eyebrow text-muted-foreground">WHO GETS IT</h3>
          <AppButton variant="link" size="sm" :label="allPicked ? 'Clear all' : 'Whole party'" @click="toggleAll" />
        </div>
        <ul>
          <li v-for="m in party" :key="m.id" class="border-b border-border/60 last:border-b-0">
            <AppCheckbox
              v-model="recipients"
              :value="m.id"
              :label="m.name"
              :hint="m.player_name ?? undefined"
              label-role="body"
              class="min-h-11 w-full px-1.5 py-2"
            />
          </li>
        </ul>
      </template>
    </section>

    <section class="flex flex-col gap-4 px-5 py-4" :class="{ 'opacity-60': preview.isPlaceholderData.value }">
      <p v-if="!recipients.length" class="text-body text-muted-foreground">
        Tick who gets it to see what it also reveals.
      </p>
      <LoadingSpinner v-else-if="preview.isPending.value" message="Checking what it reveals…" />
      <p v-else-if="preview.error.value" class="text-body text-destructive" role="alert">
        {{ shareErrorMessage(preview.error.value) }}
      </p>
      <template v-else-if="summary">
        <div class="flex flex-col gap-1.5">
          <h3 class="text-eyebrow text-muted-foreground">GIVING IT ALSO REVEALS</h3>
          <ul v-if="revealedLines.length" class="divide-y divide-border rounded-md border border-border">
            <li v-for="line in revealedLines" :key="line.key" class="px-3 py-2 text-body">
              <span class="font-semibold text-foreground">{{ line.name }}</span>
              <span class="text-muted-foreground">: {{ line.detail }}</span>
            </li>
          </ul>
          <p v-else class="text-body text-muted-foreground">Nothing linked in this handout needs revealing.</p>
        </div>

        <div v-if="withheldLines.length" class="flex flex-col gap-1.5">
          <h3 class="text-eyebrow text-muted-foreground">THEY WILL NOT SEE</h3>
          <ul class="space-y-1">
            <li v-for="line in withheldLines" :key="line.key" class="text-body text-muted-foreground">
              <span class="text-foreground">{{ line.name }}</span>: {{ line.detail }}
            </li>
          </ul>
        </div>

        <p class="text-body text-muted-foreground">
          It arrives in their journal straight away, with an unread mark. Taking it back later removes the handout,
          never what it revealed.
        </p>
      </template>
      <p v-if="submitError" class="text-body text-destructive" role="alert">{{ submitError }}</p>
    </section>
  </div>

  <div class="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
    <p class="min-w-0 flex-1 basis-60 text-caption text-muted-foreground">{{ footerNote }}</p>
    <AppButton variant="subtle" size="md" label="Cancel" @click="emit('close')" />
    <AppButton
      v-if="takingBack"
      variant="destructive"
      size="md"
      label="Take it back"
      @click="takeBackAll"
    />
    <AppButton
      v-else
      variant="primary"
      size="md"
      :icon="IconShare"
      :label="isSharing ? 'Giving…' : confirmLabel"
      :disabled="!canSubmit || isSharing"
      @click="submit"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * "Hand it over", the first half of the Give dialog (#1115, frame 11): the
 * party's checkboxes on one side and, live from the `share_handout` dry run as
 * the ticks change, what giving it reveals and what the players will not see on
 * the other. Nothing is written until Give it.
 *
 * Renders a body and a footer as siblings: the dialog gives it its column.
 */
import { computed, ref } from "vue";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import {
  shareErrorMessage,
  useHandoutSharing,
  type ShareableHandout,
} from "@/composables/scriptorium/useHandoutShare";
import { previewHandoutShare } from "@/composables/scriptorium/useScriptorium";
import { IconShare } from "@/lib/icons";
import {
  describeAudienceChange,
  describeRevealed,
  describeWithheld,
} from "@/lib/scriptorium/handoutShareSummary";

const { handout, initialRecipients = null } = defineProps<{
  handout: ShareableHandout;
  /** Who the ticks start on while nobody has the handout (the quest cockpit starts on the whole party). */
  initialRecipients?: string[] | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const toast = useToast();
const { share, takeBack, isSharing } = useHandoutSharing();

// Seeded once: the dialog mounts this fresh on every open, so a cancelled dialog never leaves a stale choice.
const existing = handout.player_visible_to;
const recipients = ref<string[]>([...(existing.length ? existing : (initialRecipients ?? []))]);
const submitError = ref("");

const allPicked = computed(() => party.value.length > 0 && recipients.value.length === party.value.length);
function toggleAll() {
  recipients.value = allPicked.value ? [] : party.value.map((m) => m.id);
}

const preview = useQuery({
  queryKey: computed(
    () => ["scriptorium", handout.id, "share-preview", [...recipients.value].sort().join(",")] as const,
  ),
  queryFn: () => previewHandoutShare(handout.id, recipients.value),
  enabled: () => recipients.value.length > 0,
  // The right side keeps the last answer (dimmed) while a tick's dry run is on its way.
  placeholderData: keepPreviousData,
  gcTime: 0,
  staleTime: 0,
});
const summary = computed(() => (recipients.value.length ? (preview.data.value ?? null) : null));

const nameOf = (id: string) => party.value.find((m) => m.id === id)?.name ?? "A player";
const revealedLines = computed(() =>
  (summary.value?.revealed ?? []).map((r) => ({ key: `${r.type}:${r.id}`, ...describeRevealed(r) })),
);
const withheldLines = computed(() =>
  (summary.value?.withheld ?? []).map((w) => ({ key: `${w.type}:${w.id}`, ...describeWithheld(w) })),
);
const hasChange = computed(() => {
  const s = summary.value;
  return !!s && (s.added.length > 0 || s.removed.length > 0 || s.revealed.length > 0);
});

// With the holders unchanged the act is revealing what the links still hide.
const confirmLabel = computed(() =>
  summary.value && summary.value.added.length === 0 && summary.value.removed.length === 0 ? "Reveal" : "Give it",
);

// Nobody ticked on a handout somebody holds: the only act left is taking it back.
const takingBack = computed(() => recipients.value.length === 0 && handout.player_visible_to.length > 0);
const canSubmit = computed(() => recipients.value.length > 0 && !preview.isPlaceholderData.value && hasChange.value);

const footerNote = computed(() => {
  if (takingBack.value) return "Taking it back removes it from everyone's journal.";
  const s = summary.value;
  if (!s) return "";
  if (!hasChange.value) return "Nothing would change.";
  const kept = recipients.value.filter((id) => handout.player_visible_to.includes(id));
  return describeAudienceChange({
    added: s.added.map(nameOf),
    kept: kept.map(nameOf),
    removed: s.removed.map(nameOf),
  });
});

async function submit() {
  submitError.value = "";
  try {
    const result = await share(handout.id, recipients.value);
    toast.success(
      result.added.length
        ? `Given to ${result.added.length} player${result.added.length === 1 ? "" : "s"}.`
        : "Handout updated.",
    );
    emit("close");
  } catch (e) {
    submitError.value = shareErrorMessage(e);
  }
}

async function takeBackAll() {
  if (await takeBack(handout.id)) emit("close");
}
</script>
