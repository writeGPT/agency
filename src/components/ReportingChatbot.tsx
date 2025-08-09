'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, Send, RotateCcw, Building2, FileText, X, ChevronDown, 
  Loader2, BarChart3, AlertCircle, Save, Check, Edit2, Eye 
} from 'lucide-react';
import { useChatStore } from '../store/chat-store';
import type { Report } from '../types';

// Chart Renderer Component
const ChartRenderer: React.FC<{ chart: any }> = ({ chart }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const barWidth = width / chart.data.labels.length;
    chart.data.datasets[0].data.forEach((value: number, index: number) => {
      const max = Math.max(...chart.data.datasets[0].data);
      const barHeight = (value / (max || 1)) * (height - 40);
      ctx.fillStyle = '#3B82F6';
      ctx.fillRect(index * barWidth + 10, height - barHeight - 20, barWidth - 20, barHeight);
      ctx.fillStyle = '#000';
      ctx.font = '10px sans-serif';
      ctx.fillText(chart.data.labels[index], index * barWidth + barWidth / 2 - 10, height - 5);
    });
  }, [chart]);
  return (
    <div className="w-full h-64 mb-4 border rounded p-2">
      <canvas ref={canvasRef} width={600} height={250} className="w-full h-full" />
    </div>
  );
};

// Simple Editor Component
const SimpleEditor: React.FC<{
  content: string;
  isEditing: boolean;
  onSave: (content: string) => void;
  onEdit: () => void;
}> = ({ content, isEditing, onSave, onEdit }) => {
  const [editedContent, setEditedContent] = useState(content);
  useEffect(() => { setEditedContent(content); }, [content]);
  const handleSave = () => onSave(editedContent);
  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-2 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold">Report Editor</h3>
        <div className="flex gap-2">
          {!isEditing ? (
            <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          ) : (
            <>
              <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                <Save className="w-4 h-4" /> Save
              </button>
              <button onClick={() => onEdit()} className="flex items-center gap-1 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700">
                <Eye className="w-4 h-4" /> View
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="w-full h-full p-4 border rounded font-mono text-sm" />
        ) : (
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: editedContent }} />
        )}
      </div>
    </div>
  );
};

// File Upload Component
const FileUploadZone: React.FC = () => {
  const { uploadedFiles, uploadFile, removeFile } = useChatStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const handleFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(file => {
      const validTypes = ['application/pdf', 'text/csv', 'text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|csv|txt|xlsx|docx)$/i)) { console.error('Invalid file type:', file.name); return; }
      if (file.size > 10 * 1024 * 1024) { console.error('File too large:', file.name); return; }
      uploadFile(file);
    });
  }, [uploadFile]);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  return (
    <div className={`border-2 border-dashed rounded-lg p-4 transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.csv,.txt,.xlsx,.docx"
        onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" />
      {uploadedFiles.length > 0 ? (
        <div className="space-y-2">
          {uploadedFiles.map(file => (
            <div key={file.id} className="flex items-center justify-between bg-white p-2 rounded border">
              <div className="flex items-center gap-2 flex-1">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-sm truncate">{file.name}</span>
                <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                {file.status === 'uploading' && (<><Loader2 className="w-3 h-3 animate-spin text-blue-500" /><span className="text-xs text-blue-500">{file.progress?.toFixed(0)}%</span></>)}
                {file.status === 'ready' && <Check className="w-4 h-4 text-green-500" />}
                {file.status === 'error' && (<span className="text-xs text-red-500" title={file.error}>Error</span>)}
              </div>
              <button onClick={() => removeFile(file.id)} className="p-1 hover:bg-gray-100 rounded" disabled={file.status === 'uploading'}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 text-center text-gray-500 hover:text-gray-700">
          <Upload className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">Drop files or click to upload</p>
          <p className="text-xs">PDF, Word, Excel, CSV, TXT (Max 10MB)</p>
        </button>
      )}
    </div>
  );
};

// Login Component
const LoginForm: React.FC = () => {
  const { login, isLoading, error } = useChatStore();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('demo');
  const handleLogin = () => { login(email, password); };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-6">Login to AI Report Generator</h2>
        <div>
          <input type="email" placeholder="Email" className="w-full px-4 py-2 border rounded mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" className="w-full px-4 py-2 border rounded mb-4" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }} />
          <button onClick={handleLogin} className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
          {error && <p className="text-red-500 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
};

// Main Component
export default function ReportingChatbot() {
  const {
    messages, currentReport, selectedCompany, companies, isLoading, error,
    isAuthenticated, setCompany, sendMessage, clearChat, saveReport, loadCompanies, checkAuth, setReport,
  } = useChatStore();
  const [inputValue, setInputValue] = useState('');
  const [includeGraphs, setIncludeGraphs] = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkAuth(); }, [checkAuth]);
  useEffect(() => { if (isAuthenticated && companies.length === 0) loadCompanies(); }, [isAuthenticated, companies.length, loadCompanies]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;
    await sendMessage(inputValue, includeGraphs);
    setInputValue('');
  }, [inputValue, includeGraphs, sendMessage]);

  const handleSaveReport = useCallback(async (content: string) => {
    if (currentReport) {
      await saveReport(currentReport.id, content);
      setIsEditingReport(false);
    }
  }, [currentReport, saveReport]);

  if (!isAuthenticated) return <LoginForm />;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <h1 className="text-xl font-semibold">AI Report Generator</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => setShowCompanyDropdown(!showCompanyDropdown)} className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50">
                <Building2 className="w-4 h-4" />
                <span>{selectedCompany?.name || 'Select Company'}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showCompanyDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border z-50">
                  {companies.map(company => (
                    <button key={company.id} onClick={() => { setCompany(company); setShowCompanyDropdown(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                      <div className="font-medium">{company.name}</div>
                      {company.context && (<div className="text-xs text-gray-500">{company.context}</div>)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => { if (confirm('Clear all chat history?')) clearChat(); }}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">
              <RotateCcw className="w-4 h-4" /> Clear
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div className="ml-3"><p className="text-sm text-red-800">{error}</p></div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className={`${currentReport ? 'w-1/2' : 'flex-1'} flex flex-col bg-white`}>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Start by selecting a company</p>
                <p className="text-sm mt-2">Upload files and ask questions to generate reports</p>
              </div>
            )}
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl px-4 py-3 rounded-lg ${
                    message.type === 'user' ? 'bg-blue-600 text-white' :
                    message.type === 'assistant' ? 'bg-gray-100 text-gray-900' :
                    message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                    'bg-yellow-50 text-yellow-800'}`}>
                  {message.files && message.files.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {message.files.map(file => (
                        <div key={file.id} className="flex items-center gap-2 text-sm opacity-90">
                          <FileText className="w-4 h-4" /><span>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {message.type === 'assistant' ? (
                    <div>
                      <div className="line-clamp-3" dangerouslySetInnerHTML={{ __html: message.content.substring(0, 200) + '...' }} />
                      {message.reportId && (
                        <button onClick={() => {
                            const report: Report = {
                              id: message.reportId!, content: message.content, charts: message.charts,
                              query: '', timestamp: message.timestamp,
                            }; setReport(report);
                          }} className="text-xs mt-2 underline opacity-70 hover:opacity-100">
                          View full report â†’
                        </button>
                      )}
                    </div>
                  ) : (<div>{message.content}</div>)}
                  {message.charts && message.charts.map(chart => (<ChartRenderer key={chart.id} chart={chart} />))}
                  <div className="text-xs mt-2 opacity-70">{new Date(message.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t p-4 bg-gray-50">
            <FileUploadZone />
            <div className="mt-4 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeGraphs} onChange={(e) => setIncludeGraphs(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                <span className="text-sm font-medium">Include graphs</span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Type your reporting query..." className="flex-1 px-4 py-2 border rounded-lg resize-none" rows={2} disabled={isLoading} />
              <button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {currentReport && (
          <div className="w-1/2 border-l bg-white">
            <SimpleEditor content={currentReport.editedContent || currentReport.content}
              isEditing={isEditingReport} onSave={handleSaveReport} onEdit={() => setIsEditingReport(!isEditingReport)} />
          </div>
        )}
      </div>
    </div>
  );
}
