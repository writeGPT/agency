import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!(session as any).user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const query = formData.get('query') as string;
    const companyStr = formData.get('company') as string;
    const includeGraphs = formData.get('includeGraphs') === 'true';
    const chatHistoryStr = formData.get('chatHistory') as string;

    if (!query || !companyStr) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const company = JSON.parse(companyStr);
    const _chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : [];

    const mockContent = `
<h2>Monthly Marketing Report - ${company.name}</h2>
<p><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
<p><strong>Query:</strong> ${query}</p>
<h3>Executive Summary</h3>
<p>This month showed significant growth across all marketing channels with a 23% increase in overall engagement.</p>
<h3>Key Metrics</h3>
<ul>
  <li><strong>Website Traffic:</strong> 45,230 visits (+15% MoM)</li>
  <li><strong>Conversion Rate:</strong> 3.2% (+0.5% MoM)</li>
  <li><strong>Email Open Rate:</strong> 28% (+3% MoM)</li>
  <li><strong>Social Media Reach:</strong> 125,000 (+20% MoM)</li>
</ul>
<h3>Recommendations</h3>
<ol>
  <li>Increase investment in social media advertising</li>
  <li>Optimize email campaign timing</li>
  <li>Implement A/B testing for landing pages</li>
</ol>
`;

    let charts: any[] = [];
    if (includeGraphs) {
      charts = [{
        id: 'chart-1',
        type: 'bar',
        data: { labels: ['Jan', 'Feb', 'Mar', 'Apr'], datasets: [{ label: 'Traffic', data: [30000, 35000, 42000, 45230], backgroundColor: '#3B82F6' }] }
      }];
    }

    const report = await prisma.report.create({
      data: {
        content: mockContent,
        query: query,
        companyId: company.id,
        userId: (session as any).user.id,
        charts: charts.length > 0 ? JSON.stringify(charts) : null,
        status: 'PUBLISHED',
      },
    });

    return NextResponse.json({ content: mockContent, charts: charts, reportId: (report as any).id });

  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
