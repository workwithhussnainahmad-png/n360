import { NextResponse } from 'next/server';
import { db } from '@/db';
import { systemSettings } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await db.select().from(systemSettings).limit(1);
    
    // If not set yet, return default
    if (!settings.length) {
      return NextResponse.json({ version: '1.0.0' });
    }

    return NextResponse.json({ version: settings[0].mobileAppVersion });
  } catch (error) {
    console.error('Error fetching mobile app version:', error);
    return NextResponse.json({ version: '1.0.0' }); // Fallback
  }
}
