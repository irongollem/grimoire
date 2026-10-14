<template>
  <!--
    The caption on a personal library row another DM of the campaign authored
    (#590, co-DM). The row is readable but an UPDATE or DELETE on it matches
    nothing under RLS, so every host hides its write controls and says why here
    instead. See `isReadOnlyLibraryRow`.
  -->
  <p class="text-body italic text-muted-foreground" data-testid="read-only-library-note">
    From another DM's library. Read only.
  </p>
</template>
