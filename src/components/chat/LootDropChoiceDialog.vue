<template>
  <AppModal :open="request !== null" size="sm" :backdrop-dismiss="false" @close="cancel">
    <ModalHeader title="Hand out loot" :subtitle="request?.itemLabel" subtitle-role="body" header-class="pb-3" />

    <div class="flex flex-col gap-1 px-3 pb-2">
      <AppButton v-for="row in rows" :key="row.mode" variant="menu" size="md" @click="row.pick()">
        <span class="flex flex-col items-start">
          <span class="text-body">{{ row.title }}</span>
          <span class="text-caption text-muted-foreground">{{ row.hint }}</span>
        </span>
      </AppButton>

      <div v-if="choosingCharacter" class="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
        <p v-if="!party?.length" class="px-2 py-1 text-caption italic text-muted-foreground">No characters yet.</p>
        <AppButton
          v-for="member in party"
          :key="member.id"
          variant="menu"
          size="sm"
          :label="member.name"
          @click="resolve({ mode: 'give', partyMemberId: member.id })"
        />
      </div>
    </div>

    <div class="flex justify-end px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="cancel" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Asks the DM how a drop is handed out while Need or Greed is on. Mounted once in
 * `App.vue`; `useLootDropChoice().ask()` opens it. Like ConfirmDialog it ignores
 * backdrop clicks (a stray click is not an answer) and Escape cancels.
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useLootDropChoice } from "@/composables/campaign/useLootDropChoice";
import { useParty } from "@/composables/party/useParty";

const { request, resolve } = useLootDropChoice();
const { data: party } = useParty();

const choosingCharacter = ref(false);
// The next question must not open with the previous one's list already unfolded.
watch(request, () => { choosingCharacter.value = false; });

const rows = [
  { mode: "roll", title: "Roll Need or Greed", hint: "Everyone picks Need, Greed or Pass. The highest roll takes it.", pick: () => resolve({ mode: "roll" }) },
  { mode: "free", title: "Free to grab", hint: "First come, first served.", pick: () => resolve({ mode: "free" }) },
  { mode: "give", title: "Give to…", hint: "Straight into one character's pack.", pick: () => { choosingCharacter.value = true; } },
] as const;

function cancel() {
  resolve(null);
}
</script>
