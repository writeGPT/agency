import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (session.user) {
    return NextResponse.json({ authenticated: true, user: session.user });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}