import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

// ==========================================
// CRITICAL: Configure Next.js to handle file uploads
// ==========================================
export const runtime = 'nodejs'; // Use Node.js runtime, not Edge
export const maxDuration = 60; // Allow 60 seconds for processing

export async function POST(request: NextRequest) {
  console.log('📥 Report generation request received');
  
  try {
    // Check authentication
    const session = await getSession();
    if (!session.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // ==========================================
    // STEP 1: Parse the multipart form data
    // ==========================================
    const formData = await request.formData();
    
    // Extract fields
    const query = formData.get('query') as string;
    const companyStr = formData.get('company') as string;
    const includeGraphs = formData.get('includeGraphs') === 'true';
    const chatHistoryStr = formData.get('chatHistory') as string;
    
    // CRITICAL FIX: Get the parsed content that frontend already processed
    const filesContentStr = formData.get('filesContent') as string;
    
    if (!query || !companyStr) {
      return NextResponse.json(
        { error: 'Missing query or company' },
        { status: 400 }
      );
    }
    
    const company = JSON.parse(companyStr);
    const chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : [];
    const filesContent = filesContentStr ? JSON.parse(filesContentStr) : [];
    
    console.log(`🏢 Company: ${company.name}`);
    console.log(`📄 Query: ${query.substring(0, 100)}...`);
    console.log(`📁 Files content: ${filesContent.length} pre-parsed files`);
    
    // DEBUG: Log the actual filesContent to see what we're getting
    if (filesContent.length > 0) {
      console.log('📋 Pre-parsed files details:');
      filesContent.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name} (${file.content?.length || 0} chars)`);
        console.log(`     Content preview: ${file.content?.substring(0, 200)}...`);
      });
    }
    
    // ==========================================
    // STEP 2: Process uploaded files (if any raw files sent)
    // ==========================================
    const files = formData.getAll('files') as File[];
    const uploadedFiles: File[] = [];
    
    // Collect any raw files that weren't pre-parsed
    for (const file of files) {
      if (file && file instanceof File) {
        uploadedFiles.push(file);
        console.log(`📎 Raw file: ${file.name} (${file.size} bytes)`);
      }
    }
    
    // ==========================================
    // STEP 3: Build document context
    // ==========================================
    let documentsContext = '';
    
    // OPTION 1: Use pre-parsed content from frontend (preferred)
    if (filesContent.length > 0) {
      documentsContext = formatPreParsedContent(filesContent);
      console.log(`✅ Using ${filesContent.length} pre-parsed files`);
      console.log(`📄 Document context sample: ${documentsContext.substring(0, 300)}...`);
    }
    // OPTION 2: Process raw files on backend (fallback)
    else if (uploadedFiles.length > 0) {
      documentsContext = await processMultipleFiles(uploadedFiles);
      console.log(`✅ Processed ${uploadedFiles.length} raw files on backend`);
      console.log(`📄 Document context sample: ${documentsContext.substring(0, 300)}...`);
    } else {
      console.log('⚠️ No files found - neither pre-parsed nor raw files');
    }
    
    console.log(`📄 Final document context: ${documentsContext.length} characters`);
    
    // CRITICAL: Log if no document context was found
    if (documentsContext.length === 0) {
      console.log('🚨 WARNING: No document context found! AI will respond without file data.');
    }
    
    // ==========================================
    // STEP 4: Generate report with Claude
    // ==========================================
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    
    const systemPrompt = buildSystemPrompt(company, includeGraphs);
    const userMessage = buildUserMessage(query, documentsContext, includeGraphs);
    
    console.log('🤖 Calling Anthropic Claude...');
    console.log(`📝 System prompt length: ${systemPrompt.length} characters`);
    console.log(`📝 User message length: ${userMessage.length} characters`);
    
    // DEBUG: Log the user message to verify document context is included
    if (documentsContext.length > 0) {
      console.log('✅ Document context IS included in user message');
      console.log(`📄 User message preview: ${userMessage.substring(0, 500)}...`);
    } else {
      console.log('❌ Document context is EMPTY - AI will not have file data!');
    }
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          ...formatChatHistory(chatHistory),
          { role: 'user', content: userMessage }
        ],
      });
      
      // Extract response
      const aiContent = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
      
      console.log(`✅ AI response received: ${aiContent.length} characters`);
      
      // ==========================================
      // STEP 5: Process charts if requested
      // ==========================================
      let finalContent = aiContent;
      let charts: any[] = [];
      
      if (includeGraphs) {
        const result = extractChartsFromContent(aiContent);
        finalContent = result.content;
        charts = result.charts;
        console.log(`📊 Extracted ${charts.length} charts`);
      }
      
      // ==========================================
      // STEP 6: Save to database
      // ==========================================
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
      
      console.log(`💾 Report saved with ID: ${report.id}`);
      
      // Return success response
      return NextResponse.json({
        success: true,
        content: finalContent,
        charts: charts,
        reportId: report.id,
        metadata: {
          model: response.model,
          tokensUsed: response.usage?.output_tokens || 0,
          inputTokens: response.usage?.input_tokens || 0,
          processingTime: Date.now(),
          filesProcessed: uploadedFiles.length,
        }
      });
      
    } catch (anthropicError: any) {
      console.error('❌ Anthropic API Error:', anthropicError);
      
      if (anthropicError.status === 401) {
        return NextResponse.json({
          error: 'Invalid API key. Please check your ANTHROPIC_API_KEY in .env.local',
          code: 'INVALID_API_KEY'
        }, { status: 500 });
      } else if (anthropicError.status === 429) {
        return NextResponse.json({
          error: 'Rate limit exceeded. Please try again in a few moments.',
          code: 'RATE_LIMIT'
        }, { status: 429 });
      } else if (anthropicError.status === 400) {
        return NextResponse.json({
          error: 'Request too large or invalid. Try with fewer files.',
          code: 'INVALID_REQUEST',
          details: anthropicError.message
        }, { status: 400 });
      }
      
      throw anthropicError;
    }
    
  } catch (error) {
    console.error('❌ Report generation error:', error);
    
    return NextResponse.json({
      error: 'Failed to generate report',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'GENERATION_ERROR'
    }, { status: 500 });
  }
}

// ==========================================
// FILE PROCESSING FUNCTIONS
// ==========================================

/**
 * Process multiple files of different types (fallback)
 */
async function processMultipleFiles(files: File[]): Promise<string> {
  const results: string[] = [];
  
  for (const file of files) {
    try {
      const content = await file.text();
      results.push(`\n=== ${file.name} ===\n${content.substring(0, 5000)}`);
    } catch (error) {
      console.error(`Failed to read file ${file.name}:`, error);
      results.push(`\n=== ${file.name} ===\n[Error: Could not read file]`);
    }
  }
  
  return results.join('\n');
}

/**
 * Format pre-parsed content from frontend
 */
function formatPreParsedContent(filesContent: any[]): string {
  const sections: string[] = [];
  
  sections.push('📄 UPLOADED FILES DATA:');
  sections.push('');
  
  filesContent.forEach((file, index) => {
    sections.push(`📋 FILE ${index + 1}: ${file.name}`);
    sections.push('─'.repeat(60));
    
    // Add file metadata if available
    if (file.metadata) {
      sections.push('📊 File Information:');
      if (file.metadata.size) sections.push(`• Size: ${file.metadata.size} bytes`);
      if (file.metadata.type) sections.push(`• Type: ${file.metadata.type}`);
      if (file.metadata.rowCount) sections.push(`• Rows: ${file.metadata.rowCount}`);
      if (file.metadata.columnCount) sections.push(`• Columns: ${file.metadata.columnCount}`);
      sections.push('');
    }
    
    // Add the actual content
    sections.push('📄 Content:');
    sections.push(file.content || '[No content available]');
    sections.push('');
    sections.push('='.repeat(80));
    sections.push('');
  });
  
  return sections.join('\n');
}

/**
 * Build system prompt for Claude
 */
function buildSystemPrompt(company: any, includeGraphs: boolean): string {
  return `You are an expert analyst creating comprehensive reports for ${company.name}, a ${company.industry || 'company'} focused on ${company.context || 'business operations'}.

CRITICAL INSTRUCTIONS:
1. ALWAYS prioritize and reference the uploaded document data when provided
2. Base your analysis on SPECIFIC data points, numbers, and metrics from the files
3. If data is provided, DO NOT make up or assume information - use only what's in the documents
4. Identify patterns, trends, and insights directly from the uploaded data
5. Quote specific figures, percentages, and metrics from the documents

Your role is to:
1. Analyze all provided documents and data holistically
2. Extract specific insights from the actual data provided
3. Identify patterns, trends, and correlations in the uploaded files
4. Reconcile any conflicting information between documents
5. Generate actionable insights based on the real data

When document data is provided:
- Reference specific numbers, percentages, and metrics from the files
- Create analysis based on the actual data patterns
- Highlight key findings that emerge from the uploaded content
- Compare different data sources if multiple files are provided
- Use the uploaded data as the foundation for all recommendations

When multiple documents are provided:
- Treat them as a connected set of information
- Look for relationships and correlations between different data sources
- Prioritize recent data over older data when conflicts arise
- Combine narrative documents with data files to provide complete context

Output format:
- Use clean HTML tags: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>, <table>
- Structure your report with clear sections
- Include an executive summary at the beginning
- Provide specific, actionable recommendations
- Always cite specific data points from the uploaded files

${includeGraphs ? `
When you identify data suitable for visualization from the uploaded files, include chart specifications in this format:
<<<CHART_START>>>
{
  "type": "bar|line|pie|doughnut",
  "title": "Chart Title",
  "data": {
    "labels": ["Label1", "Label2", "Label3"],
    "datasets": [{
      "label": "Series Name",
      "data": [10, 20, 30],
      "backgroundColor": "#3B82F6"
    }]
  }
}
<<<CHART_END>>>
` : ''}

Remember: You have access to specific uploaded file content. Use this data as the PRIMARY source for your analysis and insights. Reference specific numbers and details from the files.`;
}

/**
 * Build user message with document context
 */
function buildUserMessage(query: string, documentsContext: string, includeGraphs: boolean): string {
  const parts: string[] = [];
  
  // Make document context the primary focus
  if (documentsContext && documentsContext.trim().length > 0) {
    parts.push('='.repeat(80));
    parts.push('📊 UPLOADED DOCUMENT DATA - ANALYZE THIS CONTENT:');
    parts.push('='.repeat(80));
    parts.push('');
    parts.push(documentsContext);
    parts.push('');
    parts.push('='.repeat(80));
    parts.push('📋 USER REQUEST BASED ON THE ABOVE DATA:');
    parts.push('='.repeat(80));
    parts.push(query);
    parts.push('');
    parts.push('⚠️ IMPORTANT: Base your analysis PRIMARILY on the uploaded document data above.');
    parts.push('Create insights, trends, and recommendations using the specific data provided.');
    parts.push('Reference specific numbers, metrics, and details from the uploaded files.');
    
    if (includeGraphs && (documentsContext.includes('Table') || documentsContext.includes('CSV') || documentsContext.includes('rows'))) {
      parts.push('📊 Create visualizations from the data tables in the uploaded files.');
    }
  } else {
    parts.push('USER REQUEST:');
    parts.push(query);
    parts.push('');
    parts.push('⚠️ Note: No specific document data was provided. Please create a general analysis based on the company context.');
  }
  
  return parts.join('\n');
}

/**
 * Format chat history for Claude
 */
function formatChatHistory(history: any[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .slice(-10) // Keep last 10 messages for context
    .filter(msg => msg.type === 'user' || msg.type === 'assistant')
    .map(msg => ({
      role: msg.type as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
}

/**
 * Extract chart specifications from AI response
 */
function extractChartsFromContent(content: string): { content: string; charts: any[] } {
  const charts: any[] = [];
  let processedContent = content;
  
  // Find all chart specifications
  const chartRegex = /<<<CHART_START>>>([\s\S]*?)<<<CHART_END>>>/g;
  let match;
  let chartIndex = 0;
  
  while ((match = chartRegex.exec(content)) !== null) {
    try {
      const chartSpec = JSON.parse(match[1]);
      
      // Validate and enhance chart specification
      const chart = {
        id: `chart-${Date.now()}-${chartIndex++}`,
        type: chartSpec.type || 'bar',
        title: chartSpec.title || `Chart ${chartIndex}`,
        data: {
          labels: chartSpec.data?.labels || [],
          datasets: (chartSpec.data?.datasets || []).map((ds: any) => ({
            label: ds.label || 'Data',
            data: ds.data || [],
            backgroundColor: ds.backgroundColor || generateColors(ds.data?.length || 0),
            borderColor: ds.borderColor || generateColors(ds.data?.length || 0, 1),
            borderWidth: ds.borderWidth || 1
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: chartSpec.title || ''
            },
            legend: {
              display: true,
              position: 'top'
            }
          },
          ...chartSpec.options
        }
      };
      
      charts.push(chart);
      
      // Replace chart JSON with placeholder in content
      processedContent = processedContent.replace(
        match[0],
        `<div class="chart-container" data-chart-id="${chart.id}">
          <p class="text-center text-gray-500 italic">[Chart: ${chart.title}]</p>
        </div>`
      );
      
    } catch (error) {
      console.error('Failed to parse chart specification:', error);
      // Replace with error message
      processedContent = processedContent.replace(
        match[0],
        '<p class="text-red-500">⚠️ Failed to render chart</p>'
      );
    }
  }
  
  return { content: processedContent, charts };
}

/**
 * Generate color palette for charts
 */
function generateColors(count: number, alpha: number = 0.6): string[] {
  const baseColors = [
    `rgba(59, 130, 246, ${alpha})`,  // Blue
    `rgba(16, 185, 129, ${alpha})`,  // Green
    `rgba(251, 146, 60, ${alpha})`,  // Orange
    `rgba(147, 51, 234, ${alpha})`,  // Purple
    `rgba(236, 72, 153, ${alpha})`,  // Pink
    `rgba(245, 158, 11, ${alpha})`,  // Amber
    `rgba(6, 182, 212, ${alpha})`,   // Cyan
    `rgba(239, 68, 68, ${alpha})`,   // Red
    `rgba(107, 114, 128, ${alpha})`, // Gray
    `rgba(34, 197, 94, ${alpha})`    // Emerald
  ];
  
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
}