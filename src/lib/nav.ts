import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Scroll,
  Users,
  Skull,
  Shield,
  Layers,
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
  {
    label: 'Bestiary',
    to: '/monsters',
    icon: Skull,
    description: 'Monster builder & compendium',
  },
  {
    label: 'Party',
    to: '/party',
    icon: Shield,
    description: 'Track heroes & initiative',
  },
  {
    label: 'Card Forge',
    to: '/forge',
    icon: Layers,
    description: 'Print NPC & monster cards',
  },
]
