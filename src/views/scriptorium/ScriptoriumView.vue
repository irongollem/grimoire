<template>
  <ListPageLayout title="Scriptorium" description="Craft spell scrolls, stat blocks, and campaign documents">
    <template #actions>
      <ListActionButton
        :icon="Plus"
        label="New Document"
        variant="primary"
        to="/scriptorium/new"
      />
    </template>

    <ScriptoriumDocumentList />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ScriptoriumDocumentList from "@/components/scriptorium/ScriptoriumDocumentList.vue";
</script>
