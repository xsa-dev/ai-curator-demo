import { NextResponse } from "next/server";
import { actorFromRequest, apiError, noStore } from "@/lib/http";
import { getAllUsersWithMemories } from "@/services/memoryService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return NextResponse.json(await getAllUsersWithMemories(actorFromRequest(req)), { headers: noStore }); }
  catch (e) { return apiError(e); }
}
