<template>
  <AppModal
    :open="current !== null && !suppressed && writing === null"
    size="full"
    panel-class="h-full rounded-none border-0"
    :backdrop-dismiss="false"
    :label="current ? `${current.character_name} has fallen` : 'A death in the party'"
    @close="later"
  >
    <div v-if="current" class="tolling" :style="darkStyle" data-testid="tolling">
      <div class="tolling-stage">
        <MemorialCandle :lit="true" phase="a" class="tolling-candle" />
        <MemorialCameo
          kind="fallen"
          :name="current.character_name"
          :portrait-url="current.portrait_url"
          :focal-point="current.portrait_focal_point"
          :scale="1.15"
        />
        <MemorialCandle :lit="true" phase="b" class="tolling-candle" />
      </div>
      <span class="tolling-eyebrow">In memoriam</span>
      <h1 class="tolling-title font-cinzel">{{ current.character_name }} has fallen</h1>
      <p v-if="current.game_date" class="tolling-date" data-testid="tolling-date">
        <span class="tolling-dagger">&dagger;</span>{{ current.game_date }}
      </p>
      <span class="tolling-rule" aria-hidden="true" />
      <RichTextViewer v-if="account" :content="account" class="tolling-account" data-testid="tolling-account" />
      <div class="tolling-actions">
        <AppButton variant="ghost" size="lg" label="Later" data-testid="tolling-later" @click="later" />
        <AppButton
          v-if="isOwner"
          variant="primary"
          size="lg"
          :icon="IconEdit"
          label="Write their last words"
          data-testid="tolling-write"
          @click="writeWords"
        />
        <AppButton
          v-else
          variant="primary"
          size="lg"
          label="Light a candle"
          :loading="light.isPending.value"
          data-testid="tolling-candle"
          @click="lightCandle"
        />
      </div>
    </div>
  </AppModal>

  <MemorialWordsDialog v-if="wordsMounted" :memorial="writing" @close="doneWriting" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import MemorialCameo from "@/components/memorials/MemorialCameo.vue";
import MemorialCandle from "@/components/memorials/MemorialCandle.vue";
import { useCampaignMemorials, useLightCandle, useMarkTolled, useMyMournerRows } from "@/composables/memorials/useMemorials";
import { useLazyMount } from "@/composables/useLazyMount";
import { useToast } from "@/composables/useToast";
import { IconEdit } from "@/lib/icons";
import { pendingTolls } from "@/lib/memorials/wall";
import { writtenOrNull } from "@/lib/memorials/writing";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { CharacterMemorial } from "@/types/memorial.types";
import { useTheme } from "@/composables/useTheme";
import { darkTwinStyle } from "@/lib/themeRuntime";

/**
 * The death notice (Hall of the Fallen, #982, frame 11): the next time a player opens the
 * portal after the DM marks a character fallen, one dark full-screen moment, once per person.
 * The owner is offered their character's last words; everyone else a candle. "Later" (or
 * Escape) also counts as seen: the card's own back keeps both invitations open.
 *
 * `suppressed` is the live encounter: combat is never interrupted. The flame stops
 * flickering under reduced motion inside `MemorialCandle`; nothing here animates itself.
 */
defineProps<{ suppressed: boolean }>();

// The notice is a vigil like the wall: always the dark twin, so its controls read on dark.
const { activeThemeId } = useTheme();
const darkStyle = computed(() => darkTwinStyle(activeThemeId.value));
const auth = useAuthStore();
const campaign = useCampaignStore();
const toast = useToast();
const { data: memorials } = useCampaignMemorials();
const { data: mine } = useMyMournerRows();
const light = useLightCandle();
const tolled = useMarkTolled();

/** Seen this visit, so the notice does not return between the click and the refetch. */
const handled = reactive(new Set<string>());
const writing = ref<CharacterMemorial | null>(null);

// The words dialog holds the rich text editor. This notice is mounted by the player
// layout on every portal page, so a static import put the whole editor (tiptap, about
// 140 kB gzip) on every player's first load for a dialog only an owner ever opens (#999).
const MemorialWordsDialog = defineAsyncComponent(() => import("@/components/memorials/MemorialWordsDialog.vue"));
const wordsMounted = useLazyMount(computed(() => writing.value !== null));

const current = computed<CharacterMemorial | null>(() => {
  const cid = campaign.activeCampaignId;
  if (!cid || !memorials.value || !mine.value) return null;
  const next = pendingTolls(memorials.value, mine.value, cid).filter((m) => !handled.has(m.id));
  return next.length > 0 ? next[0] : null;
});

const isOwner = computed(() => current.value !== null && current.value.owner_user_id !== null && current.value.owner_user_id === auth.user?.id);

const account = computed(() => writtenOrNull(current.value ? current.value.account : null));

/** Records that this viewer has seen the notice, and hides it for the rest of the visit at once. */
function markTolled(m: CharacterMemorial) {
  handled.add(m.id);
  tolled.mutate(
    { memorialId: m.id, campaignId: m.campaign_id },
    { onError: (e) => toast.error(toast.fromError(e, "Could not record that you saw this.")) },
  );
}

/** "Later": the notice is seen; the candle and the words can wait for the wall. */
function later() {
  if (current.value) markTolled(current.value);
}

/** Lights this viewer's candle for the fallen, then lets the notice go. */
function lightCandle() {
  const m = current.value;
  if (!m) return;
  light.mutate(
    { memorialId: m.id, campaignId: m.campaign_id },
    {
      onSuccess: () => markTolled(m),
      onError: (e) => toast.error(toast.fromError(e, "Could not light the candle.")),
    },
  );
}

/** Opens the last-words dialog for the owner. */
function writeWords() {
  writing.value = current.value;
}

/** The words dialog closed: the notice has done its job, saved or not. */
function doneWriting() {
  const m = writing.value;
  writing.value = null;
  if (m) markTolled(m);
}
</script>

<style scoped>
.tolling {
  overflow-y: auto;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 2rem 1rem;
  text-align: center;
  color: #eadfca;
  background: radial-gradient(ellipse 60% 26rem at 50% 0%, rgb(212 166 70 / 0.16), transparent 75%), #1c1612;
}
.tolling-stage {
  display: flex;
  align-items: flex-end;
  gap: 2rem;
}
.tolling-candle {
  --candle-h: 4.4rem;
  margin-bottom: 1.25rem;
}
.tolling-eyebrow {
  margin-top: 0.625rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: #d4a646;
}
.tolling-title {
  margin: 0;
  max-width: 40rem;
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #f1e7d2;
}
.tolling-date {
  margin: 0;
  font-size: 1.1875rem;
  color: #cbbda3;
}
.tolling-dagger {
  margin-right: 0.375rem;
  font-weight: 700;
  color: #c4553f;
}
.tolling-rule {
  width: 16rem;
  height: 1px;
  background: #8f6a1c;
}
.tolling-account {
  max-width: 40rem;
  font-size: 1.125rem;
  font-style: italic;
  line-height: 1.55;
  color: #e2d6bf;
}
.tolling-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.875rem;
}
</style>
