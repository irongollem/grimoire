<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div class="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl">
        <!-- Header -->
        <div class="px-6 py-5 border-b border-border">
          <div class="flex items-center gap-2.5 mb-1">
            <IconArchive class="h-5 w-5 text-amber-400 shrink-0" />
            <h2 class="font-cinzel text-lg font-bold text-foreground">
              Choose your active campaign
            </h2>
          </div>
          <p class="text-body text-muted-foreground italic leading-relaxed">
            You're now on the free plan ({{ campaignLimit }} active campaign).
            Select which campaign to keep — the rest will be archived and can be
            restored by upgrading.
          </p>
        </div>

        <!-- Campaign list -->
        <div class="px-6 py-4 space-y-2 max-h-[50vh] overflow-y-auto">
          <button
            v-for="c in allCampaigns"
            :key="c.id"
            class="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors"
            :class="
              selected === c.id
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/40 hover:bg-muted/50'
            "
            @click="selected = c.id"
          >
            <span
              class="h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
              :class="selected === c.id ? 'border-primary bg-primary' : 'border-muted-foreground'"
            >
              <span v-if="selected === c.id" class="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
            </span>
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-semibold text-foreground truncate">
                {{ c.name }}
              </p>
              <p class="text-caption text-muted-foreground italic truncate">
                {{ c.setting }} · last updated {{ formatDate(c.updated_at) }}
              </p>
            </div>
          </button>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-border flex flex-col gap-2">
          <button
            class="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-label-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="!selected || isArchiving"
            @click="confirm"
          >
            {{ isArchiving ? "Archiving…" : `Keep "${selectedCampaign?.name ?? ''}" — archive the rest` }}
          </button>
          <button
            class="w-full py-2 rounded-md border border-amber-500/40 text-amber-400 text-label-lg font-semibold hover:bg-amber-500/10 transition-colors"
            @click="goUpgrade"
          >
            Upgrade to Pro instead
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { IconArchive } from '@/lib/icons'
import { useAllCampaigns, useArchiveCampaign } from '@/composables/useCampaigns'
import { useCampaignStore } from '@/stores/campaign'

defineProps<{ show: boolean; campaignLimit: number }>()

const router = useRouter()
const campaignStore = useCampaignStore()
const { data: campaignData } = useAllCampaigns()
const { mutateAsync: archiveCampaign, isPending: isArchiving } = useArchiveCampaign()

const allCampaigns = computed(() => campaignData.value ?? [])
const selected = ref<string | null>(allCampaigns.value[0]?.id ?? null)
const selectedCampaign = computed(() => allCampaigns.value.find(c => c.id === selected.value))

async function confirm() {
  if (!selected.value) return
  const toArchive = allCampaigns.value.filter(c => c.id !== selected.value)
  await Promise.all(toArchive.map(c => archiveCampaign(c.id)))
  // Switch to the kept campaign if the current active one was archived
  if (campaignStore.activeCampaignId !== selected.value) {
    const kept = allCampaigns.value.find(c => c.id === selected.value)
    if (kept) campaignStore.switchToCampaign(kept)
  }
}

function goUpgrade() {
  router.push('/billing')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>
