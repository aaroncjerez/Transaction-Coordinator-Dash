export interface ElectronAPI {
  db: {
    // deals
    getDeals: (options?: { orderBy?: string; ascending?: boolean }) => Promise<any[]>;
    getDealById: (id: string) => Promise<any>;
    insertDeal: (deal: any) => Promise<any>;
    upsertDeals: (deals: any[]) => Promise<{ success: boolean }>;
    updateDeal: (id: string, fields: Record<string, any>) => Promise<{ success: boolean }>;
    deleteDeal: (id: string) => Promise<{ success: boolean }>;
    deleteDealsByAirtableIds: (ids: string[]) => Promise<{ success: boolean }>;
    getExistingAirtableIds: () => Promise<string[]>;
    checkStageChange: (dealId: string, newStage: string) => Promise<{
      canProceed: boolean;
      incompleteTasks?: { id: string; title: string; status: string }[];
      currentStage?: string;
      newStage?: string;
      error?: string;
    }>;

    // tasks
    getTasks: (options?: { orderBy?: string; ascending?: boolean }) => Promise<any[]>;
    getTasksByDealId: (dealId: string) => Promise<any[]>;
    getTasksByDealAirtableId: (dealAirtableId: string) => Promise<any[]>;
    getTaskById: (id: string) => Promise<any>;
    insertTask: (task: any) => Promise<any>;
    updateTask: (id: string, fields: Record<string, any>) => Promise<{ success: boolean }>;
    updateTaskWithLog: (id: string, fields: Record<string, any>) => Promise<{ success: boolean }>;
    getTaskActivity: (taskId: string) => Promise<any[]>;
    logTaskActivity: (taskId: string, action: string, details?: string) => Promise<{ success: boolean }>;
    upsertTasks: (tasks: any[]) => Promise<{ success: boolean }>;
    getExistingTaskAirtableIds: () => Promise<string[]>;
    deleteTasksByAirtableIds: (ids: string[]) => Promise<{ success: boolean }>;

    // daily_leads
    getDailyLeads: (options?: { orderBy?: string; ascending?: boolean }) => Promise<any[]>;
    updateLead: (id: number, fields: Record<string, any>) => Promise<{ success: boolean }>;

    // market_analysis
    getMarketData: (options?: { orderBy?: string; ascending?: boolean; limit?: number }) => Promise<any[]>;
  };

  airtable: {
    fetchDeals: () => Promise<any[]>;
    fetchTasks: () => Promise<any[]>;
    createRecord: (fields: Record<string, any>) => Promise<any>;
    updateRecord: (recordId: string, fields: Record<string, any>) => Promise<any>;
    deleteRecord: (recordId: string) => Promise<any>;
    updateTask: (recordId: string, fields: Record<string, any>) => Promise<any>;
  };

  ai: {
    askQuestion: (query: string, dealId: string) => Promise<{ answer: string }>;
    analyzeDeal: (dealId: string) => Promise<any>;
    getDealAnalysis: (dealId: string) => Promise<any>;
  };

  pdf: {
    analyze: (dealId: string, filePath: string, fileName: string, category: string) => Promise<any>;
    getAnalysis: (dealId: string, filePath: string) => Promise<any>;
    getAnalysesByDeal: (dealId: string) => Promise<any[]>;
  };

  files: {
    uploadFile: (dealId: string, categoryKey: string, fileName: string, fileBuffer: ArrayBuffer) => Promise<any>;
    listFiles: (dealId: string, category?: string) => Promise<any[]>;
    deleteFile: (fileId: string) => Promise<{ success: boolean }>;
    getFilePath: (relativePath: string) => Promise<string>;
  };

  deadlines: {
    create: (deadline: any) => Promise<any>;
    update: (id: string, fields: Record<string, any>) => Promise<{ success: boolean }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    getByDeal: (dealId: string) => Promise<any[]>;
    getAll: () => Promise<any[]>;
    getUpcoming: (daysAhead?: number) => Promise<any[]>;
    acknowledge: (id: string) => Promise<{ success: boolean }>;
    onAlert: (callback: (data: any) => void) => void;
  };

  audit: {
    getByDeal: (dealId: string, limit?: number) => Promise<any[]>;
    log: (dealId: string | null, eventType: string, details: any) => Promise<{ success: boolean }>;
  };

  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<{ success: boolean }>;
    getAll: () => Promise<{ key: string; hasValue: boolean; updated_at?: string }[]>;
  };

  sync: {
    getQueueStatus: () => Promise<{
      pending: number;
      failed: number;
      lastSync: string | null;
    }>;
  };

  fub: {
    getFileSyncStatus: (dealId: string) => Promise<FubFileSyncState | null>;
    getAllFileSyncStatuses: () => Promise<FubFileSyncState[]>;
    triggerFileSync: (dealId?: string) => Promise<{ success: boolean; synced: number; errors: number }>;
    getDealsWithFubLinks: () => Promise<{ id: string; deal_name: string; fub_person_id: string }[]>;
  };
}

export type FubSyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'mismatch';

export interface FubFileSyncState {
  deal_id: string;
  fub_person_id: string;
  last_synced_at?: string;
  last_status: FubSyncStatus;
  last_error?: string;
  local_file_count: number;
  fub_file_count: number;
  mismatched_files?: string[];
  updated_at?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
