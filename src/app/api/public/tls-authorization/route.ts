import { type NextRequest } from "next/server";
import { withApiPolicy } from "@/lib/api-policy";
import { isAllowedTlsHostname } from "@/lib/tenant-tls";
export const GET=withApiPolicy(async (request:NextRequest)=>{
  try {
    const allowed=await isAllowedTlsHostname(request.nextUrl.searchParams.get("domain") || "");
    return new Response(null,{status:allowed?204:403,headers:{"Cache-Control":"no-store"}});
  } catch {return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}});}
});
