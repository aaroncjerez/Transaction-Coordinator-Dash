import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Calendar, DollarSign, ExternalLink, Check, Plus,
  Sparkles, Loader2, Cloud, RefreshCw, CheckCircle, AlertTriangle, MapPin, Phone,
  ChevronDown
} from 'lucide-react';
import {
  fetchDealById, updateDealFields, fetchTasksByDealId, updateTaskFields,
  analyzePdf, getPdfAnalysesByDeal, listFiles, getFubFileSyncStatus, triggerFubFileSync
} from '../lib/database';
import { DEAL_STAGES, DEAL_TYPES, FILE_CATEGORIES, getStageColor } from '../constants';
import { cn } from '../lib/utils';
import confetti from 'canvas-confetti';
import { uploadFileLocal } from '../lib/uploadHandler';
import { PdfAnalysisCard } from '../components/PdfAnalysisCard';
import { DealAnalyzer } from '../components/DealAnalyzer';
import { DealChat } from '../components/DealChat';

// ---- Types ----

interface FileItem {
  id: string;
  name: string;
  url: string;
  categoryKey: string;
  source?: 'local' | 'fub';
  fub_attachment_id?: string;
}

interface DealDetailData {
  id: string;
  deal_name: string;
  deal_type?: string;
  stage: string;
  county: string;
  state: string;
  purchase_price: number;
  expected_sales_price: number;
  contract_date: string;
  close_date: string;
  phone_number: string;
  notes: string;
  fub_person_id?: string;
  files: FileItem[];
}

// ---- Main Component ----

export const DealDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DealDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'files' | 'analysis' | 'chat'>('files');

  const handleFieldUpdate = async (field: keyof DealDetailData, value: any) => {
    if (!deal) return;
    setDeal(prev => prev ? { ...prev, [field]: value } : null);
    try {
      await updateDealFields(deal.id, {
        [field === 'contract_date' ? 'contract_execution_date' : field]: value
      });
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
  };

  useEffect(() => {
    if (id) fetchDealData(id);
  }, [id]);

  const fetchDealData = async (dealId: string) => {
    try {
      setLoading(true);
      const dealData = await fetchDealById(dealId);
      if (!dealData) throw new Error('Deal not found');

      const fileRecords = await listFiles(dealId);
      const files: FileItem[] = (fileRecords || []).map((f: any) => ({
        id: f.id, name: f.file_name,
        url: f.file_path ? `file://${f.file_path}` : '',
        categoryKey: f.category || 'other',
        source: f.source || 'local',
        fub_attachment_id: f.fub_attachment_id,
      }));

      setDeal({
        id: dealData.id,
        deal_name: dealData.deal_name || 'Unnamed Deal',
        deal_type: dealData.deal_type || 'Unclassified',
        stage: dealData.stage || 'Offer accepted',
        county: dealData.county || '',
        state: dealData.state || '',
        purchase_price: dealData.purchase_price || 0,
        expected_sales_price: dealData.expected_sales_price || 0,
        contract_date: dealData.contract_execution_date || 'TBD',
        close_date: dealData.close_date || 'TBD',
        phone_number: dealData.phone_number || '',
        notes: dealData.notes || '',
        fub_person_id: dealData.fub_person_id || undefined,
        files,
      });
    } catch (error) {
      console.error('Error fetching deal details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => {
    if (!event.target.files || event.target.files.length === 0 || !deal) return;
    const file = event.target.files[0];
    try {
      setLoading(true);
      await uploadFileLocal(deal.id, file, categoryKey, (msg) => console.log(msg));
      fetchDealData(deal.id);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert(error.message || 'Failed to upload file.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading deal details...</div>;
  if (!deal) return <div className="p-8 text-center text-red-500">Deal not found.</div>;

  const stageColor = getStageColor(deal.stage);
  const spread = deal.expected_sales_price - deal.purchase_price;

  return (
    <div className="flex flex-col md:flex-row h-full -m-4 md:-m-6">
      {/* ====== LEFT SIDEBAR ====== */}
      <div className="w-full md:w-80 flex-shrink-0 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-5 md:overflow-y-auto scrollbar-thin">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          Pipeline
        </button>

        {/* Deal Name */}
        <h1 className="text-xl font-bold text-gray-900 leading-tight mb-3">{deal.deal_name}</h1>

        {/* Stage Dropdown */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1 block">Stage</label>
          <div className="relative">
            <select
              value={deal.stage}
              onChange={(e) => handleFieldUpdate('stage', e.target.value)}
              className={cn(
                'w-full text-sm font-semibold rounded-lg px-3 py-2 border appearance-none cursor-pointer transition-all focus:ring-2 focus:ring-offset-1',
                stageColor.bg, stageColor.text, stageColor.border,
                'focus:ring-blue-400'
              )}
            >
              {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70 pointer-events-none" />
          </div>
        </div>

        {/* Deal Type */}
        <div className="mb-5">
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1 block">Type</label>
          <select
            value={deal.deal_type}
            onChange={(e) => handleFieldUpdate('deal_type', e.target.value)}
            className="w-full text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
          >
            {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Divider */}
        <hr className="border-gray-100 mb-4" />

        {/* Financials */}
        <div className="space-y-3 mb-5">
          <h3 className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1.5">
            <DollarSign size={12} /> Financials
          </h3>
          <div>
            <label className="text-xs text-gray-500">Purchase Price</label>
            <input
              type="number"
              value={deal.purchase_price}
              onChange={e => setDeal({ ...deal, purchase_price: Number(e.target.value) })}
              onBlur={e => handleFieldUpdate('purchase_price', Number(e.target.value))}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Expected Sale</label>
            <input
              type="number"
              value={deal.expected_sales_price}
              onChange={e => setDeal({ ...deal, expected_sales_price: Number(e.target.value) })}
              onBlur={e => handleFieldUpdate('expected_sales_price', Number(e.target.value))}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none mt-0.5"
            />
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            <span className="text-xs text-gray-500">Spread</span>
            <span className={cn('text-sm font-bold', spread > 0 ? 'text-emerald-600' : spread < 0 ? 'text-red-600' : 'text-gray-500')}>
              ${spread.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Dates */}
        <div className="space-y-3 mb-5">
          <h3 className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1.5">
            <Calendar size={12} /> Dates
          </h3>
          <div>
            <label className="text-xs text-gray-500">Contract Date</label>
            <input
              type="date"
              value={deal.contract_date === 'TBD' ? '' : deal.contract_date}
              onChange={e => setDeal({ ...deal, contract_date: e.target.value })}
              onBlur={e => handleFieldUpdate('contract_date', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none mt-0.5"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Close Date</label>
            <input
              type="date"
              value={deal.close_date === 'TBD' ? '' : deal.close_date}
              onChange={e => setDeal({ ...deal, close_date: e.target.value })}
              onBlur={e => handleFieldUpdate('close_date', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none mt-0.5"
            />
          </div>
        </div>

        {/* Contact & Location */}
        <div className="space-y-3 mb-5">
          <h3 className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Contact</h3>
          {deal.phone_number && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Phone size={14} className="text-gray-400" />
              <span>{deal.phone_number}</span>
            </div>
          )}
          {(deal.county || deal.state) && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <MapPin size={14} className="text-gray-400" />
              <span>{[deal.county, deal.state].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {deal.fub_person_id && (
            <a
              href={`https://jerezland.followupboss.com/people/view/${deal.fub_person_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              <ExternalLink size={14} />
              View in FUB
            </a>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1 block">Notes</label>
          <textarea
            value={deal.notes || ''}
            onChange={e => setDeal({ ...deal, notes: e.target.value })}
            onBlur={e => handleFieldUpdate('notes', e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm min-h-[80px] focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none resize-none"
            placeholder="Add notes..."
          />
        </div>
      </div>

      {/* ====== RIGHT MAIN AREA ====== */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Sticky Tab Bar */}
        <div className="sticky top-0 bg-background/90 backdrop-blur-sm z-10 border-b border-gray-200 px-5">
          <div className="flex gap-6">
            {(['files', 'analysis', 'chat'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'py-3 text-sm font-medium border-b-2 transition-colors capitalize flex items-center gap-1.5',
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {tab === 'analysis' && <Sparkles size={14} />}
                {tab === 'files' ? 'File Vault' : tab === 'analysis' ? 'Analysis' : 'Chat'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          <div className={cn(
            'bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[300px]',
            activeTab === 'chat' && 'bg-transparent border-none shadow-none p-0'
          )}>
            {activeTab === 'files' && (
              <FilesTab dealId={deal.id} files={deal.files} categories={FILE_CATEGORIES} onUpload={handleFileUpload} fubPersonId={deal.fub_person_id} />
            )}
            {activeTab === 'analysis' && (
              <DealAnalyzer dealId={deal.id} />
            )}
            {activeTab === 'chat' && (
              <DealChat dealId={deal.id} dealName={deal.deal_name} />
            )}
          </div>

          {/* Tasks — always visible below tab content */}
          <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Check size={18} className="text-blue-500" />
              Tasks
            </h3>
            <DealTasksList dealId={deal.id} stageHex={stageColor.hex} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ====== FILES TAB ======

const FilesTab: React.FC<{
  dealId: string;
  files: FileItem[];
  categories: typeof FILE_CATEGORIES;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => void;
  fubPersonId?: string;
}> = ({ dealId, files, categories, onUpload, fubPersonId }) => {
  const [analyses, setAnalyses] = useState<Record<string, any>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [fubSyncStatus, setFubSyncStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadAnalyses();
    if (fubPersonId) loadFubSyncStatus();
  }, [dealId, fubPersonId]);

  const loadAnalyses = async () => {
    const data = await getPdfAnalysesByDeal(dealId);
    const map: Record<string, any> = {};
    (data || []).forEach((a: any) => { map[a.file_path] = a; });
    setAnalyses(map);
  };

  const loadFubSyncStatus = async () => {
    try {
      const status = await getFubFileSyncStatus(dealId);
      setFubSyncStatus(status);
    } catch (e) {
      console.warn('Failed to load FUB sync status:', e);
    }
  };

  const handleFubSync = async () => {
    setSyncing(true);
    try {
      await triggerFubFileSync(dealId);
      await loadFubSyncStatus();
    } catch (e) {
      console.error('FUB sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyze = async (file: FileItem) => {
    const filePath = file.url.replace('file://', '');
    if (!filePath || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only local PDF files can be analyzed.');
      return;
    }
    setAnalyzing(filePath);
    try {
      await analyzePdf(dealId, filePath, file.name, file.categoryKey || 'other');
      await loadAnalyses();
    } catch (e: any) {
      console.error('PDF analysis failed:', e);
      alert(e.message || 'Analysis failed');
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* FUB Sync Banner */}
      {fubPersonId && (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <Cloud size={16} className="text-blue-500" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">FUB File Sync</span>
              {fubSyncStatus ? (
                <span>
                  {fubSyncStatus.last_status === 'synced' && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle size={12} /> Synced ({fubSyncStatus.local_file_count} local, {fubSyncStatus.fub_file_count} FUB)
                    </span>
                  )}
                  {fubSyncStatus.last_status === 'mismatch' && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={12} /> Mismatch
                    </span>
                  )}
                  {fubSyncStatus.last_status === 'error' && (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Error</span>
                  )}
                  {fubSyncStatus.last_status === 'pending' && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Pending</span>
                  )}
                  {fubSyncStatus.last_status === 'syncing' && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      <Loader2 size={12} className="animate-spin" /> Syncing...
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-gray-400">Not synced yet</span>
              )}
            </div>
          </div>
          <button
            onClick={handleFubSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync Now
          </button>
        </div>
      )}

      {/* File Categories Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {categories.map(category => {
          const categoryFiles = files.filter(f => f.categoryKey === category.key);
          return (
            <div key={category.key} className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                  {category.label}
                  <span className="bg-gray-200 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full">{categoryFiles.length}</span>
                </h3>
                <div className="relative">
                  <input type="file" id={`upload-${category.key}`} className="hidden" onChange={(e) => onUpload(e, category.key)} />
                  <label htmlFor={`upload-${category.key}`} className="cursor-pointer p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Upload File">
                    <Plus size={16} />
                  </label>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[300px] scrollbar-thin">
                {categoryFiles.map((file) => {
                  const filePath = file.url.replace('file://', '');
                  const isPdf = file.name.toLowerCase().endsWith('.pdf');
                  const analysis = analyses[filePath];
                  const isAnalyzing = analyzing === filePath;
                  return (
                    <div key={file.id} className="space-y-1">
                      <div className="group flex items-center justify-between p-2 bg-white rounded-md border border-gray-100 transition-colors hover:border-gray-200">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText size={14} className="text-blue-500 flex-shrink-0" />
                          <span className="text-xs text-gray-700 truncate" title={file.name}>{file.name}</span>
                          {file.source === 'fub' && <Cloud size={10} className="text-blue-400 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {isPdf && !analysis && (
                            <button onClick={() => handleAnalyze(file)} disabled={isAnalyzing} className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors disabled:opacity-50" title="Analyze PDF">
                              {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            </button>
                          )}
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 transition-all">
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                      {analysis && <PdfAnalysisCard analysis={analysis} onReanalyze={() => handleAnalyze(file)} isReanalyzing={isAnalyzing} />}
                    </div>
                  );
                })}
                {categoryFiles.length === 0 && (
                  <div className="h-16 flex items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-md text-xs">
                    No files
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ====== TASKS LIST ======

const DealTasksList: React.FC<{ dealId: string; stageHex: string }> = ({ dealId, stageHex }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) return;
    const fetchTasks = async () => {
      const data = await fetchTasksByDealId(dealId);
      const filtered = (data || []).filter((t: any) => t.status !== 'Cancelled');
      const statusOrder: Record<string, number> = { 'In Progress': 0, 'To Do': 1, 'Done': 2 };
      const sorted = filtered.sort((a: any, b: any) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
      setTasks(sorted);
      setLoading(false);
    };
    fetchTasks();
  }, [dealId]);

  const handleStatusChange = async (task: any, newStatus: string) => {
    const oldStatus = task.status;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (newStatus === 'Done' && oldStatus !== 'Done') {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
    try {
      await updateTaskFields(task.id, { status: newStatus });
    } catch (err) {
      console.error('Task update failed', err);
    }
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  if (loading) return <div className="p-4 text-center text-gray-400 text-sm">Loading tasks...</div>;
  if (tasks.length === 0) return <div className="p-4 text-center text-gray-400 text-sm italic">No tasks active.</div>;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
          <span>{completedTasks} of {totalTasks} completed</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, backgroundColor: stageHex }}
          />
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-1.5">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-100 transition-all group">
            <span className={cn('text-sm font-medium transition-colors', task.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700')}>
              {task.title || task.task_name}
            </span>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(task, e.target.value)}
              className={cn(
                'text-xs font-bold px-2 py-1 rounded-md border-0 cursor-pointer outline-none ring-1 ring-inset transition-all',
                task.status === 'Done' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                task.status === 'In Progress' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'
              )}
            >
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
