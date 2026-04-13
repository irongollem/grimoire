export interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

export async function fetchAll<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  const sep = baseUrl.includes("?") ? "&" : "?";
  let url: string | null = `${baseUrl}${sep}limit=500&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${url}`);
    const json: Open5eListResponse<T> = await res.json();
    results.push(...json.results);
    url = json.next;
  }
  return results;
}
