export interface ElectronAPI {
  db: {
    // deals
    getDeals: (options?: { orderBy?: string; ascending?: boolean }) => Promise<any[]>;
    getDealById: (id: string) => Promise<any>;
    insertDeal: (deal: any) => Promise<any>;
    upsertDeals: (deals: any[]) => Promise<{ success: boolean }>;
    updateDeal: (id: string, fields: Record<string, any>) => Promise<{ success: boolean; fubPush?: { queued: boolean; success?: boolean; error?: string } }>;
    deleteDeal: (id: string) => Promise<{ success: boolean }>;
    purgeOldDeals: () => Promise<{ purged: number }>;
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
    getTaskById: (id: string) => Promise<any>;
    insertTask: (task: any) => Promise<any>;
    updateTask: (id: string, fields: Record<string, any>) => Promise<{ success: boolean }>;
    updateTaskWithLog: (id: string, fields: Record<string, any>) => Promise<{ success: boolean }>;
    getTaskActivity: (taskId: string) => Promise<any[]>;
    logTaskActivity: (taskId: string, action: string, details?: string) => Promise<{ success: boolean }>;
    upsertTasks: (tasks: any[]) => Promise<{ success: boolean }>;

    // daily_leads
    getDailyLeads: (options?: { orderBy?: string; ascending?: boolean }) => Promise<any[]>;
    updateLead: (id: number, fields: Record<string, any>) => Promise<{ success: boolean }>;

    // market_analysis
    getMarketData: (options?: { orderBy?: string; ascending?: boolean; limit?: number }) => Promise<any[]>;
  };

  ai: {
    askQuestion: (query: string, dealId: string) => Promise<{ answer: string; sources?: Array<{ file_name: string; chunk_index: number }> }>;
    analyzeDeal: (dealId: string) => Promise<any>;
    getDealAnalysis: (dealId: string) => Promise<any>;
    backfillEmbeddings: () => Promise<{ embedded: number; errors: number; total: number; error?: string }>;
    onBackfillProgress: (callback: (data: { current: number; total: number }) => void) => void;
  };

  pdf: {
    analyze: (dealId: string, filePath: string, fileName: string, category: string) => Promise<any>;
    getAnalysis: (dealId: string, filePath: string) => Promise<any>;
    getAnalysesByDeal: (dealId: string) => Promise<any[]>;
    crawlDealDeadlines: (dealId: string) => Promise<any>;
    crawlAllDeadlines: () => Promise<any>;
  };

  files: {
    uploadFile: (dealId: string, categoryKey: string, fileName: string, fileBuffer: ArrayBuffer) => Promise<any>;
    listFiles: (dealId: string, category?: string) => Promise<any[]>;
    deleteFile: (fileId: string) => Promise<{ success: boolean }>;
    getFilePath: (relativePath: string) => Promise<string>;
    readPdf: (filePath: string) => Promise<{ data: string | null; error: string | null }>;
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
    testSlackWebhook: () => Promise<{ success: boolean; error?: string }>;
  };

  fub: {
    // Person sync
    syncPeople: () => Promise<{ success: boolean; newDeals: number; updatedDeals: number; errors: number }>;
    pushStage: (dealId: string, stage: string) => Promise<{ success: boolean }>;
    postTaskNote: (dealId: string, taskId: string) => Promise<{ success: boolean }>;
    getPersonSyncStatus: () => Promise<FubPersonSyncStatus>;
    getPersonSyncRecords: () => Promise<any[]>;
    onPersonSyncComplete: (callback: (data: any) => void) => void;
    // Activities
    getActivities: (dealId: string, activityType?: string) => Promise<FubActivity[]>;
    syncActivities: (dealId: string) => Promise<{ success: boolean; synced?: number; error?: string; notes?: number; calls?: number; texts?: number; emails?: number }>;
    // File sync
    getFileSyncStatus: (dealId: string) => Promise<FubFileSyncState | null>;
    getAllFileSyncStatuses: () => Promise<FubFileSyncState[]>;
    triggerFileSync: (dealId?: string) => Promise<{ success: boolean; synced: number; errors: number }>;
    getDealsWithFubLinks: () => Promise<{ id: string; deal_name: string; fub_person_id: string }[]>;
    // Browser file sync
    browserSyncDeal: (dealId: string) => Promise<{ filesFound: number; filesDownloaded: number; filesAnalyzed: number }>;
    browserSyncAll: () => Promise<{ totalDeals: number; totalFilesFound: number; totalFilesDownloaded: number; errors: number }>;
    closeFubBrowser: () => Promise<{ success: boolean }>;
    onBrowserSyncProgress: (callback: (data: BrowserSyncProgress) => void) => void;
    offBrowserSyncProgress: () => void;
    onBrowserBulkComplete: (callback: (data: { totalDeals: number; totalFilesFound: number; totalFilesDownloaded: number; errors: number }) => void) => void;
    offBrowserBulkComplete: () => void;
  };

  dealSummary: {
    generate: (dealId: string) => Promise<{ success: boolean; summary?: string; error?: string }>;
    get: (dealId: string) => Promise<{ deal_id: string; summary: string; generated_at: string } | null>;
  };

  notes: {
    create: (dealId: string, content: string, pushToFub: boolean) => Promise<{ success: boolean; id?: number }>;
    list: (dealId: string) => Promise<Array<{ id: number; deal_id: string; content: string; pushed_to_fub: number; created_at: string }>>;
  };

  chat: {
    saveMessage: (dealId: string, role: string, content: string, sources?: string) => Promise<any>;
    getMessages: (dealId: string) => Promise<Array<{ id: number; deal_id: string; role: string; content: string; sources: string | null; created_at: string }>>;
  };

  leads: {
    fetchAndAnalyze: () => Promise<{ success: boolean; analyzed: number; errors: number; total: number }>;
    refreshAnalysis: (leadId: number) => Promise<{ success: boolean; lead?: any; error?: string }>;
    markContacted: (leadId: number) => Promise<{ success: boolean }>;
    unmarkContacted: (leadId: number) => Promise<{ success: boolean }>;
    getStats: () => Promise<{ total: number; newLeads48h: number; doneToday: number; highDiscount: number }>;
    onAnalysisProgress: (callback: (data: { current: number; total: number; name: string }) => void) => void;
  };

  kpi: {
    getDashboardData: () => Promise<any>;
    getCeoBrief: (dashboardState: any) => Promise<any>;
  };

  cfo: {
    getInsights: (data: any) => Promise<{
      summary: string;
      insights: { title: string; detail: string }[];
      monthlyTrend: string;
      generatedAt: string;
    }>;
  };

  mercury: {
    getAccounts: () => Promise<any[]>;
    getTransactions: (opts?: { days?: number; category?: string; dealId?: string; limit?: number }) => Promise<any[]>;
    getSummary: () => Promise<{
      totalBalance: number;
      accounts: any[];
      monthlyBurn: number;
      runway: number;
      last30DaysIn: number;
      last30DaysOut: number;
      transactionCount30d: number;
      lastSync: string | null;
    }>;
    getMonthlySpend: (months?: number) => Promise<any[]>;
    getCategoryBreakdown: (days?: number) => Promise<any[]>;
    syncNow: () => Promise<{ accounts: number; transactions: number; error?: string }>;
    getActiveDealPipeline: () => Promise<{ active: any[]; closed: any[] }>;
    getMonthlyCashflow: () => Promise<any[]>;
    getMonthlyPL: (months?: number) => Promise<any>;
    getSparklineData: () => Promise<any>;
  };

  reminders: {
    create: (taskId: string, remindAt: string) => Promise<any>;
    getByTask: (taskId: string) => Promise<any[]>;
    delete: (id: string) => Promise<{ success: boolean }>;
    getPending: () => Promise<any[]>;
    onFired: (callback: (data: any) => void) => void;
  };

  dialer: {
    getCallQueue: (limit?: number, listIds?: string[]) => Promise<any[]>;
    getCallHistory: (limit?: number, filters?: { search?: string; status?: string; sentiment?: string }) => Promise<any[]>;
    getCallsForLead: (phoneNormalized: string) => Promise<any[]>;
    getLeadById: (id: string) => Promise<any>;
    getLeadMemory: (phoneNormalized: string) => Promise<any>;
    getDNCList: () => Promise<any[]>;
    getDNCStats: () => Promise<{ total: number; autoDetected: number; fub: number; manual: number }>;
    addManualDNC: (phone: string, reason: string) => Promise<any>;
    removeFromDNC: (phone: string) => Promise<any>;
    getDailyStats: (days?: number) => Promise<any[]>;
    getHotLeads: () => Promise<any[]>;
    getCallbacksDue: () => Promise<any[]>;
    triggerCadence: () => Promise<{ success: boolean }>;
    reviewCall: (callId: string) => Promise<any>;
    reviewRecentCalls: (limit?: number) => Promise<any>;
    getTodayCallCount: () => Promise<number>;
    onReviewProgress: (callback: (data: { current: number; total: number; callId: string }) => void) => () => void;
    onNewCalls: (callback: (data: { count: number }) => void) => () => void;
    uploadLeads: (leads: any[], batchId: string, listName?: string) => Promise<import('../types').UploadBatchResult>;
    onUploadProgress: (callback: (data: { processed: number; total: number }) => void) => () => void;
    syncFubDNC: () => Promise<{ total: number; added: number; duplicates: number; errors: number; fub_people_fetched: number; unique_phones: number }>;
    syncFubExceptUnreachedToDNC: () => Promise<{ total: number; added: number; duplicates: number; errors: number; fub_people_fetched: number; unique_phones: number; skippedUnreached: number }>;
    onFubSyncProgress: (callback: (data: { stage: string; fetched: number; phones: number }) => void) => () => void;
    getUploadBatches: () => Promise<Array<{ batch_id: string; lead_count: number; uploaded_at: string }>>;
    getUploadBatchLeads: (batchId: string) => Promise<Array<{ id: string; first_name: string; last_name: string; phone_normalized: string; county: string; state: string; created_at: string }>>;
    deleteUploadBatch: (batchId: string) => Promise<{ deleted: number }>;
    callLead: (lead: any) => Promise<{ call_id: string; status: string }>;

    // Lists
    getLists: () => Promise<Array<{ id: string; name: string; lead_count: number; actual_lead_count: number; created_at: string }>>;

    // Browse all leads in a list (no cadence filtering)
    getLeadsByList: (listIds: string[], limit?: number) => Promise<any[]>;

    // Local cache reads
    getLocalCallQueue: (limit?: number, listIds?: string[]) => Promise<any[]>;
    getLocalCallHistory: (limit?: number, filters?: any) => Promise<any[]>;
    getLocalDNCList: () => Promise<any[]>;
    getLocalDNCStats: () => Promise<any>;
    getLocalInboundCalls: (limit?: number) => Promise<any[]>;

    // Inbound calls
    getInboundCalls: (limit?: number) => Promise<any[]>;

    // Batch dial
    batchDial: (leadIds: string[], fromNumbers?: string | string[]) => Promise<import('../types').BatchDialResult>;
    getNumberHealth: (fromNumbers: string[]) => Promise<Array<{ phone: string; totalCalls: number; connected: number; connectRate: number; flagged: boolean }>>;
    getNumberThrottle: (fromNumbers: string[]) => Promise<Array<{
      phone: string; callsToday: number; callsThisHour: number;
      dailyLimit: number; hourlyLimit: number; dailyRemaining: number; hourlyRemaining: number;
      paused: boolean; pausedReason: string | null; lastCallAt: string | null;
      throttled: boolean; throttleReason: string | null;
    }>>;
    setNumberLimits: (phone: string, dailyLimit?: number, hourlyLimit?: number) => Promise<{ success: boolean }>;
    setNumberPaused: (phone: string, paused: boolean, reason?: string) => Promise<{ success: boolean }>;
    getCampaignCapacity: (fromNumbers: string[]) => Promise<{
      totalDailyRemaining: number; totalHourlyRemaining: number;
      availableNumbers: string[]; throttledNumbers: string[];
    }>;
    onBatchDialProgress: (callback: (data: any) => void) => () => void;

    // Inbound call notification
    onInboundCall: (callback: (data: any) => void) => () => void;

    // Cache update notification
    onCacheUpdated: (callback: (data: { type: string }) => void) => () => void;

    // Retell phone numbers
    getRetellPhoneNumbers: () => Promise<Array<{
      phone_number: string;
      phone_number_pretty: string;
      nickname: string | null;
      inbound_agent_id: string | null;
      outbound_agent_id: string | null;
    }>>;

    // Force sync
    forceSync: () => Promise<{ success: boolean }>;

    // Force Retell poll (manual trigger)
    forcePollRetell: () => Promise<{ fetched: number; newRecords: number; errors: number }>;

    // Backfill historical calls from Retell
    backfillRetell: (daysBack: number) => Promise<{ fetched: number; newRecords: number; errors: number }>;
    onBackfillProgress: (callback: (data: { fetched: number; inserted: number; page: number }) => void) => void;

    // Sync + poller health status
    getSyncStatus: () => Promise<{
      running: boolean;
      retellConfigured: boolean;
      sync: { ok: boolean; error: string | null; lastRun: string | null };
    }>;

    // Campaign pause/resume
    pauseBatchDial: () => Promise<{ success: boolean }>;
    resumeBatchDial: () => Promise<{ success: boolean }>;
    isBatchPaused: () => Promise<boolean>;

    // Lead actions
    setLeadOutcome: (phoneNormalized: string, outcome: string, reason?: string) => Promise<{ success: boolean }>;
    clearLeadOutcome: (phoneNormalized: string) => Promise<{ success: boolean }>;
    setLeadCallback: (phoneNormalized: string, callbackDatetime: string | null) => Promise<{ success: boolean }>;
    addLeadNote: (phoneNormalized: string, note: string) => Promise<{ id: string }>;
    getLeadNotes: (phoneNormalized: string) => Promise<Array<{ id: string; phone_normalized: string; note: string; created_at: string }>>;
    deleteLeadNote: (noteId: string) => Promise<{ success: boolean }>;

    // Lead search
    searchLeads: (query: string, limit?: number) => Promise<Array<{
      id: string; phone_normalized: string; first_name: string; last_name: string;
      county: string; state: string; rapport_level: string; final_outcome: string | null; list_name: string;
    }>>;

    // Paginated call history
    getCallHistoryPaginated: (limit?: number, offset?: number, filters?: any) => Promise<{ calls: any[]; total: number }>;

    // RAG: Transcript search + conversation memory
    searchTranscripts: (query: string, options?: { phoneNormalized?: string; topN?: number }) => Promise<any[]>;
    getPreCallContext: (phoneNormalized: string) => Promise<{
      hasMemory: boolean;
      summary: string | null;
      keyFacts: string[];
      sentiment: string | null;
      totalCalls: number;
      lastCallDate: string | null;
    }>;
    backfillEmbeddings: () => Promise<{ total: number; chunked: number; embedded: number; errors: number }>;

    // Call guard audit log
    getGuardLog: (limit?: number) => Promise<Array<{
      id: number;
      lead_id: string | null;
      phone_normalized: string;
      lead_name: string | null;
      block_reason: string;
      block_details: string | null;
      caller: string;
      override_used: number;
      created_at: string;
    }>>;
  };
}

export interface BrowserSyncProgress {
  dealId: string;
  dealName: string;
  status: 'navigating' | 'waiting_login' | 'scanning' | 'downloading' | 'analyzing' | 'done' | 'error' | 'skipped';
  filesFound: number;
  filesDownloaded: number;
  currentFile?: string;
  error?: string;
  dealIndex?: number;
  dealTotal?: number;
}

export interface FubActivity {
  id: number;
  deal_id: string;
  fub_person_id: string;
  fub_id: number;
  activity_type: 'note' | 'call' | 'text' | 'email';
  direction?: 'inbound' | 'outbound' | null;
  subject?: string | null;
  body?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  duration?: number | null;
  outcome?: string | null;
  status?: string | null;
  created_by?: string | null;
  activity_date: string;
  raw_json?: string | null;
  created_at?: string;
}

export interface FubPersonSyncStatus {
  total: number;
  synced: number;
  errors: number;
  lastSync: string | null;
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
