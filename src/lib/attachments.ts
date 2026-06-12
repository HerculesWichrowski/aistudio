export type ChatAttachment = { name: string; content: string };

export function formatUserRequestWithAttachments(content: string, attachments: ChatAttachment[]) {
  const trimmed = content.trim();
  if (!attachments.length) return trimmed;

  const block = attachments
    .map((file) => `--- ${file.name} ---\n${file.content}`)
    .join("\n\n");

  if (trimmed) return `${trimmed}\n\n## Attached files\n${block}`;
  return `## Attached files\n${block}`;
}
