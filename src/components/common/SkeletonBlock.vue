<template>
  <!-- A content placeholder, not a progress indicator: BannerLoader stays the
       one of those. Size and shape come from the caller's classes. -->
  <span class="skeleton-block block rounded-md bg-muted" aria-hidden="true" />
</template>

<style scoped>
/*
 * One keyframe shared by every block, so there is no per-instance JS and a
 * whole page of them costs a single compositor animation each. The sheen is
 * mixed from the theme's foreground, never a literal colour, so it reads on
 * parchment and on the dark themes alike.
 */
.skeleton-block {
  position: relative;
  overflow: hidden;
}
.skeleton-block::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-foreground) 9%, transparent),
    transparent
  );
  animation: skeleton-sheen 1.6s ease-in-out infinite;
}
@keyframes skeleton-sheen {
  to {
    transform: translateX(100%);
  }
}
/* Reduced motion: a still, muted block. */
@media (prefers-reduced-motion: reduce) {
  .skeleton-block::after {
    animation: none;
    display: none;
  }
}
</style>
