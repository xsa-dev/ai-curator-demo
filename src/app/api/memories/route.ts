import { NextResponse } from "next/server";
import { z } from "zod";
import { actorFromRequest, readJson, apiError, noStore } from "@/lib/http";
import { identifier, memoryInput } from "@/lib/validation";
import { getMemories, upsertMemory, deleteMemory } from "@/services/memoryService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const actor = actorFromRequest(req);
    const target = identifier.parse(new URL(req.url).searchParams.get("targetUserId"));
    return NextResponse.json(await getMemories(actor, target), { headers: noStore });
  } catch (e) { return apiError(e); }
}
export async function PUT(req: Request) {
  try {
    const actor = actorFromRequest(req);
    const { targetUserId, key, value } = memoryInput.extend({ targetUserId: identifier }).parse(await readJson(req));
    return NextResponse.json(await upsertMemory(actor, targetUserId, key, value), { headers: noStore });
  } catch (e) { return apiError(e); }
}
export async function DELETE(req: Request) {
  try {
    const actor = actorFromRequest(req);
    const { targetUserId, key } = z.object({ targetUserId: identifier, key: identifier }).strict().parse(await readJson(req));
    return NextResponse.json(await deleteMemory(actor, targetUserId, key), { headers: noStore });
  } catch (e) { return apiError(e); }
}
