export const prisma = {
  user: {
    findUnique: async (_args: any) => null,
    create: async ({ data }: any) => ({ id: "user_demo", ...data }),
  },
  company: {
    findMany: async (_args: any) => [],
    create: async ({ data }: any) => ({ id: "company_demo", ...data }),
  },
  report: {
    create: async ({ data }: any) => ({ id: "report_demo", ...data }),
  },
} as any;
