<template>
  <div class="loading-screen">
    <img src="/logo.webp" alt="Dungeon Grimoire" class="loading-logo" />
    <div class="loading-spinner" aria-label="Loading…" />
  </div>
</template>

<style scoped>
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  background-color: var(--background);
  z-index: 9999;
}

.loading-logo {
  max-width: min(480px, 80vw);
  height: auto;
}

.loading-spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid color-mix(in oklch, var(--primary) 25%, transparent);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
