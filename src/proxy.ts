import { NextRequest, NextResponse } from "next/server";
// Optional gate protects the whole private demo, including API and account directory.
export function proxy(req: NextRequest) {
  const user = process.env.DEMO_GATE_USER;
  const password = process.env.DEMO_GATE_PASSWORD;
  if (!user && !password) return NextResponse.next();
  const expected = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  if (user && password && req.headers.get("authorization") === expected) return NextResponse.next();
  return new NextResponse("Private demo", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="AI Curator", charset="UTF-8"', "Cache-Control": "no-store" } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
