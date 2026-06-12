import { NextRequest } from "next/server";
import { requireOwnedProject } from "@/lib/auth";
import { parseAppData, setAppData } from "@/lib/database";
import { updateProject } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const data = parseAppData(result.project.app_data);
  return Response.json({ data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const body = await req.json();
  if (!body.data || typeof body.data !== "object") {
    return Response.json({ error: "Expected { data: object }" }, { status: 400 });
  }

  await setAppData(id, body.data);
  return Response.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const body = await req.json();
  const { table, id: rowId, row } = body as {
    table?: string;
    id?: string;
    row?: Record<string, unknown>;
  };

  if (!table || !rowId || !row) {
    return Response.json({ error: "Expected { table, id, row }" }, { status: 400 });
  }

  const data = parseAppData(result.project.app_data);
  const rows = data[table] ?? [];
  const index = rows.findIndex((entry) => entry.id === rowId);
  if (index === -1) {
    return Response.json({ error: "Row not found" }, { status: 404 });
  }

  rows[index] = { ...rows[index], ...row, id: rowId };
  data[table] = rows;
  await setAppData(id, data);
  return Response.json({ ok: true, row: rows[index] });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const table = req.nextUrl.searchParams.get("table");
  const rowId = req.nextUrl.searchParams.get("id");
  if (!table || !rowId) {
    return Response.json({ error: "Expected table and id query params" }, { status: 400 });
  }

  const data = parseAppData(result.project.app_data);
  const rows = data[table] ?? [];
  data[table] = rows.filter((entry) => entry.id !== rowId);
  await setAppData(id, data);
  return Response.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if (!result.ok) return result.response;

  const body = await req.json();
  const { table, row } = body as { table?: string; row?: Record<string, unknown> };
  if (!table || !row) {
    return Response.json({ error: "Expected { table, row }" }, { status: 400 });
  }

  const data = parseAppData(result.project.app_data);
  const rows = [...(data[table] ?? []), row];
  data[table] = rows;
  await setAppData(id, data);
  await updateProject(id, {});
  return Response.json({ ok: true, row });
}
