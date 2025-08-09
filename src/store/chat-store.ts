import {create} from "zustand";

export type UploadedFile = { id: string; name: string; size: number; status: "uploading"|"ready"|"error"; progress?: number; error?: string };
export type Message = { id: string; type: "user"|"assistant"|"error"|"system"; content: string; timestamp: number; files?: UploadedFile[]; reportId?: string; charts?: any[] };
export type Company = { id: string; name: string; industry?: string; context?: string };
export type Report = { id: string; content: string; charts?: any[]; query?: string; timestamp?: number; editedContent?: string };

type ChatStore = {
  uploadedFiles: UploadedFile[];
  uploadFile: (f: File) => void;
  removeFile: (id: string) => void;
  messages: Message[];
  currentReport?: Report | null;
  selectedCompany?: Company | null;
  companies: Company[];
  isLoading: boolean;
  error?: string | null;
  isAuthenticated: boolean;
  setCompany: (c: Company) => void;
  sendMessage: (text: string, includeGraphs: boolean) => Promise<void>;
  clearChat: () => void;
  saveReport: (id: string, content: string) => Promise<void>;
  loadCompanies: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setReport: (r: Report) => void;
  login: (email: string, password: string) => Promise<void>;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  uploadedFiles: [],
  uploadFile: (f: File) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ uploadedFiles: [...s.uploadedFiles, { id, name: f.name, size: f.size, status: "ready" }] }));
  },
  removeFile: (id) => set((s) => ({ uploadedFiles: s.uploadedFiles.filter(x => x.id !== id) })),
  messages: [],
  currentReport: null,
  selectedCompany: null,
  companies: [],
  isLoading: false,
  error: null,
  isAuthenticated: false,
  setCompany: (c) => set({ selectedCompany: c }),
  setReport: (r) => set({ currentReport: r }),
  clearChat: () => set({ messages: [] }),
  checkAuth: async () => {
    try {
      const res = await fetch("/api/auth/check");
      set({ isAuthenticated: res.ok });
    } catch { set({ isAuthenticated: false }); }
  },
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");
      set({ isAuthenticated: true });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },
  loadCompanies: async () => {
    try {
      const res = await fetch("/api/companies");
      if (!res.ok) return;
      const companies: Company[] = await res.json();
      set({ companies, selectedCompany: companies[0] ?? null });
    } catch {}
  },
  sendMessage: async (text, includeGraphs) => {
    const st = get();
    if (!st.selectedCompany) { set({ error: "Select a company first" }); return; }
    const ts = Date.now();
    const userMsg: Message = { id: "m_"+ts, type: "user", content: text, timestamp: ts };
    set((s) => ({ messages: [...s.messages, userMsg], isLoading: true, error: null }));
    const fd = new FormData();
    fd.append("query", text);
    fd.append("company", JSON.stringify(st.selectedCompany));
    fd.append("includeGraphs", includeGraphs ? "true" : "false");
    fd.append("chatHistory", JSON.stringify(get().messages));

    try {
      const res = await fetch("/api/generate-report", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to generate report");
      const aMsg: Message = { id: "a_"+Date.now(), type: "assistant", content: data.content, timestamp: Date.now(), reportId: data.reportId, charts: data.charts };
      set((s) => ({ messages: [...s.messages, aMsg] }));
    } catch (e: any) {
      const err: Message = { id: "e_"+Date.now(), type: "error", content: e.message, timestamp: Date.now() };
      set((s) => ({ messages: [...s.messages, err], error: e.message }));
    } finally {
      set({ isLoading: false });
    }
  },
  saveReport: async (_id, content) => {
    set((s) => ({ currentReport: s.currentReport ? { ...s.currentReport, editedContent: content } : null }));
  },
}));
