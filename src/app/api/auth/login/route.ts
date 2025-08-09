import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Demo login
    if (email === 'demo@example.com' && password === 'demo') {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email, name: 'Demo User', passwordHash: await bcrypt.hash('demo', 10), role: 'ANALYST' },
        });
      }
      const session = await getSession();
      session.user = { id: (user as any).id, email: (user as any).email, name: (user as any).name };
      await session.save();
      return NextResponse.json({ success: true, user: session.user });
    }

    // Real user login
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(user as any).passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const isValid = await bcrypt.compare(password, (user as any).passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const session = await getSession();
    session.user = { id: (user as any).id, email: (user as any).email, name: (user as any).name };
    await session.save();
    return NextResponse.json({ success: true, user: session.user });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
