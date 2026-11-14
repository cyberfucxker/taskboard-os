import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, status: 'unhealthy', error: (e as Error).message }, { status: 503 });
  }
}