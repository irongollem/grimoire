import type { InjectionKey } from "vue";
import type { RouteLocationRaw } from "vue-router";

/**
 * Where "open inventory" goes from inside the character sheet. The player's own sheet
 * sends them to their Inventory page; the DM's character page has an Inventory tab
 * instead, since /play/inventory would show the DM's own (empty) pack.
 */
export const INVENTORY_LINK: InjectionKey<RouteLocationRaw> = Symbol("inventoryLink");
export const DEFAULT_INVENTORY_LINK = "/play/inventory";
