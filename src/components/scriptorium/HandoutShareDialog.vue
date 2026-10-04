<template>
  <AppModal :open="open" size="md" panel-class="sm:max-h-[85vh]" @close="emit('close')">
    <ModalHeader
      title="Give to players"
      :subtitle="handout.title"
      :icon="IconShare"
      tone="primary"
      closeable
      @close="emit('close')"
    />

    <!-- Step 1: who. Skipped when the audience control already chose. -->
    <div v-if="step === 'pick'" class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
      <p v-if="!party.length" class="text-body text-muted-foreground">
        This campaign has no party members yet.
      </p>
      <template v-else>
        <div class="flex items-center justify-between gap-2">
          <p class="text-eyebrow text-muted-foreground">WHO RECEIVES IT</p>
          <AppButton variant="link" size="sm" :label="allPicked ? 'Clear all' : 'Whole party'" @click="toggleAll" />
        </div>
        <ul class="space-y-1">
          <li v-for="m in party" :key="m.id">
            <AppCheckbox
              v-model="recipients"
              :value="m.id"
              :label="m.name"
              :hint="m.player_name ?? undefined"
              label-role="body"
              class="w-full rounded-md px-2 py-2.5 hover:bg-muted/50"
            />
          </li>
        </ul>
      </template>
    </div>

    <!-- Step 2: what it does, from the dry run. -->
    <div v-else class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <LoadingSpinner v-if="preview.isPending.value" message="Checking what it reveals…" />
      <p v-else-if="preview.error.value" class="text-body text-destructive" role="alert">
        {{ shareErrorMessage(preview.error.value) }}
      </p>
      <template v-else-if="summary">
        <section>
          <h3 class="text-eyebrow text-muted-foreground">WHO RECEIVES IT</h3>
          <p class="mt-1 text-body text-foreground">{{ recipientsText }}</p>
          <p v-if="removedText" class="mt-1 text-caption text-muted-foreground">
            No longer have it: {{ removedText }}.
          </p>
        </section>

        <section>
          <h3 class="text-eyebrow text-muted-foreground">WHAT IT REVEALS</h3>
          <ul v-if="revealedLines.length" class="mt-1.5 divide-y divide-border rounded-lg border border-border">
            <li v-for="line in revealedLines" :key="line.key" class="px-3 py-2 text-body">
              <span class="font-semibold text-foreground">{{ line.name }}</span>
              <span class="text-muted-foreground">: {{ line.detail }}</span>
            </li>
          </ul>
          <p v-else class="mt-1 text-body text-muted-foreground">
            Nothing linked in this handout needs revealing.
          </p>
        </section>

        <section v-if="withheldLines.length">
          <h3 class="text-eyebrow text-muted-foreground">PLAYERS WILL NOT SEE</h3>
          <ul class="mt-1.5 space-y-1">
            <li v-for="line in withheldLines" :key="line.key" class="text-body text-muted-foreground">
              <span class="text-foreground">{{ line.name }}</span>: {{ line.detail }}
            </li>
          </ul>
        </section>

        <p v-if="!hasChange" class="text-body text-muted-foreground">Nothing would change.</p>
      </template>
      <p v-if="submitError" class="text-body text-destructive" role="alert">{{ submitError }}</p>
    </div>

    <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton
        v-if="step === 'confirm' && cameFromPick"
        variant="ghost"
        size="md"
        label="Back"
        class="mr-auto"
        @click="step = 'pick'"
      />
      <AppButton variant="subtle" size="md" label="Cancel" @click="emit('close')" />
      <template v-if="step === 'pick'">
        <AppButton
          v-if="!recipients.length && handout.player_visible_to.length"
          variant="destructive"
          size="md"
          label="Take it back"
          @click="takeBackAll"
        />
        <AppButton
          v-else
          variant="primary"
          size="md"
          label="Review"
          :disabled="!recipients.length"
          @click="step = 'confirm'"
        />
      </template>
      <AppButton
        v-else
        variant="primary"
        size="md"
        :icon="IconShare"
        :label="isSharing ? 'Sharing…' : confirmLabel"
        :disabled="!summary || !hasChange || isSharing"
        @click="submit"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The one share flow for a Scriptorium handout (#970), used by the desktop
 * audience control, the phone's "Give to players" button and the pending-reveal
 * banner. Two steps: pick the recipients (skipped when the caller already
 * chose), then a confirmation built from the `share_handout` dry run, so the
 * DM reads what players will gain before anything is written.
 */
import { computed, ref, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppModal from "@/components/common/AppModal.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
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
  describeRecipients,
  describeRevealed,
  describeWithheld,
} from "@/lib/scriptorium/handoutShareSummary";

const { open, handout, proposed = null, initialRecipients = null } = defineProps<{
  open: boolean;
  handout: ShareableHandout;
  /** Recipients the caller already chose; null opens on the picker. */
  proposed?: string[] | null;
  /** Who the picker starts with when nobody has the handout yet (the quest
   *  cockpit starts on the whole party). Ignored once it has recipients. */
  initialRecipients?: string[] | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const toast = useToast();
const { share, takeBack, isSharing } = useHandoutSharing();

const step = ref<"pick" | "confirm">("pick");
const cameFromPick = ref(false);
const recipients = ref<string[]>([]);
const submitError = ref("");

// Re-seeded on every open so a cancelled dialog never leaves a stale choice.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    submitError.value = "";
    const existing = handout.player_visible_to;
    recipients.value = [...(proposed ?? (existing.length ? existing : (initialRecipients ?? [])))];
    cameFromPick.value = proposed === null;
    step.value = proposed === null ? "pick" : "confirm";
  },
  { immediate: true },
);

const allPicked = computed(
  () => party.value.length > 0 && recipients.value.length === party.value.length,
);
function toggleAll() {
  recipients.value = allPicked.value ? [] : party.value.map((m) => m.id);
}

const preview = useQuery({
  queryKey: computed(
    () => ["scriptorium", handout.id, "share-preview", [...recipients.value].sort().join(",")] as const,
  ),
  queryFn: () => previewHandoutShare(handout.id, recipients.value),
  enabled: () => open && step.value === "confirm" && recipients.value.length > 0,
  gcTime: 0,
  staleTime: 0,
});
const summary = computed(() => preview.data.value ?? null);

const nameOf = (id: string) => party.value.find((m) => m.id === id)?.name ?? "A player";
const recipientsText = computed(() =>
  describeRecipients(recipients.value.map(nameOf), party.value.length),
);
const removedText = computed(() => {
  const removed = summary.value?.removed ?? [];
  return removed.length ? removed.map(nameOf).join(", ") : "";
});
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
// Re-opened from the banner the audience is unchanged: the act is revealing.
const confirmLabel = computed(() =>
  summary.value && summary.value.added.length === 0 && summary.value.removed.length === 0
    ? "Reveal"
    : "Share with players",
);

async function submit() {
  submitError.value = "";
  try {
    const result = await share(handout.id, recipients.value);
    toast.success(
      result.added.length
        ? `Shared with ${result.added.length} player${result.added.length === 1 ? "" : "s"}.`
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
