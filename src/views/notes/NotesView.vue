<template>
  <ListPageLayout title="Campaign Notes" description="Session logs, lore, and secrets of the realm">
    <template #actions>
      <ListActionButton
        :icon="Plus"
        label="New Note"
        variant="primary"
        to="/notes/new"
      />
    </template>

    <NotesList />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import NotesList from "@/components/notes/NotesList.vue";
</script>
