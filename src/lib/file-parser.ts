// Basic file parser - simplified version
// This can be enhanced later with more sophisticated parsing libraries

export interface ParsedResult {
  text: string;
  tables?: any[];
  metadata?: any;
  summary?: string;
  structured?: any;
}

export class FileParser {
  static async parseFile(buffer: Buffer, filename: string): Promise<ParsedResult> {
    try {
      const extension = filename.toLowerCase().split('.').pop();
      
      switch (extension) {
        case 'txt':
          return this.parseText(buffer, filename);
        case 'csv':
          return this.parseCSV(buffer, filename);
        case 'json':
          return this.parseJSON(buffer, filename);
        default:
          return this.parseGeneric(buffer, filename);
      }
    } catch (error) {
      console.error(`Error parsing ${filename}:`, error);
      return {
        text: `Error parsing file: ${filename}`,
        metadata: { filename, error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }
  
  private static parseText(buffer: Buffer, filename: string): ParsedResult {
    const text = buffer.toString('utf-8');
    return {
      text,
      metadata: {
        filename,
        wordCount: text.split(/\s+/).length,
        charCount: text.length
      },
      summary: `Text file with ${text.length} characters`
    };
  }
  
  private static parseCSV(buffer: Buffer, filename: string): ParsedResult {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return { text: '', summary: 'Empty CSV file' };
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.trim())
    );
    
    const tables = [{
      name: filename.replace('.csv', ''),
      headers,
      rows: rows.slice(0, 100), // Limit for performance
      insights: {
        rowCount: rows.length,
        columnCount: headers.length,
        numericColumns: headers.filter((_, index) => 
          rows.some(row => row[index] && !isNaN(parseFloat(row[index])))
        ),
        categoricalColumns: headers.filter((_, index) => 
          rows.some(row => row[index] && isNaN(parseFloat(row[index])))
        )
      }
    }];
    
    return {
      text: `CSV file: ${filename}\nHeaders: ${headers.join(', ')}\nRows: ${rows.length}`,
      tables,
      metadata: {
        filename,
        rowCount: rows.length,
        columnCount: headers.length,
        headers
      },
      summary: `CSV file with ${rows.length} rows and ${headers.length} columns`
    };
  }
  
  private static parseJSON(buffer: Buffer, filename: string): ParsedResult {
    try {
      const text = buffer.toString('utf-8');
      const data = JSON.parse(text);
      
      return {
        text: JSON.stringify(data, null, 2),
        structured: data,
        metadata: {
          filename,
          type: 'JSON',
          keys: Array.isArray(data) ? `Array with ${data.length} items` : Object.keys(data).join(', ')
        },
        summary: `JSON file with structured data`
      };
    } catch (error) {
      return {
        text: buffer.toString('utf-8'),
        metadata: { filename, error: 'Invalid JSON' },
        summary: 'Invalid JSON file'
      };
    }
  }
  
  private static parseGeneric(buffer: Buffer, filename: string): ParsedResult {
    // Try to parse as text first
    try {
      const text = buffer.toString('utf-8');
      // Check if it's valid UTF-8 text
      if (text.includes('\uFFFD') || buffer.length !== Buffer.byteLength(text)) {
        throw new Error('Binary file');
      }
      
      return {
        text: text.substring(0, 10000), // Limit text size
        metadata: {
          filename,
          size: buffer.length,
          type: 'text'
        },
        summary: `Text-based file with ${text.length} characters`
      };
    } catch (error) {
      return {
        text: `Binary file: ${filename} (${buffer.length} bytes)`,
        metadata: {
          filename,
          size: buffer.length,
          type: 'binary'
        },
        summary: `Binary file with ${buffer.length} bytes`
      };
    }
  }
}