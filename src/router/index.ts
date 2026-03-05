import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ── Auth (no sidebar layout) ──────────────────────────────────────────
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { layout: 'auth', requiresGuest: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/views/auth/SignupView.vue'),
      meta: { layout: 'auth', requiresGuest: true },
    },

    // ── App ───────────────────────────────────────────────────────────────
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true, title: 'Campaign Dashboard' },
    },

    // Notes
    {
      path: '/notes',
      name: 'notes',
      component: () => import('@/views/notes/NotesView.vue'),
      meta: { requiresAuth: true, title: 'Campaign Notes' },
    },
    {
      path: '/notes/new',
      name: 'note-new',
      component: () => import('@/views/notes/NoteDetailView.vue'),
      meta: { requiresAuth: true, title: 'New Note' },
    },
    {
      path: '/notes/:id',
      name: 'note-detail',
      component: () => import('@/views/notes/NoteDetailView.vue'),
      meta: { requiresAuth: true, title: 'Note' },
    },

    // Calendar
    {
      path: '/calendar',
      name: 'calendar',
      component: () => import('@/views/calendar/CalendarView.vue'),
      meta: { requiresAuth: true, title: 'Faerûn Calendar' },
    },

    // Scriptorium
    {
      path: '/scriptorium',
      name: 'scriptorium',
      component: () => import('@/views/scriptorium/ScriptoriumView.vue'),
      meta: { requiresAuth: true, title: 'Scriptorium' },
    },
    {
      path: '/scriptorium/new',
      name: 'scriptorium-new',
      component: () => import('@/views/scriptorium/ScriptoriumEditorView.vue'),
      meta: { requiresAuth: true, title: 'New Document' },
    },
    {
      path: '/scriptorium/:id',
      name: 'scriptorium-editor',
      component: () => import('@/views/scriptorium/ScriptoriumEditorView.vue'),
      meta: { requiresAuth: true, title: 'Edit Document' },
    },

    // NPCs
    {
      path: '/npcs',
      name: 'npcs',
      component: () => import('@/views/npcs/NpcsView.vue'),
      meta: { requiresAuth: true, title: 'NPC Tracker' },
    },
    {
      path: '/npcs/:id',
      name: 'npc-detail',
      component: () => import('@/views/npcs/NpcDetailView.vue'),
      meta: { requiresAuth: true, title: 'NPC Sheet' },
    },

    // 404
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

// Auth navigation guard
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

export default router
