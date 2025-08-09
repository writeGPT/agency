import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!(session as any).user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  try {
    const companies = await prisma.company.findMany({
      where: { users: { some: { userId: (session as any).user.id } } },
      select: { id: true, name: true, industry: true, context: true },
    });

    if (companies.length === 0) {
      const demoCompany = await prisma.company.create({
        data: {
          name: 'Demo Company',
          industry: 'Technology',
          context: 'B2B SaaS',
          users: { create: { userId: (session as any).user.id, role: 'OWNER' } },
        },
      });
      (companies as any).push({ id: (demoCompany as any).id, name: demoCompany.name, industry: demoCompany.industry, context: demoCompany.context });
    }
    return NextResponse.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}
