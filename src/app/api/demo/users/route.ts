import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, noStore } from "@/lib/http";
import { ForbiddenError } from "@/lib/rbac";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (process.env.DEMO_AUTH_ENABLED !== "true") throw new ForbiddenError("Демонстрационный вход отключён");
    // Public demo directory intentionally exposes only the three switchable accounts.
    return NextResponse.json(await prisma.user.findMany({ where: { username: { in: ["client_1", "client_2", "admin"] } }, select: { id: true, username: true, role: true }, orderBy: { username: "asc" } }), { headers: noStore });
  } catch (e) { return apiError(e); }
}
