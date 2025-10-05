import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

interface ParseResult {
  success: boolean;
  content: string;
  structured?: any;
  tables?: any[];
  metadata: {
    name: string;
    type: string;
    size: number;
    lastModified?: number;
    sheets?: string[];
    pageCount?: number;
  };
  summary: string;
  error?: string;
}

// Helper: Parse CSV with robust handling
function parseCSV(content: string, fileName: string): ParseResult['tables'] {
  try {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Smart CSV parsing - handle quoted fields
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    // Analyze columns
    const numericColumns = headers.filter((_, index) => 
      rows.slice(0, 10).every(row => {
        const val = row[index];
        return val && !isNaN(parseFloat(val));
      })
    );

    return [{
      name: fileName.replace('.csv', ''),
      headers,
      rows: rows.slice(0, 1000), // Limit for performance
      insights: {
        rowCount: rows.length,
        columnCount: headers.length,
        numericColumns,
        categoricalColumns: headers.filter(h => !numericColumns.includes(h)),
        preview: rows.slice(0, 5)
      }
    }];
  } catch (error) {
    console.error('CSV parsing error:', error);
    return [];
  }
}

// Helper: Parse Excel files
async function parseExcel(buffer: ArrayBuffer, fileName: string): Promise<Partial<ParseResult>> {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      cellStyles: true,
      cellFormula: false
    });

    const sheets = workbook.SheetNames;
    let allContent = '';
    const tables: any[] = [];
    let totalRows = 0;

    sheets.forEach((sheetName, sheetIndex) => {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON for structured data
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        blankrows: false
      }) as any[][];

      if (jsonData.length === 0) return;

      // Extract headers and data
      const headers = jsonData[0]?.map(h => String(h || '').trim()) || [];
      const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== ''));
      
      totalRows += rows.length;

      // Convert to CSV-like text for content
      const sheetText = XLSX.utils.sheet_to_csv(worksheet, { FS: ',' });
      allContent += `\n=== SHEET: ${sheetName} ===\n${sheetText}\n`;

      // Store structured table data
      if (headers.length > 0) {
        tables.push({
          name: sheetName,
          headers,
          rows: rows.slice(0, 1000), // Limit rows
          insights: {
            rowCount: rows.length,
            columnCount: headers.length,
            sheetIndex,
            preview: rows.slice(0, 5)
          }
        });
      }
    });

    return {
      content: allContent,
      tables,
      metadata: {
        name: fileName,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.byteLength,
        sheets
      },
      summary: `Excel file with ${sheets.length} sheet(s) and ${totalRows} total rows`
    };
  } catch (error) {
    console.error('Excel parsing error:', error);
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// New: PDF parser that avoids using the worker URL import (disables worker)
export async function parsePDFBuffer(buffer: ArrayBuffer | Buffer, fileName: string): Promise<ParseResult> {
  try {
    // dynamic import to avoid bundling worker URL at build time
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf');

    // Ensure we pass a Uint8Array to pdfjs
    const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer as Buffer);

    // disableWorker: true prevents pdfjs from trying to load an external worker file
    const loadingTask = pdfjs.getDocument({ data, disableWorker: true });
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages || 0;

    let content = '';
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item: any) => {
        // text items typically have `str`
        return item && typeof item.str === 'string' ? item.str : '';
      });
      content += strings.join(' ') + '\n\n';
    }

    return {
      success: true,
      content,
      structured: undefined,
      tables: [],
      metadata: {
        name: fileName,
        type: 'application/pdf',
        size: data.byteLength,
        pageCount
      },
      summary: content.slice(0, 1000)
    };
  } catch (error: any) {
    console.error('PDF parse error:', error);
    return {
      success: false,
      content: '',
      structured: undefined,
      tables: [],
      metadata: {
        name: fileName,
        type: 'application/pdf',
        size: 0
      },
      summary: '',
      error: String(error)
    };
  }
}

// Helper: Parse DOCX files
async function parseDOCX(buffer: ArrayBuffer, fileName: string): Promise<Partial<ParseResult>> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    
    return {
      content: result.value,
      metadata: {
        name: fileName,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: buffer.byteLength
      },
      summary: `Word document with ${result.value.length} characters extracted`
    };
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Main POST handler
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // File size validation (10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ 
        error: 'File too large',
        details: `Maximum file size is ${MAX_SIZE / 1024 / 1024}MB`
      }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const fileName = file.name.toLowerCase();
    const fileType = file.type;

    let result: ParseResult = {
      success: true,
      content: '',
      tables: [],
      metadata: {
        name: file.name,
        type: fileType,
        size: file.size,
        lastModified: file.lastModified
      },
      summary: ''
    };

    try {
      // Route to appropriate parser based on file type
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || 
          fileType.includes('spreadsheet') || fileType.includes('excel')) {
        // Excel files
        const parsed = await parseExcel(buffer, file.name);
        result = { ...result, ...parsed };
        
      } else if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
        // PDF files
        const parsed = await parsePDFBuffer(buffer, file.name);
        result = { ...result, ...parsed };
        
      } else if (fileName.endsWith('.docx') || 
                 fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Word documents
        const parsed = await parseDOCX(buffer, file.name);
        result = { ...result, ...parsed };
        
      } else if (fileName.endsWith('.doc') || fileType === 'application/msword') {
        // Legacy .doc files - requires different parser
        result.content = `Legacy .doc file: ${file.name}\n[Please convert to .docx format for full parsing support]`;
        result.summary = 'Legacy Word document - convert to .docx for better parsing';
        
      } else if (fileName.endsWith('.csv') || fileType === 'text/csv') {
        // CSV files
        const content = new TextDecoder().decode(buffer);
        result.content = content;
        result.tables = parseCSV(content, file.name);
        result.summary = `CSV file with ${result.tables[0]?.insights?.rowCount || 0} rows`;
        
      } else if (fileType.startsWith('text/') || fileName.endsWith('.txt')) {
        // Plain text files
        result.content = new TextDecoder().decode(buffer);
        result.summary = `Text file with ${result.content.length} characters`;
        
      } else {
        // Unsupported file type
        result.content = `File: ${file.name}\nType: ${fileType}\nSize: ${file.size} bytes\n\n[Unsupported file type - supported formats: .xlsx, .xls, .csv, .pdf, .docx, .txt]`;
        result.summary = 'Unsupported file type';
        result.error = 'Unsupported file format';
      }

      // Truncate content if too large (keep first 50KB for context)
      if (result.content && result.content.length > 50000) {
        const truncated = result.content.substring(0, 50000);
        result.content = truncated + '\n\n[Content truncated for performance - full data available in structured format]';
      }

      // Return successful parse result
      return NextResponse.json({
        success: true,
        content: result.content,
        text: result.content, // Alias for backwards compatibility
        structured: result.structured,
        tables: result.tables || [],
        metadata: result.metadata,
        summary: result.summary
      });
      
    } catch (parseError) {
      console.error('File parsing error:', parseError);
      
      // Return partial success with error details
      return NextResponse.json({
        success: false,
        content: `File: ${file.name}\nParsing Error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        structured: null,
        tables: [],
        metadata: result.metadata,
        summary: 'File uploaded but parsing failed',
        error: parseError instanceof Error ? parseError.message : 'Parsing failed'
      });
    }
    
  } catch (error) {
    console.error('Parse-file route error:', error);
    return NextResponse.json({
      error: 'Failed to process file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}