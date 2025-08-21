import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  const session = await getSession();
  
  if (!session.user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }
  
  try {
    const formData = await request.formData();
    const query = formData.get('query') as string;
    const companyStr = formData.get('company') as string;
    const includeGraphs = formData.get('includeGraphs') === 'true';
    const chatHistoryStr = formData.get('chatHistory') as string;
    
    if (!query || !companyStr) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const company = JSON.parse(companyStr);
    const chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : [];
    
    // Initialize Anthropic client with your API key
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!, // <-- API KEY USED HERE
    });
    
    // Build system prompt
    const systemPrompt = `You are an expert marketing analyst creating comprehensive reports for ${company.name}.
    
Your reports should be:
- Professional and data-driven with actionable insights
- Well-structured with clear HTML formatting
- Include executive summaries and key metrics
- Provide specific recommendations

Format your response as clean HTML using tags like: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>, <table>

${includeGraphs ? `When providing data that could be visualized, include a JSON block like this:
<<<CHART_START>>>
{
  "type": "bar",
  "data": {
    "labels": ["Label1", "Label2", "Label3"],
    "datasets": [{
      "label": "Dataset Name",
      "data": [10, 20, 30],
      "backgroundColor": "#3B82F6"
    }]
  }
}
<<<CHART_END>>>` : ''}

Do NOT use markdown. Generate proper HTML directly.`;
    
    // Build user message with any uploaded file content
    let userMessage = query;
    
    // If files were uploaded and parsed, add their content
    const files = formData.getAll('files');
    if (files.length > 0) {
      userMessage += '\n\nAnalyze the following data:\n';
      // Add file processing logic here
    }
    
    console.log('Calling Anthropic Claude API...');
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-7-sonnet-20250219', // or 'claude-opus-4-20250514' for better quality
        max_tokens: 4000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          ...chatHistory.slice(-5).map((msg: any) => ({
            role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content,
          })),
          { role: 'user' as const, content: userMessage }
        ],
      });
      
      // Extract the response content
      const aiContent = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
      
      // Process charts if they exist in the response
      let charts: any[] = [];
      let finalContent = aiContent;
      
      if (includeGraphs) {
        // Extract chart JSON from the response
        const chartRegex = /<<<CHART_START>>>([\s\S]*?)<<<CHART_END>>>/g;
        let match;
        let chartIndex = 0;
        
        while ((match = chartRegex.exec(aiContent)) !== null) {
          try {
            const chartData = JSON.parse(match[1]);
            charts.push({
              id: `chart-${Date.now()}-${chartIndex++}`,
              ...chartData
            });
            
            // Replace chart JSON with placeholder in content
            finalContent = finalContent.replace(
              match[0], 
              `<div class="chart-placeholder" data-chart-id="${charts[charts.length - 1].id}">
                [Chart: ${chartData.data?.datasets?.[0]?.label || 'Data Visualization'}]
              </div>`
            );
          } catch (e) {
            console.error('Failed to parse chart data:', e);
          }
        }
      }
      
      // Save the report to database
      const report = await prisma.report.create({
        data: {
          content: finalContent,
          query: query,
          companyId: company.id,
          userId: session.user.id,
          charts: charts.length > 0 ? JSON.stringify(charts) : null,
          status: 'PUBLISHED',
        },
      });
      const u = response.usage;
      const totalTokens =
      (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0);
      // Return the actual AI-generated content
      return NextResponse.json({
        content: finalContent,
        charts: charts,
        reportId: report.id,
        metadata: {
          model: response.model,
          tokensUsed: response.usage?.output_tokens || 0,
          inputTokens: response.usage?.input_tokens || 0,
          totalTokens: totalTokens,
        }
      });
      
    } catch (anthropicError: any) {
      console.error('Anthropic API Error:', anthropicError);
      
      // Handle specific Anthropic errors
      if (anthropicError.status === 401) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your ANTHROPIC_API_KEY in .env.local' },
          { status: 500 }
        );
      } else if (anthropicError.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      } else if (anthropicError.status === 400) {
        return NextResponse.json(
          { error: 'Invalid request to Anthropic API. Check your prompt.' },
          { status: 400 }
        );
      }
      
      // Generic error
      return NextResponse.json(
        { 
          error: 'Failed to generate report with AI',
          details: anthropicError.message 
        },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function parseUploadedFiles(files: File[]): Promise<string> {
  let combinedContent = '';
  
  for (const file of files) {
    if (file.type === 'text/plain' || file.type === 'text/csv') {
      const text = await file.text();
      combinedContent += `\n\nFile: ${file.name}\n${text}`;
    }
    // Add more file type handling as needed
  }
  
  return combinedContent;
}