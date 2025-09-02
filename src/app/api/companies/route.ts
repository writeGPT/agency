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
      // Create three demo companies if none exist for the user
      await prisma.company.create({
        data: {
          name: 'Pluxee',
          industry: 'Payments',
          context: 'Food Stamps',
          users: { create: { userId: (session as any).user.id, role: 'OWNER' } },
        },
      });
      await prisma.company.create({
        data: {
          name: 'Luca',
          industry: 'Food',
          context: 'Pastry',
          users: { create: { userId: (session as any).user.id, role: 'OWNER' } },
        },
      });
      await prisma.company.create({
        data: {
          name: 'Synology',
          industry: 'Hardware',
          context: 'Network Storage',
          users: { create: { userId: (session as any).user.id, role: 'OWNER' } },
        },
      });
      // Fetch the companies again after creation
      const newCompanies = await prisma.company.findMany({
        where: { users: { some: { userId: (session as any).user.id } } },
        select: { id: true, name: true, industry: true, context: true },
      });
      return NextResponse.json(newCompanies);
    }
    return NextResponse.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}
