<script setup lang="ts">
/**
 * The owner's preview strip (#1085): shown over the real reader while the draft is on screen. It also tells crawlers
 * to look away, since a preview is not a release.
 */
import { onBeforeUnmount, onMounted } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { endPreview } from "@/lib/openBook/preview";

const router = useRouter();

let meta: HTMLMetaElement | null = null;
onMounted(() => {
  meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex, nofollow";
  document.head.appendChild(meta);
});
onBeforeUnmount(() => meta?.remove());

function back() {
  void router.push({ name: "campaign-settings", query: { tab: "openbook" } });
}
</script>

<template>
  <aside class="ob-preview-bar" role="status" aria-label="Preview of your unreleased book">
    <p class="ob-preview-text text-caption">
      <b>Preview</b> of your unreleased book. This is how it will read once you release it.
    </p>
    <div class="ob-preview-actions">
      <AppButton variant="outline" size="sm" label="Back to settings" @click="back" />
      <AppButton variant="outline" size="sm" label="End preview" @click="endPreview" />
    </div>
  </aside>
</template>

<style scoped>
.ob-preview-bar {
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  flex-wrap: wrap;
  padding: 0.5rem 1rem;
  background: #1a1411;
  color: #e9dcc3;
  border-bottom: 1px solid #5b4630;
}
.ob-preview-text {
  margin: 0;
}
.ob-preview-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
