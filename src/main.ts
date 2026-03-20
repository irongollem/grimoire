import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import router from "./router";
import App from "./App.vue";

import "./assets/main.css";

// networkMode: 'always' prevents TanStack Query from pausing mutations/queries
// when the browser briefly reports "offline" on tab focus after sleep/switch.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: "always" },
    mutations: { networkMode: "always" },
  },
});

const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);

app.mount("#app");
