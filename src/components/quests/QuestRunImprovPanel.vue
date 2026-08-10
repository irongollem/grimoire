<template>
  <section class="space-y-3 rounded-xl border border-tone-caution/40 bg-card p-3" aria-label="Improvise story beat">
    <div class="flex items-center gap-2">
      <div class="flex-1"><h2 class="font-cinzel text-sm font-bold text-foreground">Improvise a beat</h2><p class="text-caption text-muted-foreground">Capture the detour now; prepare it properly after the session.</p></div>
      <AppButton label="Close" size="xs" variant="subtle" @click="emit('close')" />
    </div>
    <div class="grid gap-2 sm:grid-cols-2">
      <AppInput v-model="title" placeholder="What just happened?" autofocus />
      <AppSelect v-model="kind"><option value="neutral">Story moment</option><option value="social">Social</option><option value="combat">Combat</option><option value="explore">Explore</option><option value="discovery">Discovery</option></AppSelect>
    </div>
    <AppInput v-model="reason" placeholder="Why did the story detour?" />
    <AppInput v-model="dmLead" placeholder="One-line DM note (optional)" />
    <AppInput v-model="revealText" placeholder="Player reveal copy (optional)" />
    <label class="flex items-center gap-2 text-caption text-foreground"><input v-model="pushReturn" type="checkbox" /> Offer a return to the current beat</label>
    <label class="flex items-center gap-2 text-caption text-foreground"><input v-model="keepEdge" type="checkbox" /> Keep an “Improvised” edge in the authored graph</label>
    <div class="flex justify-end"><AppButton label="Create & run" size="sm" variant="primary" :disabled="!title.trim() || !reason.trim()" @click="submit" /></div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

const emit = defineEmits<{ close: []; submit: [value: { title: string; kind: string; reason: string; dmLead: string; revealText: string; pushReturn: boolean; keepEdge: boolean }] }>();
const title = ref("");
const kind = ref("neutral");
const reason = ref("");
const dmLead = ref("");
const revealText = ref("");
const pushReturn = ref(true);
const keepEdge = ref(false);

function submit() {
  if (!title.value.trim() || !reason.value.trim()) return;
  emit("submit", { title: title.value.trim(), kind: kind.value, reason: reason.value.trim(), dmLead: dmLead.value.trim(), revealText: revealText.value.trim(), pushReturn: pushReturn.value, keepEdge: keepEdge.value });
}
</script>
