import { NextResponse } from "next/server";
import { z } from "zod";
import { actorFromRequest, readJson, apiError, noStore } from "@/lib/http";
import { identifier } from "@/lib/validation";
import { chatWithAgent } from "@/services/agentService";
import { getChatHistory } from "@/services/memoryService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const body = z.object({ targetUserId: identifier, sessionId: identifier, message: z.string().trim().min(1).max(6000) }).strict();
export async function POST(req: Request) {
  try {
    const actorUserId = actorFromRequest(req);
    const input = body.parse(await readJson(req));
    return NextResponse.json(await chatWithAgent({ actorUserId, ...input }), { headers: noStore });
  } catch (e) { return apiError(e); }
}
export async function GET(req: Request) {
  try {
    const actor = actorFromRequest(req);
    const params = new URL(req.url).searchParams;
    const history = await getChatHistory(actor, identifier.parse(params.get("targetUserId")), identifier.parse(params.get("sessionId")));
    return NextResponse.json(history, { headers: noStore });
  } catch (e) { return apiError(e); }
}
