<template>
  <!--
    One NPC, in whichever form the situation calls for. Four of them, and the
    branch order is the reading order: the common case first.

    Reading on tablet and up is a modal over the grid — this route is nested
    under `/npcs`, so the grid is mounted right behind it and keeps its scroll
    position and revealed page while a DM checks who someone was. Editing is not
    a glance but a commitment, so it keeps the full page at every width: a form
    with unsaved work has no business inside something that dismisses on a
    backdrop click. Phones keep their full-screen takeover for both.
  -->
  <NpcDetailModal v-if="asModal" :id="id" @close="close" />

  <NpcDetailMobile v-else-if="showMobileRead && npc" :npc="npc" />

  <!-- Mobile edit (<md): NpcDetail renders its own NpcEditMobile layer (app bar
       + stacked cards + save bar), so it needs no PageHeader chrome. -->
  <NpcDetail
    v-else-if="showMobileEdit"
    :key="id"
    :npc="isNewNpc ? null : (npc ?? null)"
  />

  <!-- Desktop edit, and the new-NPC form at every width. -->
  <PageHeader
    v-else-if="showDesktopEdit"
    :title="displayName"
    :description="npc ? subtitle : 'Fill in the details below to add a new NPC to your realm'"
  >
    <!--
      Six controls, reading left to right as the shape of the task: the two
      ways out, the two things you might do to this record, then its state and
      the commit. There were eight, and at ~1100px the row held its single line
      while the page title was squeezed to one letter per line beside it — see
      the wrap note in PageHeader for that half. This half is the thinning:

        View                  → Cancel. It dropped `?edit=true` and landed on the
                                sheet over the grid, which is where Save and
                                Cancel already land; what was missing on desktop
                                was an honest way to leave without saving.
        Scriptorium + Copy…   → one "Send to…" menu. Two destinations, one verb.
        Revealed / Concealed  → the reveal control's own "SEEN AS" section, next
                                to the audience it decides the face for.
    -->
    <template #actions>
      <PageHeaderAction
        label="Cancel"
        variant="ghost"
        :collapse-label-on-mobile="false"
        @click="cancelEdit"
      />

      <!-- Edit-mode actions (only once NpcDetail is mounted) -->
      <template v-if="npcDetail">
        <PageHeaderAction
          v-if="npc?.id"
          label="Delete"
          :icon="IconDelete"
          variant="destructive"
          @click="npcDetail.confirmDelete()"
        />
        <EntitySendMenu
          v-if="npc?.id"
          :sending-to-scriptorium="npcDetail.isSendingToScriptorium"
          @scriptorium="npcDetail.sendToScriptorium()"
          @copy="npcDetail.openCopy()"
        />
        <PageHeaderAction
          v-if="npcDetail.isAiEnabled"
          label="Generate"
          :icon="IconGenerate"
          @click="npcDetail.showGenerateDialog = true"
        />
        <!--
          Draft-bound: this editor owns its Save, so the reveal edits the form
          rather than writing through. All three halves are here — who sees this
          NPC, which face they see, and which fields. The field list used to be a
          separate panel bolted to the top of the form and the face used to be a
          header button of its own, which is how an NPC ended up with four reveal
          UIs and three alter-ego toggles.
        -->
        <AudienceRevealControl
          v-if="npc?.id"
          :name="npcDetail.form.name"
          :visible-to="npcDetail.form.player_visible_to"
          @change="npcDetail.form.player_visible_to = $event"
        >
          <template
            v-if="npcDetail.form.disguise_name || npcDetail.form.disguise_portrait_url"
            #identity
          >
            <NpcAlterEgoControl
              :revealed="npcDetail.form.is_revealed"
              @change="npcDetail.form.is_revealed = $event"
            />
          </template>
          <template #what>
            <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
              THEY ALSO SEE
            </p>
            <RevealedFieldsPanel
              :model-value="npcDetail.form.player_visible_fields"
              :fields="NPC_PLAYER_FIELDS"
              @update:model-value="npcDetail.form.player_visible_fields = $event"
            />
          </template>
        </AudienceRevealControl>
        <!-- form= attribute submits the NpcDetail form from outside it -->
        <PageHeaderAction
          type="submit"
          form="npc-detail-form"
          :disabled="npcDetail.isSaving"
          :label="npcDetail.isSaving ? 'Saving…' : (npc?.id ? 'Save Changes' : 'Create NPC')"
          :mobile-label="npcDetail.isSaving ? 'Saving…' : (npc?.id ? 'Save' : 'Create')"
          variant="primary"
          :collapse-label-on-mobile="false"
        />
      </template>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <NpcDetail
      v-else
      :key="id"
      ref="npcDetail"
      :npc="isNewNpc ? null : (npc ?? null)"
    />
  </PageHeader>

  <!-- Reading on a phone, before the row has arrived. Every other branch owns
       its own loading state; this one has no chrome to hang it on. -->
  <div v-else class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconDelete, IconGenerate } from '@/lib/icons';
import { useNpc } from "@/composables/npcs/useNpcs";
import { useDetailModal } from "@/composables/useDetailModal";
import { useRecentNpcs } from "@/composables/dashboard/useRecentNpcs";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import NpcDetail from "@/components/npcs/NpcDetail.vue";
import NpcDetailModal from "@/components/npcs/NpcDetailModal.vue";
import NpcDetailMobile from "@/components/npcs/NpcDetailMobile.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import EntitySendMenu from "@/components/common/EntitySendMenu.vue";
import NpcAlterEgoControl from "@/components/npcs/NpcAlterEgoControl.vue";
import RevealedFieldsPanel from "@/components/common/RevealedFieldsPanel.vue";
import { getNpcDisplayName, NPC_PLAYER_FIELDS } from "@/lib/npcDisplay";

const route = useRoute();
const router = useRouter();

const isNewNpc = computed(() => route.name === "npc-new");
const id = computed(() => (isNewNpc.value ? "" : (route.params.id as string)));

// `asModal` and `close` are the same reasoning NpcsView uses to decide whether
// to keep drawing the grid, so the two can never disagree about which of them
// the user is looking at.
const { asModal, close } = useDetailModal("/npcs");

// Broader than the composable's `?edit=true` test, because /npcs/new is an
// edit screen without ever saying so in the query. That route is not nested
// under the list, so `asModal` is false there regardless.
const isEditing = computed(() => isNewNpc.value || route.query.edit === "true");

const isMobile = useMediaQuery("(max-width: 767px)");
const showMobileRead = computed(() => isMobile.value && !isEditing.value && !isNewNpc.value);
// NpcDetail owns its own mobile chrome (NpcEditMobile), so no PageHeader here.
const showMobileEdit = computed(() => isMobile.value && isEditing.value && !isLoading.value);
const showDesktopEdit = computed(() => !isMobile.value && isEditing.value);

/**
 * Leave the editor without saving — the desktop twin of `NpcEditMobile`'s
 * Cancel, which `NpcDetail.onMobileCancel` already handles the same two ways.
 *
 * An existing NPC only has to drop `?edit=true`: the read view is this same
 * route, so the sheet opens over the grid exactly where Save would have landed.
 * A new one has no record to go back to, so it goes to the list.
 */
function cancelEdit() {
  if (isNewNpc.value) {
    void router.push("/npcs");
    return;
  }
  const q = { ...route.query };
  delete q.edit;
  void router.replace({ query: q });
}

const { data: npc, isLoading: npcLoading } = useNpc(id);
const { recordVisit } = useRecentNpcs();
watch(id, (npcId) => { if (npcId) recordVisit(npcId); }, { immediate: true });
const isLoading = computed(() => !isNewNpc.value && npcLoading.value);

// Template ref to NpcDetail — gives access to its exposed state/methods
const npcDetail = ref<InstanceType<typeof NpcDetail> | null>(null);

const subtitle = computed(() => {
  if (!npc.value) return "";
  return [npc.value.race, npc.value.occupation].filter(Boolean).join(" · ");
});

// `getNpcDisplayName` is honestly nullable — the player projection returns null
// for a name that is not revealed — so the absence is marked rather than coerced.
const displayName = computed(() =>
  npc.value ? getNpcDisplayName(npc.value) ?? "???" : "New NPC",
);
</script>
