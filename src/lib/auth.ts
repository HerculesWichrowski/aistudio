import { auth } from "@clerk/nextjs/server";
import { initDB } from "./db";
import { getProject, type Project } from "./projects";

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) return null;
  await initDB();
  return userId;
}

/** Returns the project only if the signed-in user owns it. */
export async function requireOwnedProject(projectId: string): Promise<
  | { ok: true; userId: string; project: Project }
  | { ok: false; response: Response }
> {
  const userId = await requireUser();
  if (!userId) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const project = await getProject(projectId);
  if (!project || project.user_id !== userId) {
    return { ok: false, response: Response.json({ error: "Not found" }, { status: 404 }) };
  }
  return { ok: true, userId, project };
}
