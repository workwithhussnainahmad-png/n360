import { NextResponse } from "next/server";

/**
 * Compatibility response for obsolete clients. The supported fee workflow is
 * `/api/student/fees`, where a payment is tied to an issued challan and must be
 * verified by the institution. Keeping a clear 410 for one release is safer
 * than silently accepting unverified voucher images.
 */
function retired() {
  return NextResponse.json(
    {
      error: "The old fee-voucher upload has been retired. Update the app and use Fees.",
      replacement: "/api/student/fees",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = retired;
export const POST = retired;
