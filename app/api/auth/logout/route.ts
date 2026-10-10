import { clearAdminSession } from "@/app/admin-auth";
export async function POST(request:Request) { const origin=request.headers.get("origin"),host=request.headers.get("host");if(origin&&new URL(origin).host!==host)return Response.json({error:"Invalid request"},{status:403});await clearAdminSession();return Response.json({ok:true}); }
