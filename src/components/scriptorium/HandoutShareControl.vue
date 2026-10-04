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

  <HandoutShareDialog :open="dialogOpen" :handout="handout" :proposed="proposed" @close="closeDialog" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import HandoutShareDialog from "@/components/scriptorium/HandoutShareDialog.vue";
import {
  shareErrorMessage,
  useHandoutSharing,
  type ShareableHandout,
} from "@/composables/scriptorium/useHandoutShare";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { IconHide, IconShare } from "@/lib/icons";

const { handout, form, activeCampaignName = null } = defineProps<{
  handout: ShareableHandout;
  /** `toolbar` is the desktop editor's audience control; `phone` is the reader's button. */
  form: "toolbar" | "phone";
  /** Offered as the destination when the document has no campaign yet. */
  activeCampaignName?: string | null;
}>();

const emit = defineEmits<{ moveToCampaign: [] }>();

const { activeCampaignId } = storeToRefs(useCampaignStore());
const { takeBack } = useHandoutSharing();
const toast = useToast();

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
    try {
      await takeBack(handout.id);
    } catch (e) {
      toast.error(shareErrorMessage(e));
    }
    resetKey.value++;
    return;
  }
  proposed.value = next;
  dialogOpen.value = true;
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
