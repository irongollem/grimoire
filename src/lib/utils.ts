import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type TiptapNode = { text?: string; content?: TiptapNode[] };

export function extractTiptapText(json: string | null | undefined, maxLength = 160): string {
  if (!json) return "";
  try {
    const doc = JSON.parse(json) as TiptapNode;
    const texts: string[] = [];
    function walk(node: TiptapNode) {
      if (node.text) texts.push(node.text);
      node.content?.forEach(walk);
    }
    walk(doc);
    return texts.join(" ").slice(0, maxLength);
  } catch {
    return "";
  }
}
