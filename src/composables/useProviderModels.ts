import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { MaybeRef } from "vue";
import { toValue } from "vue";

async function fetchProviderModels(provider: string): Promise<string[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-provider-models`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ provider }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? body?.error ?? `Error ${res.status}`);
  }
  const data = await res.json();
  return data.models as string[];
}

export function useProviderModels(provider: MaybeRef<string>) {
  return useQuery({
    queryKey: ["admin", "provider-models", provider],
    queryFn: () => fetchProviderModels(toValue(provider)),
    staleTime: 10 * 60 * 1000,
    enabled: () => !!toValue(provider),
    retry: false,
  });
}
