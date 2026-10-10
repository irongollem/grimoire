<template>
  <!-- Desktop: the shared audience control; a change opens the confirmation. -->
  <div v-if="form === 'toolbar'" class="flex flex-wrap items-center gap-2">
    <AudienceRevealControl
      v-if="canShare"
      :key="resetKey"
      :visible-to="handout.player_visible_to"
      name="handout"
      @change="onAudienceChange"
    />
    <template v-else>
      <AppButton variant="subtle" size="md" :icon="IconHide" label="Share with players" disabled />
      <span class="text-caption text-muted-foreground">
        <template v-if="!handout.campaign_id">
          Only a campaign's documents can be shared.
          <AppButton
            v-if="activeCampaignName"
            variant="link"
            size="sm"
            :label="`Move it into ${activeCampaignName}`"
            @click="emit('moveToCampaign')"
          />
        </template>
        <template v-else>Switch to this document's campaign to share it.</template>
      </span>
    </template>
  </div>

  <!-- Phone: one button, then the picker inside the dialog. -->
  <AppButton
    v-else
    variant="primary"
    size="md"
    :icon="IconShare"
    label="Give to players"
    :disabled="!canShare"
    :title="canShare ? undefined : unavailableHint"
    @click="openPicker"
  />

  <HandoutShareDialog :open="dialogOpen" :handout="handout" :proposed="proposed" :initial-recipients="initialRecipients" @close="closeDialog" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/controls/AppButton.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import HandoutShareDialog from "@/components/scriptorium/HandoutShareDialog.vue";
import { useHandoutSharing, type ShareableHandout } from "@/composables/scriptorium/useHandoutShare";
import { useCampaignStore } from "@/stores/campaign";
import { IconHide, IconShare } from "@/lib/icons";

const { handout, form, activeCampaignName = null, initialRecipients = null, prepare = null } = defineProps<{
  handout: ShareableHandout;
  /** `toolbar` is the desktop editor's audience control; `phone` is the reader's button. */
  form: "toolbar" | "phone";
  /** Offered as the destination when the document has no campaign yet. */
  activeCampaignName?: string | null;
  /** Passed to the dialog: who the picker starts with while nobody has the handout. */
  initialRecipients?: string[] | null;
  /** Run before a share opens its confirmation; false cancels. The editor saves
   *  here, because share_handout reads the STORED body: an unsaved reveal
   *  toggle or newly linked entry would otherwise be silently ignored. */
  prepare?: (() => Promise<boolean>) | null;
}>();

const emit = defineEmits<{ moveToCampaign: [] }>();

const { activeCampaignId } = storeToRefs(useCampaignStore());
const { takeBack } = useHandoutSharing();

// The audience is the active campaign's party, so only that campaign's own
// documents can be shared from here.
const canShare = computed(
  () => !!handout.campaign_id && handout.campaign_id === activeCampaignId.value,
);
const unavailableHint = computed(() =>
  handout.campaign_id
    ? "Switch to this document's campaign to share it."
    : "Move this document into a campaign (on a larger screen) to share it.",
);

const dialogOpen = ref(false);
const proposed = ref<string[] | null>(null);
// Bumped when a choice is abandoned so the audience control drops its optimistic tick.
const resetKey = ref(0);

async function onAudienceChange(next: string[]) {
  if (next.length === 0) {
    if (handout.player_visible_to.length === 0) return;
    // takeBack confirms, toasts its own error and never throws.
    await takeBack(handout.id);
    resetKey.value++;
    return;
  }
  if (prepare && !(await prepare())) {
    resetKey.value++;
    return;
  }
  proposed.value = next;
  dialogOpen.value = true;
  // Close the picker's own popover behind the dialog: left open it floats,
  // unblurred, above the dialog's backdrop. The dialog lists the choice.
  resetKey.value++;
}

function openPicker() {
  proposed.value = null;
  dialogOpen.value = true;
}

function closeDialog() {
  dialogOpen.value = false;
  resetKey.value++;
}
</script>
