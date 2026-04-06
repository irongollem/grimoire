<template>
  <div class="loading-screen">
    <img src="/logo.png" alt="Dungeon Grimoire" class="loading-logo" />
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
  background-color: #0b1525;
  z-index: 9999;
}

.loading-logo {
  max-width: min(480px, 80vw);
  height: auto;
}

.loading-spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid rgba(255 255 255 / 0.15);
  border-top-color: rgba(255 255 255 / 0.7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
