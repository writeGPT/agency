const companies: any[] = [];
const users: any[] = [];
const reports: any[] = [];

export const prisma = {
  user: {
    findUnique: async ({ where }: any) => users.find(u => u.id === where.id) || null,
    create: async ({ data }: any) => {
      const user = { id: data.id || `user_${Date.now()}`, ...data };
      users.push(user);
      return user;
    },
  },
  company: {
    findMany: async ({ where, select }: any = {}) => {
      // Simple filter for userId if provided
      if (where?.users?.some?.userId) {
        return companies
          .filter(c => c.users?.some((u: any) => u.userId === where.users.some.userId))
          .map(c => select ? Object.fromEntries(Object.entries(c).filter(([k]) => select[k])) : c);
      }
      return companies.map(c => select ? Object.fromEntries(Object.entries(c).filter(([k]) => select[k])) : c);
    },
    create: async ({ data }: any) => {
      const company = {
        id: `company_${Date.now()}_${Math.random()}`,
        ...data,
        users: data.users?.create ? [data.users.create] : [],
      };
      companies.push(company);
      return company;
    },
  },
  report: {
    create: async ({ data }: any) => {
      const report = { id: `report_${Date.now()}`, ...data };
      reports.push(report);
      return report;
    },
  },
} as any;
