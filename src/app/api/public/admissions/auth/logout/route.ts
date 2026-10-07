import { NextRequest, NextResponse } from 'next/server';
import { clearAdmissionSessionCookie } from '@/lib/admission-auth';

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearAdmissionSessionCookie(response, req.headers.get('host') || '');
  return response;
}
