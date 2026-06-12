const IGNORE_PATTERNS = [
  /ResizeObserver loop/i,
  /chrome-extension:/i,
  /moz-extension:/i,
  /safari-extension:/i,
  /^Script error\.?$/i,
  /Third-party cookie/i,
  /Feature Policy/i,
  /Permissions policy/i,
  /Unrecognized feature/i,
  /DevTools failed to load/i,
  /favicon\.ico/i,
  /\[Violation\]/i,
  /preloaded using link preload but not used/i,
];

/** Drop browser / platform noise; keep messages likely from the generated app. */
export function shouldCaptureConsole(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !IGNORE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
