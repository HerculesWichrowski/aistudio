import { defaultModel, listModelOptions } from "@/lib/openrouter";

export async function GET() {
  const models = await listModelOptions(null);
  return Response.json({
    defaultModel: defaultModel(null),
    models,
  });
}
