<template>
  <NoticeCard v-if="count > 0 && !later" title="Which way do your families go?">
    {{ count }} {{ count === 1 ? "link" : "links" }} from before family trees just say “Family”. Tell the book who is
    whose parent once, and the trees draw themselves.
    <template #actions>
      <AppButton variant="primary" size="sm" to="/npcs/family-links">Sort them out</AppButton>
      <AppButton variant="ghost" size="sm" @click="dismiss">Later</AppButton>
    </template>
  </NoticeCard>
</template>

<script setup lang="ts">
/**
 * Shown on the NPC list and the Relationship Web while any old "Family" link is
 * still waiting to be sorted (#1083, frame 05). "Later" hides it for this
 * session only, so it comes back until the work is done.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import NoticeCard from "@/components/common/feedback/NoticeCard.vue";
import { useKinLinks } from "@/composables/kinship/useKinLinks";
import { safeSessionStorage } from "@/lib/safeLocalStorage";

const KEY = "grimoire:sort-family-links-later";

function readLater(): boolean {
  try {
    return safeSessionStorage().getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const later = ref(readLater());
const { data: links } = useKinLinks();
const count = computed(() => (links.value ?? []).filter((l) => l.needs_sorting).length);

function dismiss() {
  later.value = true;
  try {
    safeSessionStorage().setItem(KEY, "1");
  } catch {
    // Storage blocked: hiding for this mount is enough.
  }
}
</script>
