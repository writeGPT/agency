import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Basic file parsing - can be enhanced later with proper document processors
    let content = '';
    let structured = null;
    let tables: any[] = [];
    let metadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    };
    
    try {
      // For text-based files, extract content
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
        const buffer = await file.arrayBuffer();
        content = new TextDecoder().decode(buffer);
        
        // Basic CSV detection and parsing
        if (file.name.endsWith('.csv') || file.type === 'text/csv') {
          const lines = content.split('\n').filter(line => line.trim());
          if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.trim());
            const rows = lines.slice(1).map(line => 
              line.split(',').map(cell => cell.trim())
            );
            
            tables.push({
              name: file.name.replace('.csv', ''),
              headers,
              rows: rows.slice(0, 100), // Limit rows for performance
              insights: {
                rowCount: rows.length,
                columnCount: headers.length,
                numericColumns: headers.filter((_, index) => 
                  rows.some(row => !isNaN(parseFloat(row[index])))
                ),
                categoricalColumns: headers.filter((_, index) => 
                  rows.some(row => isNaN(parseFloat(row[index])))
                )
              }
            });
          }
        }
      } else {
        // For other file types, provide basic info
        content = `File: ${file.name} (${file.type})\nSize: ${file.size} bytes\n[Binary file - content not extracted]`;
      }
      
      // Generate summary
      const summary = content.length > 0 
        ? `File contains ${content.length} characters${tables.length > 0 ? ` and ${tables.length} data table(s)` : ''}`
        : 'Binary file uploaded successfully';
      
      return NextResponse.json({
        success: true,
        content: content.substring(0, 10000), // Limit content size
        structured,
        tables,
        metadata,
        summary
      });
      
    } catch (parseError) {
      console.error('File parsing error:', parseError);
      return NextResponse.json({
        success: true,
        content: `File: ${file.name}\nError: Could not parse file content`,
        structured: null,
        tables: [],
        metadata,
        summary: 'File uploaded but could not be parsed'
      });
    }
    
  } catch (error) {
    console.error('Parse-file error:', error);
    return NextResponse.json({
      error: 'Failed to parse file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
