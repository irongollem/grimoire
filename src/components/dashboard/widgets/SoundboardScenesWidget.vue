<template>
  <!--
    Self-hiding: a campaign with no named soundboard pages has nothing to jump
    to, and the "All" tab is already where the soundboard opens. Registry and
    component agree — `v-if`, no `loading`/`empty` props.
  -->
  <DashboardWidget
    v-if="pages.length > 0"
    title="Ambience"
    :count="pages.length"
    to="/soundboard"
    action-label="Soundboard →"
    max-height="none"
  >
    <div class="flex flex-wrap gap-1.5 p-3">
      <AppButton
        v-for="page in pages"
        :key="page.id"
        variant="subtle"
        surface="card"
        size="xs"
        :icon="IconNavSoundboard"
        :label="page.name"
        @click="openPage(page.id)"
      />
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * Jump straight to a named ambience page (#764).
 *
 * **This deliberately carries no playback control, and that is what keeps it
 * on the right side of the two-surfaces rule.** The floating `SoundboardWidget`
 * already owns "what is playing" from every page in the app; a second set of
 * transport buttons here would be exactly the drift that rule exists to
 * prevent. So this widget only *navigates* — there is no control appearing in
 * two places, because there is no control.
 *
 * It needs no shared component for the same reason. Choosing a page is one
 * piece of state, `ui.soundboardActivePage`, which `SoundboardPageTabs` binds
 * with `v-model`; this sets the same field and then goes to the page the tabs
 * live on. The tabs remain the only thing that renders a page control.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useSoundboardPages } from "@/composables/useSoundboardPages";
import { useUiStore } from "@/stores/ui";
import { IconNavSoundboard } from "@/lib/icons";

const router = useRouter();
const ui = useUiStore();
const { data: soundboardPages } = useSoundboardPages();

/**
 * Unloaded and "this campaign has no pages" both render nothing, because the
 * card is self-hiding — so unlike a card with an empty state, this one loses
 * no distinction by treating them alike. The explicit branch is kept anyway:
 * it costs a line and it is the shape to copy if this ever grows one.
 */
const pages = computed(() => {
  const loaded = soundboardPages.value;
  if (loaded === undefined) return [];
  return [...loaded].sort((a, b) => a.sort_order - b.sort_order);
});

function openPage(id: string) {
  ui.soundboardActivePage = id;
  void router.push("/soundboard");
}
</script>
