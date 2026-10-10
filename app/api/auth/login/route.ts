import { setAdminSession, verifyAdminCredentials } from "@/app/admin-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin"), host = request.headers.get("host");
  if (origin && new URL(origin).host !== host) return Response.json({error:"Invalid request"},{status:403});
  let payload: unknown; try { payload = await request.json(); } catch { return Response.json({error:"Invalid request"},{status:400}); }
  const {username,password} = payload && typeof payload === "object" ? payload as {username?:unknown;password?:unknown} : {};
  if (typeof username !== "string" || typeof password !== "string" || username.length > 100 || password.length > 500) return Response.json({error:"Invalid credentials"},{status:401});
  try { if (!verifyAdminCredentials(username,password)) return Response.json({error:"Invalid credentials"},{status:401});
    await setAdminSession(); return Response.json({ok:true});
  } catch { return Response.json({error:"Admin login is not configured"},{status:503}); }
}
