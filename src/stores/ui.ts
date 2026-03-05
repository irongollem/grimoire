import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NoteCategory } from '@/types/notes.types'
import type { NpcStatus, NpcRelationship } from '@/types/npc.types'
import type { ScriptoriumDocType } from '@/types/scriptorium.types'

export const useUiStore = defineStore('ui', () => {
  // Notes UI state
  const notesFilterCategory = ref<NoteCategory | 'all'>('all')
  const notesFilterTags = ref<string[]>([])
  const notesSearchQuery = ref('')
  const activeNoteId = ref<string | null>(null)

  // Calendar UI state
  const calendarViewMode = ref<'year' | 'month'>('month')

  // Scriptorium UI state
  const scriptoriumPreviewMode = ref<'split' | 'edit' | 'preview'>('split')
  const scriptoriumFilterType = ref<ScriptoriumDocType | 'all'>('all')
  const activeScriptoriumDocId = ref<string | null>(null)

  // NPC UI state
  const npcsFilterStatus = ref<NpcStatus | 'all'>('all')
  const npcsFilterRelationship = ref<NpcRelationship | 'all'>('all')
  const npcsSearchQuery = ref('')
  const activeNpcId = ref<string | null>(null)
  const npcGeneratorOpen = ref(false)

  // Mobile nav
  const mobileNavOpen = ref(false)

  function toggleMobileNav() {
    mobileNavOpen.value = !mobileNavOpen.value
  }

  function resetNotesFilters() {
    notesFilterCategory.value = 'all'
    notesFilterTags.value = []
    notesSearchQuery.value = ''
  }

  function resetNpcsFilters() {
    npcsFilterStatus.value = 'all'
    npcsFilterRelationship.value = 'all'
    npcsSearchQuery.value = ''
  }

  return {
    // Notes
    notesFilterCategory,
    notesFilterTags,
    notesSearchQuery,
    activeNoteId,
    resetNotesFilters,

    // Calendar
    calendarViewMode,

    // Scriptorium
    scriptoriumPreviewMode,
    scriptoriumFilterType,
    activeScriptoriumDocId,

    // NPCs
    npcsFilterStatus,
    npcsFilterRelationship,
    npcsSearchQuery,
    activeNpcId,
    npcGeneratorOpen,
    resetNpcsFilters,

    // Layout
    mobileNavOpen,
    toggleMobileNav,
  }
})
