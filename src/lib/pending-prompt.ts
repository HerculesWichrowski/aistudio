const KEY = "aistudio:pending-prompt";

/** Stash prompt only for the sign-in → create handoff (session-scoped). */
export function stashPendingPrompt(prompt: string) {
  sessionStorage.setItem(KEY, prompt);
}

export function takePendingPrompt() {
  const value = sessionStorage.getItem(KEY)?.trim() ?? "";
  sessionStorage.removeItem(KEY);
  return value;
}

export function clearPendingPrompt() {
  sessionStorage.removeItem(KEY);
}
