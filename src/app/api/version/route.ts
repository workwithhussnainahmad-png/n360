import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    version: process.env.NEXT_PUBLIC_BUILD_ID || 'dev'
  });
}
