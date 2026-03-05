import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Scroll,
  Users,
} from 'lucide-vue-next'
import type { Component } from 'vue'

export interface NavItem {
  label: string
  to: string
  icon: Component
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: LayoutDashboard,
    description: 'Campaign overview',
  },
  {
    label: 'Notes',
    to: '/notes',
    icon: BookOpen,
    description: 'Session notes & lore',
  },
  {
    label: 'Calendar',
    to: '/calendar',
    icon: CalendarDays,
    description: 'Faerûn timeline',
  },
  {
    label: 'Scriptorium',
    to: '/scriptorium',
    icon: Scroll,
    description: 'Craft documents & stat blocks',
  },
  {
    label: 'NPCs',
    to: '/npcs',
    icon: Users,
    description: 'Non-player characters',
  },
]
