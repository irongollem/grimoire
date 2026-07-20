<template>
  <div class="rounded-lg border border-violet-500/30 bg-violet-500/5 overflow-hidden">
    <div class="px-4 py-2.5 border-b border-violet-500/20 bg-violet-500/10">
      <p class="font-cinzel text-xs font-semibold tracking-wider text-violet-500">2024 Sorcerer</p>
    </div>
    <div class="p-4 space-y-3 font-fell text-sm">
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <p class="font-cinzel text-xs font-semibold">Innate Sorcery</p>
          <p class="text-muted-foreground">For 1 minute, Sorcerer spell attacks have Advantage and your Sorcerer spell save DC increases by 1.</p>
          <p v-if="level >= 7" class="text-muted-foreground">Sorcery Incarnate also lets you combine two Metamagic options. With no uses left, activation costs 2 SP.</p>
        </div>
        <button
          v-if="!active"
          type="button"
          class="rounded border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 font-cinzel text-xs text-violet-500 disabled:opacity-40"
          :disabled="activating || (innate.current <= 0 && (level < 7 || sorcery.current < 2))"
          @click="activate"
        >Activate ({{ innate.current }}/{{ innate.max }})</button>
        <button
          v-else type="button"
          class="rounded border border-violet-500/40 bg-violet-500/20 px-3 py-1.5 font-cinzel text-xs text-violet-500"
          :disabled="ending" @click="end"
        >Active · End</button>
      </div>

      <div v-if="level >= 5" class="flex items-center gap-3 border-t border-violet-500/15 pt-3">
        <div class="flex-1">
          <p class="font-cinzel text-xs font-semibold">Sorcerous Restoration</p>
          <p class="text-muted-foreground">After a Short Rest, regain up to {{ restoration }} SP. Once per Long Rest.</p>
        </div>
        <button
          type="button"
          class="rounded border border-border bg-muted/40 px-3 py-1.5 font-cinzel text-xs disabled:opacity-40"
          :disabled="restoring || !restorationAvailable || restoration === 0"
          @click="restore"
        >Restore ({{ sorcery.current }}/{{ sorcery.max }})</button>
      </div>

      <p v-if="level >= 20" class="border-t border-violet-500/15 pt-3 text-muted-foreground">
        Arcane Apotheosis automatically makes the first Metamagic option you use each turn free while Innate Sorcery is active.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import {
  useActivateInnateSorcery,
  useEndInnateSorcery,
  useRestoreSorceryPoints,
} from "@/composables/useParty";
import { isInnateSorceryActive, sorcerousRestorationAmount } from "@/lib/sorcererFeatures";
import { useToast } from "@/composables/useToast";

const props = defineProps<{ member: PartyMember; level: number }>();
const toast = useToast();
const { mutateAsync: activateMutation, isPending: activating } = useActivateInnateSorcery();
const { mutateAsync: endMutation, isPending: ending } = useEndInnateSorcery();
const { mutateAsync: restoreMutation, isPending: restoring } = useRestoreSorceryPoints();

const innate = computed(() => props.member.class_resources?.innate_sorcery ?? { current: 0, max: 2 });
const sorcery = computed(() => props.member.class_resources?.sorcery_points ?? { current: 0, max: 0 });
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1_000); });
onUnmounted(() => { if (timer) clearInterval(timer); });
const active = computed(() => isInnateSorceryActive(props.member, now.value));
const restorationAvailable = computed(() => props.member.class_choices?.sorcerous_restoration_available === true);
const restoration = computed(() => sorcerousRestorationAmount(props.level, sorcery.value.current, sorcery.value.max));

async function run(action: () => Promise<unknown>) {
  try { await action(); }
  catch (error) { toast.error(toast.fromError(error)); }
}
function activate() { void run(() => activateMutation(props.member.id)); }
function end() { void run(() => endMutation(props.member.id)); }
function restore() { void run(() => restoreMutation(props.member.id)); }
</script>
