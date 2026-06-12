const KEY = "aistudio:pending-prompt";
const MODEL_KEY = "aistudio:pending-model";

/** Stash prompt only for the sign-in → create handoff (session-scoped). */
export function stashPendingPrompt(prompt: string, model?: string) {
  sessionStorage.setItem(KEY, prompt);
  if (model) sessionStorage.setItem(MODEL_KEY, model);
}

export function takePendingPrompt() {
  const value = sessionStorage.getItem(KEY)?.trim() ?? "";
  sessionStorage.removeItem(KEY);
  return value;
}

export function takePendingModel() {
  const value = sessionStorage.getItem(MODEL_KEY)?.trim() ?? "";
  sessionStorage.removeItem(MODEL_KEY);
  return value;
}

export function clearPendingPrompt() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(MODEL_KEY);
}
