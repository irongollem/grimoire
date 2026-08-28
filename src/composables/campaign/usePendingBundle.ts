import { shallowRef } from "vue";

/**
 * Module-level ref that bridges the OS file-launch handler (main.ts)
 * with the ImportBundleModal in App.vue. Set by the launchQueue consumer
 * when the user opens a .grimoire file from the OS; cleared when the modal closes.
 */
export const pendingBundleFile = shallowRef<File | null>(null);
