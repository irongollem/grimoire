<template>
  <div ref="triggerRef" class="flex shrink-0">
    <ListActionButton
      variant="primary"
      :icon="IconAdd"
      label="New handout"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :collapse-label-on-mobile="false"
      @click="toggle"
    />
  </div>

  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      role="dialog"
      aria-label="New handout"
      class="z-300 flex w-[min(35rem,calc(100vw-2rem))] flex-col gap-3 rounded-md border border-border bg-popover p-4 shadow-lg"
    >
      <h2 class="text-heading-sm font-bold text-foreground">What is it written on?</h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          v-for="paper in PAPERS"
          :key="paper"
          type="button"
          class="flex flex-col gap-2 rounded-md border border-border p-2 text-left transition-colors hover:border-primary focus-visible:border-primary disabled:opacity-60"
          :disabled="isStarting"
          :data-paper="paper"
          @click="pick(paper)"
        >
          <PaperSwatch :paper="paper" />
          <span class="text-body font-semibold text-foreground">{{ scriptoriumLook(paper).label }}</span>
        </button>
      </div>
      <p v-if="error" class="text-caption text-destructive" role="alert">{{ error }}</p>
      <p class="text-caption text-muted-foreground">
        One click makes it. You can change the paper later in the handout's settings.
      </p>
    </div>
  </Teleport>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
/**
 * "New handout" (#1115, frame 09): four papers, drawn by the papers
 * themselves. One click creates the handout on that paper and opens it; the
 * editor saves itself, so there is no form to fill in first.
 */
import { ref } from "vue";
import { useRouter } from "vue-router";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import PaperSwatch from "@/components/scriptorium/PaperSwatch.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useStartScriptoriumDocument } from "@/composables/scriptorium/useStartScriptoriumDocument";
import { IconAdd } from "@/lib/icons";
import { isQuotaExceeded } from "@/lib/quotaError";
import { PAPERS, scriptoriumLook } from "@/lib/scriptorium/looks";
import type { ScriptoriumPaper } from "@/types/scriptorium.types";

const router = useRouter();
const { startHandout, isStarting } = useStartScriptoriumDocument();
const { canCreate } = useQuota("scriptorium_documents");

const open = ref(false);
const showPaywall = ref(false);
const error = ref("");
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function toggle() {
  if (!canCreate.value) {
    showPaywall.value = true;
    return;
  }
  error.value = "";
  open.value = !open.value;
}

async function pick(paper: ScriptoriumPaper) {
  error.value = "";
  try {
    const id = await startHandout(paper);
    open.value = false;
    // Opening it is deliberate: an empty handout in a list confirms nothing, and the editor saves itself.
    await router.push(`/scriptorium/${id}`);
  } catch (e) {
    if (isQuotaExceeded(e)) {
      open.value = false;
      showPaywall.value = true;
    } else error.value = e instanceof Error ? e.message : "Could not start the handout.";
  }
}
</script>
