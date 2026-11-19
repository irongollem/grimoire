import { computed, nextTick, ref, type Ref } from "vue";
import { insertMention, matchingTargets, mentionQueryAt, type MentionTarget } from "@/lib/chat/chatMentions";

/**
 * The @-mention picker of the chat composer (#1021 row 26): which mention is being typed, who it could mean, and
 * the keys that choose one. The textarea stays a plain textarea; this only reads its caret and rewrites its text.
 */
export function useChatMentionInput(options: {
  text: Ref<string>;
  el: Ref<HTMLTextAreaElement | null>;
  targets: () => readonly MentionTarget[];
}) {
  const typing = ref<{ start: number; query: string } | null>(null);
  const active = ref(0);
  const suggestions = computed(() => (typing.value === null ? [] : matchingTargets(options.targets(), typing.value.query)));

  /** Call after the text or the caret changed. */
  function refresh() {
    const el = options.el.value;
    typing.value = el === null ? null : mentionQueryAt(options.text.value, el.selectionStart);
    active.value = 0;
  }

  function close() {
    typing.value = null;
  }

  function pick(target: MentionTarget) {
    const el = options.el.value;
    if (typing.value === null || el === null) return;
    const next = insertMention(options.text.value, typing.value.start, el.selectionStart, target.name);
    options.text.value = next.text;
    close();
    void nextTick(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  /** True when the key was the picker's, so the composer must not also act on it (Enter would send the line). */
  function onKeydown(event: KeyboardEvent): boolean {
    // An input method's Enter confirms its composition; it is not a choice from the picker.
    if (event.isComposing || event.keyCode === 229) return false;
    const list = suggestions.value;
    if (list.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active.value = (active.value + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length;
      return true;
    }
    // Shift+Enter is a new line and Shift+Tab walks backwards: only the bare key picks.
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      pick(list[active.value]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return true;
    }
    return false;
  }

  return { suggestions, active, refresh, close, pick, onKeydown };
}
