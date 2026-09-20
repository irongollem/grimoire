/**
 * The bundled entry point. vite.config.ts's `polyfillsPlugin` builds this file
 * to a self-contained IIFE and inlines it at the top of index.html's <head>,
 * so it runs before any module script — see ./index.ts for why that placement
 * is required rather than merely tidy.
 *
 * Kept separate from index.ts so importing the implementations in a test does
 * not patch the test process's own globals.
 */
import { installPolyfills } from "./index";

installPolyfills();
