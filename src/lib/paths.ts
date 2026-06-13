/** Validates virtual file paths: relative, no traversal, no dotfiles. */
export function safePath(path: string) {
  return (
    path.length > 0 &&
    path.length < 300 &&
    !path.startsWith("/") &&
    !path.includes("..") &&
    !path.startsWith(".") &&
    !path.includes("\\")
  );
}
