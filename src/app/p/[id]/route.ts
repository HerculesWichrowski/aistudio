import { NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { initDB } from "@/lib/db";
import { canViewApp, getProject, listFiles } from "@/lib/projects";
import { composeApp } from "@/lib/compose";

const DENIED_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Not available</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0a0a0a;color:#ededed;font:15px ui-sans-serif,system-ui}div{text-align:center;color:#8a8a8a}a{color:#ededed}</style>
</head><body><div><p>This app is private or you don't have access.</p><p><a href="/">Go to aistudio</a></p></div></body></html>`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await initDB();
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    return new Response(DENIED_PAGE, { status: 404, headers: { "Content-Type": "text/html" } });
  }

  if (project.visibility !== "public") {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    if (!canViewApp(project, { userId, email })) {
      return new Response(DENIED_PAGE, { status: 403, headers: { "Content-Type": "text/html" } });
    }
  }

  const files = (await listFiles(id)) as unknown as { path: string; content: string }[];
  const html = composeApp(files, new URL(req.url).origin, id);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Run the generated app in an opaque origin so it can never touch
      // aistudio cookies or APIs with the viewer's credentials.
      "Content-Security-Policy":
        "sandbox allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads",
    },
  });
}
