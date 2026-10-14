<template>
  <div class="flex flex-col gap-2.5">
    <RichTextEditor
      v-model="scratch.content.value"
      toolbar="focus"
      size="sm"
      placeholder="Jot something down…"
    />
    <div class="flex justify-end">
      <AppButton variant="subtle" size="sm" label="Add to journal" :disabled="scratch.isBlank.value" @click="addToJournal" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import { useJournalScratch } from "@/composables/notes/useJournalScratch";

/**
 * An always-open pad at the top of "Your notes". What is typed is kept on this
 * device; "Add to journal" opens the journal's full new-entry form with it
 * pasted in, and the journal clears the pad once that entry is saved.
 */
const router = useRouter();
const scratch = useJournalScratch();

function addToJournal() {
  void router.push({ name: "play-journal", query: { tab: "mine", from: "scratch" } });
}
</script>
