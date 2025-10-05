import { create } from "zustand";
import { persist } from 'zustand/middleware';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  progress?: number;
  error?: string;
};

export type Message = {
  id: string;
  type: "user" | "assistant" | "error" | "system";
  content: string;
  timestamp: number;
  files?: UploadedFile[];
  reportId?: string;
  charts?: any[];
};

export type Company = {
  id: string;
  name: string;
  industry?: string;
  context?: string;
};

export type Report = {
  id: string;
  content: string;
  charts?: any[];
  query?: string;
  timestamp?: number;
  editedContent?: string;
};

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
    sheets?: string[];
    pageCount?: number;
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

// ==========================================
// STORE IMPLEMENTATION
// ==========================================

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
      // IMPROVED: UPLOAD FILE WITH MULTI-FORMAT PARSING
      // ==========================================
      uploadFile: async (file) => {
        const fileId = Math.random().toString(36).substr(2, 9);
        const { uploadedFiles } = get();

        // Validate file size (10MB limit)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
          const errorFile: ProcessedFile = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'error',
            error: `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024}MB`,
          };

          set((state) => ({
            uploadedFiles: [...state.uploadedFiles, errorFile],
            error: errorFile.error,
          }));

          console.error(`❌ File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
          return;
        }

        // Check for duplicate files
        const isDuplicate = uploadedFiles.some(
          (f) => f.name === file.name && f.size === file.size && f.status !== 'error'
        );

        if (isDuplicate) {
          console.warn(`⚠️ Duplicate file detected: ${file.name}`);
          set({ error: `File "${file.name}" is already uploaded` });
          return;
        }

        // Create initial file entry
        const tempFile: ProcessedFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          status: 'uploading',
          progress: 0,
          rawFile: file,
        };

        set((state) => ({
          uploadedFiles: [...state.uploadedFiles, tempFile],
          error: null,
        }));

        console.log(`\n📤 Starting upload: ${file.name}`);
        console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`   Type: ${file.type}`);

        try {
          const formData = new FormData();
          formData.append('file', file);

          // Update progress - preparing
          get().updateFile(fileId, { progress: 20 });

          const response = await fetch('/api/parse-file', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          // Update progress - processing
          get().updateFile(fileId, { progress: 60 });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.error ||
                errorData.details ||
                `Server error: ${response.status}`
            );
          }

          const parsed = await response.json();

          // Update progress - finalizing
          get().updateFile(fileId, { progress: 90 });

          // Validate parsed content
          const hasContent = parsed.content || parsed.text;
          const hasTables = parsed.tables && parsed.tables.length > 0;
          const hasMetadata = parsed.metadata;

          if (!hasContent && !hasTables) {
            console.warn(`⚠️ File ${file.name} parsed but no extractable content found`);
          }

          // Determine file category for logging
          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const fileCategory =
            ['xlsx', 'xls'].includes(fileExt || '') ? 'Excel' :
            fileExt === 'pdf' ? 'PDF' :
            fileExt === 'docx' ? 'Word' :
            fileExt === 'csv' ? 'CSV' :
            'Text';

          // Update file with parsed content
          get().updateFile(fileId, {
            status: 'ready',
            progress: 100,
            content: parsed.content || parsed.text || '',
            parsedMetadata: {
              tables: parsed.tables || [],
              metadata: parsed.metadata,
              summary: parsed.summary,
              structured: parsed.structured,
              sheets: parsed.metadata?.sheets,
              pageCount: parsed.metadata?.pageCount,
            },
          });

          console.log(`✅ ${fileCategory} file parsed successfully: ${file.name}`);
          console.log(`   Content: ${(parsed.content || parsed.text || '').length} characters`);
          console.log(`   Tables: ${(parsed.tables || []).length}`);
          if (parsed.metadata?.sheets) {
            console.log(`   Sheets: ${parsed.metadata.sheets.join(', ')}`);
          }
          if (parsed.metadata?.pageCount) {
            console.log(`   Pages: ${parsed.metadata.pageCount}`);
          }
          console.log(`   Summary: ${parsed.summary || 'N/A'}`);

        } catch (error) {
          console.error(`❌ Failed to parse file ${file.name}:`, error);

          // Mark as error with detailed message
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Failed to parse file';

          get().updateFile(fileId, {
            status: 'error',
            progress: 0,
            error: errorMessage,
            rawFile: file, // Keep raw file as fallback
          });

          set({
            error: `Failed to parse ${file.name}: ${errorMessage}`,
          });
        }
      },

      // ==========================================
      // IMPROVED: SEND MESSAGE WITH ENHANCED FILE HANDLING
      // ==========================================
      sendMessage: async (query, includeGraphs) => {
        const state = get();

        // Validation: Company must be selected
        if (!state.selectedCompany) {
          set({ error: 'Please select a company first' });
          console.error('❌ No company selected');
          return;
        }

        // Analyze uploaded files
        const readyFiles = state.uploadedFiles.filter((f) => f.status === 'ready');
        const errorFiles = state.uploadedFiles.filter((f) => f.status === 'error');
        const uploadingFiles = state.uploadedFiles.filter((f) => f.status === 'uploading');

        // Warn about files with issues
        if (uploadingFiles.length > 0) {
          console.warn(`⚠️ ${uploadingFiles.length} file(s) still uploading - waiting...`);
          set({ error: 'Please wait for all files to finish uploading' });
          return;
        }

        if (errorFiles.length > 0) {
          console.warn(`⚠️ ${errorFiles.length} file(s) have errors and will be skipped:`);
          errorFiles.forEach((f) => console.warn(`   - ${f.name}: ${f.error}`));
        }

        // Create user message
        const userMessage: Message = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'user',
          content: query,
          timestamp: Date.now(),
          files:
            readyFiles.length > 0
              ? readyFiles.map((f) => ({
                  id: f.id,
                  name: f.name,
                  size: f.size,
                  status: f.status,
                  progress: f.progress,
                }))
              : undefined,
        };

        set((state) => ({
          messages: [...state.messages, userMessage],
          isLoading: true,
          error: null,
        }));

        try {
          const formData = new FormData();
          formData.append('query', query);
          formData.append('company', JSON.stringify(state.selectedCompany));
          formData.append('includeGraphs', includeGraphs.toString());
          formData.append('chatHistory', JSON.stringify(state.messages.slice(-10)));

          console.log(`\n🚀 Sending message to AI:`);
          console.log(`   Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
          console.log(`   Company: ${state.selectedCompany.name}`);
          console.log(`   Include graphs: ${includeGraphs}`);
          console.log(`   Files ready: ${readyFiles.length}`);
          console.log(`   Files with errors: ${errorFiles.length}`);

          // Categorize files by content availability
          const filesWithContent = readyFiles.filter(
            (f) => f.content || (f.parsedMetadata && f.parsedMetadata.tables && f.parsedMetadata.tables.length > 0)
          );
          const filesWithoutContent = readyFiles.filter(
            (f) => !f.content && !(f.parsedMetadata && f.parsedMetadata.tables && f.parsedMetadata.tables.length > 0)
          );

          // Send parsed content (preferred method)
          if (filesWithContent.length > 0) {
            const filesContent = filesWithContent.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              content: f.content || '',
              tables: f.parsedMetadata?.tables || [],
              metadata: f.parsedMetadata?.metadata,
              summary: f.parsedMetadata?.summary,
              sheets: f.parsedMetadata?.sheets,
              pageCount: f.parsedMetadata?.pageCount,
            }));

            formData.append('filesContent', JSON.stringify(filesContent));

            console.log(`📤 Sending ${filesContent.length} parsed file(s):`);
            filesContent.forEach((f) => {
              const contentInfo = f.content ? `${f.content.length} chars` : 'no text';
              const tablesInfo = f.tables?.length ? `${f.tables.length} tables` : 'no tables';
              console.log(`   ✓ ${f.name}: ${contentInfo}, ${tablesInfo}`);
            });
          }

          // Send raw files as fallback (if parsing failed but file is available)
          if (filesWithoutContent.length > 0) {
            for (const file of filesWithoutContent) {
              if (file.rawFile) {
                formData.append('files', file.rawFile);
                console.log(`📤 Sending raw file (fallback): ${file.name}`);
              }
            }
          }

          if (readyFiles.length === 0) {
            console.log(`ℹ️ No files attached to this message`);
          }

          // Make the API call
          console.log(`🌐 Calling /api/generate-report...`);
          const startTime = Date.now();

          const response = await fetch('/api/generate-report', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`⏱️ API response received in ${elapsed}s`);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.error ||
                errorData.message ||
                `Server error: ${response.status}`
            );
          }

          const data = await response.json();

          // Create AI response message
          const aiMessage: Message = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'assistant',
            content: data.content,
            timestamp: Date.now(),
            charts: data.charts,
            reportId: data.reportId,
          };

          // Create report object
          const report: Report = {
            id: data.reportId,
            content: data.content,
            charts: data.charts,
            query,
            timestamp: Date.now(),
          };

          set((state) => ({
            messages: [...state.messages, aiMessage],
            currentReport: report,
            uploadedFiles: [], // Clear all files after successful send
            isLoading: false,
            error: null,
          }));

          console.log(`✅ Report generated successfully`);
          console.log(`   Report ID: ${data.reportId}`);
          console.log(`   Content length: ${data.content.length} characters`);
          console.log(`   Charts: ${data.charts?.length || 0}`);
          console.log(`   Files cleared: ${readyFiles.length}`);

        } catch (error) {
          console.error('❌ Failed to generate report:', error);

          const errorMessage: Message = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'error',
            content:
              error instanceof Error
                ? error.message
                : 'Failed to generate report. Please try again.',
            timestamp: Date.now(),
          };

          set((state) => ({
            messages: [...state.messages, errorMessage],
            isLoading: false,
            error: error instanceof Error ? error.message : 'An error occurred',
          }));
        }
      },

      // ==========================================
      // SAVE REPORT
      // ==========================================
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

      // ==========================================
      // LOAD COMPANIES
      // ==========================================
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

      // ==========================================
      // LOGIN
      // ==========================================
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

      // ==========================================
      // CHECK AUTH
      // ==========================================
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