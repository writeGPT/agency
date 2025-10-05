import {create} from "zustand";
import { persist } from 'zustand/middleware';

export type UploadedFile = { id: string; name: string; size: number; status: "uploading"|"ready"|"error"; progress?: number; error?: string };
export type Message = { id: string; type: "user"|"assistant"|"error"|"system"; content: string; timestamp: number; files?: UploadedFile[]; reportId?: string; charts?: any[] };
export type Company = { id: string; name: string; industry?: string; context?: string };
export type Report = { id: string; content: string; charts?: any[]; query?: string; timestamp?: number; editedContent?: string };

export type ProcessedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "ready" | "error";
  progress?: number;
  error?: string;
  rawFile?: File;
  content?: string;
  parsedMetadata?: {
    tables?: any[];
    metadata?: any;
    summary?: string;
    structured?: any;
  };
};


interface ChatStore {
  messages: Message[];
  currentReport: Report | null;
  selectedCompany: Company | null;
  companies: Company[];
  uploadedFiles: ProcessedFile[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  
  // Actions
  addMessage: (message: Message) => void;
  setReport: (report: Report) => void;
  setCompany: (company: Company) => void;
  setCompanies: (companies: Company[]) => void;
  addFile: (file: ProcessedFile) => void;
  removeFile: (fileId: string) => void;
  updateFile: (fileId: string, updates: Partial<ProcessedFile>) => void;
  clearChat: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAuthenticated: (auth: boolean) => void;
  
  // Async actions
  sendMessage: (query: string, includeGraphs: boolean) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  saveReport: (reportId: string, content: string) => Promise<void>;
  loadCompanies: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial state
      messages: [],
      currentReport: null,
      selectedCompany: null,
      companies: [],
      uploadedFiles: [],
      isLoading: false,
      error: null,
      isAuthenticated: false,
      
      // Basic actions
      addMessage: (message) => set((state) => ({ 
        messages: [...state.messages, message] 
      })),
      
      setReport: (report) => set({ currentReport: report }),
      setCompany: (company) => set({ selectedCompany: company }),
      setCompanies: (companies) => set({ companies }),
      
      addFile: (file) => set((state) => ({ 
        uploadedFiles: [...state.uploadedFiles, file] 
      })),
      
      removeFile: (fileId) => set((state) => ({ 
        uploadedFiles: state.uploadedFiles.filter(f => f.id !== fileId) 
      })),
      
      updateFile: (fileId, updates) => set((state) => ({
        uploadedFiles: state.uploadedFiles.map(f => 
          f.id === fileId ? { ...f, ...updates } : f
        )
      })),
      
      clearChat: () => set({ 
        messages: [], 
        currentReport: null, 
        uploadedFiles: [],
        error: null 
      }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setAuthenticated: (auth) => set({ isAuthenticated: auth }),
      
      // ==========================================
      // FIXED: Send message with parsed file content
      // ==========================================
      sendMessage: async (query, includeGraphs) => {
        const state = get();
        
        if (!state.selectedCompany) {
          set({ error: 'Please select a company first' });
          return;
        }
        
        // Add user message
        const userMessage: Message = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'user',
          content: query,
          timestamp: new Date().getMilliseconds(),
          files: state.uploadedFiles.length > 0 ? [...state.uploadedFiles] : undefined,
        };
        
        set((state) => ({ 
          messages: [...state.messages, userMessage],
          isLoading: true,
          error: null 
        }));
        
        try {
          const formData = new FormData();
          formData.append('query', query);
          formData.append('company', JSON.stringify(state.selectedCompany));
          formData.append('includeGraphs', includeGraphs.toString());
          formData.append('chatHistory', JSON.stringify(state.messages.slice(-10)));
          
          // ==========================================
          // CRITICAL FIX: Send parsed content, not raw files
          // ==========================================
          
          console.log(`🔍 Debug: Total uploaded files: ${state.uploadedFiles.length}`);
          state.uploadedFiles.forEach((file, index) => {
            console.log(`  File ${index + 1}: ${file.name} - Status: ${file.status} - Has content: ${!!file.content} - Content length: ${file.content?.length || 0}`);
          });
          
          // Option 1: Send pre-parsed content (more efficient)
          if (state.uploadedFiles.some(f => f.content)) {
            const filesContent = state.uploadedFiles
              .filter(f => f.status === 'ready' && f.content)
              .map(f => ({
                name: f.name,
                content: f.content!.substring(0, 10000), // Limit size per file
                type: f.type,
                metadata: f.parsedMetadata
              }));
            
            formData.append('filesContent', JSON.stringify(filesContent));
            console.log(`📤 Sending ${filesContent.length} pre-parsed files`);
            console.log(`📋 Files content preview:`, filesContent.map(f => ({ name: f.name, contentLength: f.content.length })));
          } else {
            console.log('⚠️ No files with content found for pre-parsing option');
          }
          
          // Option 2: Send raw files for backend processing
          // Only if content wasn't pre-parsed
          const unparsedFiles = state.uploadedFiles.filter(f => f.rawFile && !f.content);
          for (const file of unparsedFiles) {
            if (file.rawFile) {
              formData.append('files', file.rawFile);
              console.log(`📤 Sending raw file: ${file.name}`);
            }
          }
          
          if (unparsedFiles.length === 0 && !state.uploadedFiles.some(f => f.content)) {
            console.log('🚨 WARNING: No files being sent - neither pre-parsed nor raw!');
          }
          
          // Make the API call
          const response = await fetch('/api/generate-report', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || error.message || 'Failed to generate report');
          }
          
          const data = await response.json();
          
          // Add AI response
          const aiMessage: Message = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'assistant',
            content: data.content,
            timestamp: new Date().getMilliseconds(),
            charts: data.charts,
            reportId: data.reportId
          };
          
          const report: Report = {
            id: data.reportId,
            content: data.content,
            charts: data.charts,
            query,
            timestamp: new Date().getMilliseconds(),
          };
          
          set((state) => ({ 
            messages: [...state.messages, aiMessage],
            currentReport: report,
            uploadedFiles: [], // Clear files after successful send
            isLoading: false 
          }));
          
          console.log(`✅ Report generated successfully`);
          
        } catch (error) {
          console.error('❌ Failed to generate report:', error);
          
          const errorMessage: Message = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'error',
            content: error instanceof Error ? error.message : 'Failed to generate report',
            timestamp: new Date().getMilliseconds(),
          };
          
          set((state) => ({ 
            messages: [...state.messages, errorMessage],
            isLoading: false,
            error: error instanceof Error ? error.message : 'An error occurred'
          }));
        }
      },
      
      // ==========================================
      // FIXED: Upload and parse file properly
      // ==========================================
      uploadFile: async (file) => {
        const fileId = Math.random().toString(36).substr(2, 9);
        
        // Create initial file entry
        const tempFile: ProcessedFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'uploading',
          progress: 0,
          rawFile: file, // Keep raw file for fallback
        };
        
        set((state) => ({ 
          uploadedFiles: [...state.uploadedFiles, tempFile] 
        }));
        
        try {
          // Try to parse the file
          const formData = new FormData();
          formData.append('file', file);
          
          // Update progress
          get().updateFile(fileId, { progress: 30 });
          
          const response = await fetch('/api/parse-file', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          
          get().updateFile(fileId, { progress: 70 });
          
          if (!response.ok) {
            throw new Error('Failed to parse file');
          }
          
          const parsed = await response.json();
          
          // Update file with parsed content
          get().updateFile(fileId, {
            status: 'ready',
            progress: 100,
            content: parsed.content || parsed.text,
            parsedMetadata: {
              tables: parsed.tables,
              metadata: parsed.metadata,
              summary: parsed.summary,
              structured: parsed.structured
            }
          });
          
          console.log(`✅ File parsed successfully: ${file.name}`);
          
        } catch (error) {
          console.error(`❌ Failed to parse file ${file.name}:`, error);
          
          // Fallback: Keep the raw file for backend processing
          get().updateFile(fileId, { 
            status: 'ready', // Mark as ready even if parsing failed
            progress: 100,
            error: 'Could not pre-parse file, will process on server',
            rawFile: file // Keep raw file for backend
          });
        }
      },
      
      saveReport: async (reportId, content) => {
        set({ isLoading: true });
        try {
          const response = await fetch(`/api/reports/${reportId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            credentials: 'include',
          });
          
          if (!response.ok) {
            throw new Error('Failed to save report');
          }
          
          set((state) => ({
            currentReport: state.currentReport ? {
              ...state.currentReport,
              content,
              editedContent: content,
            } : null,
            isLoading: false,
          }));
          
          console.log('✅ Report saved successfully');
        } catch (error) {
          console.error('❌ Failed to save report:', error);
          set({ 
            error: 'Failed to save report',
            isLoading: false 
          });
        }
      },
      
      loadCompanies: async () => {
        try {
          const response = await fetch('/api/companies', {
            credentials: 'include',
          });
          
          if (!response.ok) {
            throw new Error('Failed to fetch companies');
          }
          
          const companies = await response.json();
          set({ companies });
        } catch (error) {
          console.error('Failed to load companies:', error);
          set({ 
            companies: [
              { id: '1', name: 'Demo Company', context: 'Demo', industry: 'Technology' }
            ]
          });
        }
      },
      
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include',
          });
          
          if (!response.ok) {
            throw new Error('Invalid credentials');
          }
          
          set({ isAuthenticated: true, isLoading: false });
          await get().loadCompanies();
        } catch (error) {
          set({ 
            error: 'Invalid credentials',
            isLoading: false 
          });
        }
      },
      
      checkAuth: async () => {
        try {
          const response = await fetch('/api/auth/check', {
            credentials: 'include',
          });
          
          const isAuth = response.ok;
          set({ isAuthenticated: isAuth });
          
          if (isAuth) {
            await get().loadCompanies();
          }
        } catch (error) {
          set({ isAuthenticated: false });
        }
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        messages: state.messages.slice(-50),
        selectedCompany: state.selectedCompany,
      }),
    }
  )
);