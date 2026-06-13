import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { composeApp } from "@/lib/compose";
import { listFiles } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

function fileSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "app"
  );
}

/**
 * Downloads the app as one self-contained HTML file — the same document the
 * preview serves, so window.ai / window.db keep working from anywhere (they
 * call back to this deployment with absolute URLs).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const files = (await listFiles(id)) as unknown as { path: string; content: string }[];
  const html = composeApp(files, new URL(req.url).origin, id);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSlug(result.project.name)}.html"`,
    },
  });
}
