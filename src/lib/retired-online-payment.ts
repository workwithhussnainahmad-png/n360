import { NextResponse } from 'next/server';
export async function retiredOnlinePayment(_request: Request) {
  void _request;
  return NextResponse.json({ error: 'Online checkout is no longer available. Use an institution payment account and submit your screenshot and transaction ID for manual verification.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
