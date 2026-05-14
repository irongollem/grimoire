<template>
  <div class="space-y-4 lg:sticky lg:top-0 lg:pb-4">
    <!-- Portrait (tabbed: True Form / Alter Ego) -->
    <EntityImageBlock
      v-if="artTab === 'true-form'"
      :model-value="portraitUrl"
      :focal-point="portraitFocalPoint"
      bucket="npc-portraits"
      show-focal-point
      :variants="ART_VARIANTS"
      :active-variant-id="artTab"
      @update:model-value="emit('update:portraitUrl', $event ?? '')"
      @update:focal-point="emit('update:portraitFocalPoint', $event)"
      @update:active-variant-id="emit('update:artTab', $event as ArtTab)"
    />
    <EntityImageBlock
      v-else
      :model-value="disguisePortraitUrl"
      :focal-point="disguisePortraitFocalPoint"
      bucket="npc-portraits"
      show-focal-point
      :variants="ART_VARIANTS"
      :active-variant-id="artTab"
      @update:model-value="emit('update:disguisePortraitUrl', $event ?? '')"
      @update:focal-point="emit('update:disguisePortraitFocalPoint', $event)"
      @update:active-variant-id="emit('update:artTab', $event as ArtTab)"
    />

    <!-- Party Stance -->
    <div>
      <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">PARTY STANCE</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
        <button
          v-for="r in REL_OPTIONS"
          :key="r.value"
          type="button"
          class="py-1.5 rounded border font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :style="relationship === r.value ? { borderColor: r.color, backgroundColor: r.color + '22', color: r.color } : {}"
          :class="relationship !== r.value ? 'border-border text-muted-foreground hover:border-primary/40' : ''"
          @click="emit('update:relationship', r.value)"
        >{{ r.label }}</button>
      </div>
    </div>

    <!-- Status -->
    <div>
      <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">STATUS</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
        <button
          v-for="s in STATUS_OPTIONS"
          :key="s.value"
          type="button"
          class="py-1.5 rounded border font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :style="status === s.value ? { borderColor: s.color, backgroundColor: s.color + '22', color: s.color } : {}"
          :class="status !== s.value ? 'border-border text-muted-foreground hover:border-primary/40' : ''"
          @click="emit('update:status', s.value)"
        >{{ s.label }}</button>
      </div>
    </div>

    <!-- Tags -->
    <div>
      <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">TAGS</p>
      <TagInput :model-value="tags" @update:model-value="emit('update:tags', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import EntityImageBlock from '@/components/common/EntityImageBlock.vue'
import TagInput from '@/components/common/TagInput.vue'
import type { NpcStatus, NpcRelationship } from '@/types/npc.types'

type FocalPoint = { x: number; y: number } | null

type ArtTab = 'true-form' | 'alter-ego'

const ART_VARIANTS = [
  { id: 'true-form', label: 'True Form' },
  { id: 'alter-ego', label: 'Alter Ego' },
] as const

const STATUS_OPTIONS: { value: NpcStatus; label: string; color: string }[] = [
  { value: 'alive',   label: 'Alive',   color: '#22c55e' },
  { value: 'dead',    label: 'Dead',    color: '#ef4444' },
  { value: 'missing', label: 'Missing', color: '#f59e0b' },
  { value: 'unknown', label: '?',       color: '#6b7280' },
]

const REL_OPTIONS: { value: NpcRelationship; label: string; color: string }[] = [
  { value: 'ally',    label: 'Ally',    color: '#2563eb' },
  { value: 'neutral', label: 'Neutral', color: '#6b7280' },
  { value: 'enemy',   label: 'Enemy',   color: '#dc2626' },
  { value: 'unknown', label: '?',       color: '#9333ea' },
]

const {
  artTab,
  portraitUrl = null,
  portraitFocalPoint = null,
  disguisePortraitUrl = null,
  disguisePortraitFocalPoint = null,
  relationship,
  status,
  tags,
} = defineProps<{
  artTab: ArtTab
  portraitUrl?: string | null
  portraitFocalPoint?: FocalPoint
  disguisePortraitUrl?: string | null
  disguisePortraitFocalPoint?: FocalPoint
  relationship: NpcRelationship
  status: NpcStatus
  tags: string[]
}>()

const emit = defineEmits<{
  'update:artTab': [value: ArtTab]
  'update:portraitUrl': [value: string]
  'update:portraitFocalPoint': [value: FocalPoint]
  'update:disguisePortraitUrl': [value: string]
  'update:disguisePortraitFocalPoint': [value: FocalPoint]
  'update:relationship': [value: NpcRelationship]
  'update:status': [value: NpcStatus]
  'update:tags': [value: string[]]
}>()
</script>
