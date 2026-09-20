<template>
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <RouterLink
      to="/spells"
      class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
    >
      ← Spellbook
    </RouterLink>
    <div class="flex items-center gap-2">
      <AppButton
        v-if="isAiEnabled"
        variant="tinted"
        tone="primary"
        emphasis="outline"
        size="md"
        :icon="IconGenerate"
        label="Generate"
        @click="$emit('generate')"
      />
      <!--
        #895: Send to Scriptorium and Copy to campaign… fold into one
        EntitySendMenu trigger everywhere else this pair appears (NPC, item,
        monster) — but here the two actions don't share a condition, so the
        branch below is load-bearing rather than tidy-uppable.

        Copy to campaign… duplicates *your* record into another of your
        campaigns. A shared spell is a `library_spells` row: it isn't owned by
        a campaign and it already resolves in every one of them, so there is
        nothing for the copy to do — which is why the pre-#895 template had
        that button inside `v-if="!isShared"` while Scriptorium sat outside it.
        (Unlike monsters and items, a shared spell has no Customize path at
        all — the `v-else` branch below says "art only" — so there is no owned
        copy for a campaign copy to act on either.) A shared spell therefore
        has exactly one of the pair, and gets the bare button for the same
        reason the seven single-action editors do: a dropdown holding one row
        spends a click and buys nothing.
      -->
      <EntitySendMenu
        v-if="hasSpell && !isShared"
        :sending-to-scriptorium="isSendingToScriptorium"
        :collapse-label-on-mobile="false"
        @scriptorium="$emit('sendToScriptorium')"
        @copy="$emit('copyToCampaign')"
      />
      <AppButton
        v-else-if="hasSpell && isShared"
        variant="subtle"
        size="md"
        :disabled="isSendingToScriptorium"
        :icon="IconScrollText"
        :label="isSendingToScriptorium ? 'Sending…' : 'Send to Scriptorium'"
        @click="$emit('sendToScriptorium')"
      />
      <template v-if="!isShared">
        <AppButton
          v-if="hasSpell"
          variant="destructive"
          size="md"
          :disabled="isDeleting"
          :icon="IconDelete"
          label="Delete"
          @click="$emit('delete')"
        />
        <AppButton
          variant="primary"
          size="md"
          :disabled="isSaving || !canSave"
          :icon="IconSave"
          :label="isSaving ? 'Saving…' : hasSpell ? 'Save' : 'Create'"
          @click="$emit('save')"
        />
      </template>
      <span v-else class="text-caption text-muted-foreground italic">Reference spell — art only</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconDelete, IconGenerate, IconSave, IconScrollText } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import EntitySendMenu from "@/components/common/EntitySendMenu.vue";

defineProps<{
  hasSpell: boolean;
  isShared: boolean;
  isAiEnabled: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isSendingToScriptorium: boolean;
  canSave: boolean;
}>();

defineEmits<{
  generate: [];
  sendToScriptorium: [];
  copyToCampaign: [];
  delete: [];
  save: [];
}>();
</script>
