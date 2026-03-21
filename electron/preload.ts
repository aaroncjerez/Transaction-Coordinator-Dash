import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    // deals
    getDeals: (options?: { orderBy?: string; ascending?: boolean }) =>
      ipcRenderer.invoke('db:deals:getAll', options),
    getDealById: (id: string) =>
      ipcRenderer.invoke('db:deals:getById', id),
    insertDeal: (deal: any) =>
      ipcRenderer.invoke('db:deals:insert', deal),
    upsertDeals: (deals: any[]) =>
      ipcRenderer.invoke('db:deals:upsert', deals),
    updateDeal: (id: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('db:deals:update', id, fields),
    deleteDeal: (id: string) =>
      ipcRenderer.invoke('db:deals:delete', id),
    purgeOldDeals: () =>
      ipcRenderer.invoke('db:deals:purgeOld'),
    checkStageChange: (dealId: string, newStage: string) =>
      ipcRenderer.invoke('db:deals:checkStageChange', dealId, newStage),

    // tasks
    getTasks: (options?: { orderBy?: string; ascending?: boolean }) =>
      ipcRenderer.invoke('db:tasks:getAll', options),
    getTasksByDealId: (dealId: string) =>
      ipcRenderer.invoke('db:tasks:getByDealId', dealId),
    getTaskById: (id: string) =>
      ipcRenderer.invoke('db:tasks:getById', id),
    insertTask: (task: any) =>
      ipcRenderer.invoke('db:tasks:insert', task),
    updateTask: (id: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('db:tasks:update', id, fields),
    updateTaskWithLog: (id: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('db:tasks:updateWithLog', id, fields),
    getTaskActivity: (taskId: string) =>
      ipcRenderer.invoke('db:tasks:getActivity', taskId),
    logTaskActivity: (taskId: string, action: string, details?: string) =>
      ipcRenderer.invoke('db:tasks:logActivity', taskId, action, details),
    upsertTasks: (tasks: any[]) =>
      ipcRenderer.invoke('db:tasks:upsert', tasks),

    // daily_leads
    getDailyLeads: (options?: { orderBy?: string; ascending?: boolean }) =>
      ipcRenderer.invoke('db:leads:getAll', options),
    updateLead: (id: number, fields: Record<string, any>) =>
      ipcRenderer.invoke('db:leads:update', id, fields),

    // market_analysis
    getMarketData: (options?: { orderBy?: string; ascending?: boolean; limit?: number }) =>
      ipcRenderer.invoke('db:market:getAll', options),
  },

  leads: {
    fetchAndAnalyze: () =>
      ipcRenderer.invoke('leads:fetchAndAnalyze'),
    refreshAnalysis: (leadId: number) =>
      ipcRenderer.invoke('leads:refreshAnalysis', leadId),
    markContacted: (leadId: number) =>
      ipcRenderer.invoke('leads:markContacted', leadId),
    unmarkContacted: (leadId: number) =>
      ipcRenderer.invoke('leads:unmarkContacted', leadId),
    getStats: () =>
      ipcRenderer.invoke('leads:getStats'),
    onAnalysisProgress: (callback: (data: { current: number; total: number; name: string }) => void) => {
      ipcRenderer.on('leads:analysis-progress', (_event: any, data: any) => callback(data));
    },
  },

  ai: {
    askQuestion: (query: string, dealId: string) =>
      ipcRenderer.invoke('ai:ask', query, dealId),
    analyzeDeal: (dealId: string) =>
      ipcRenderer.invoke('ai:analyzeDeal', dealId),
    getDealAnalysis: (dealId: string) =>
      ipcRenderer.invoke('ai:getDealAnalysis', dealId),
    backfillEmbeddings: () =>
      ipcRenderer.invoke('ai:backfillEmbeddings'),
    onBackfillProgress: (callback: (data: { current: number; total: number }) => void) => {
      ipcRenderer.on('ai:backfill-progress', (_event: any, data: any) => callback(data));
    },
  },

  dealSummary: {
    generate: (dealId: string) =>
      ipcRenderer.invoke('deal:generateSummary', dealId),
    get: (dealId: string) =>
      ipcRenderer.invoke('deal:getSummary', dealId),
  },

  notes: {
    create: (dealId: string, content: string, pushToFub: boolean) =>
      ipcRenderer.invoke('notes:create', dealId, content, pushToFub),
    list: (dealId: string) =>
      ipcRenderer.invoke('notes:list', dealId),
  },

  chat: {
    saveMessage: (dealId: string, role: string, content: string, sources?: string) =>
      ipcRenderer.invoke('chat:saveMessage', dealId, role, content, sources),
    getMessages: (dealId: string) =>
      ipcRenderer.invoke('chat:getMessages', dealId),
  },

  pdf: {
    analyze: (dealId: string, filePath: string, fileName: string, category: string) =>
      ipcRenderer.invoke('pdf:analyze', dealId, filePath, fileName, category),
    getAnalysis: (dealId: string, filePath: string) =>
      ipcRenderer.invoke('pdf:getAnalysis', dealId, filePath),
    getAnalysesByDeal: (dealId: string) =>
      ipcRenderer.invoke('pdf:getAnalysesByDeal', dealId),
    crawlDealDeadlines: (dealId: string) =>
      ipcRenderer.invoke('pdf:crawlDealDeadlines', dealId),
    crawlAllDeadlines: () =>
      ipcRenderer.invoke('pdf:crawlAllDeadlines'),
  },

  files: {
    uploadFile: (dealId: string, categoryKey: string, fileName: string, fileBuffer: ArrayBuffer) =>
      ipcRenderer.invoke('files:upload', dealId, categoryKey, fileName, fileBuffer),
    listFiles: (dealId: string, category?: string) =>
      ipcRenderer.invoke('files:list', dealId, category),
    deleteFile: (fileId: string) =>
      ipcRenderer.invoke('files:delete', fileId),
    getFilePath: (relativePath: string) =>
      ipcRenderer.invoke('files:getPath', relativePath),
    readPdf: (filePath: string) =>
      ipcRenderer.invoke('files:readPdf', filePath),
  },

  deadlines: {
    create: (deadline: any) =>
      ipcRenderer.invoke('deadlines:create', deadline),
    update: (id: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('deadlines:update', id, fields),
    delete: (id: string) =>
      ipcRenderer.invoke('deadlines:delete', id),
    getByDeal: (dealId: string) =>
      ipcRenderer.invoke('deadlines:getByDeal', dealId),
    getAll: () =>
      ipcRenderer.invoke('deadlines:getAll'),
    getUpcoming: (daysAhead?: number) =>
      ipcRenderer.invoke('deadlines:getUpcoming', daysAhead),
    acknowledge: (id: string) =>
      ipcRenderer.invoke('deadlines:acknowledge', id),
    onAlert: (callback: (data: any) => void) => {
      ipcRenderer.on('deadline:alert', (_event: any, data: any) => callback(data));
    },
  },

  audit: {
    getByDeal: (dealId: string, limit?: number) =>
      ipcRenderer.invoke('audit:getByDeal', dealId, limit),
    log: (dealId: string | null, eventType: string, details: any) =>
      ipcRenderer.invoke('audit:log', dealId, eventType, details),
  },

  settings: {
    get: (key: string) =>
      ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) =>
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () =>
      ipcRenderer.invoke('settings:getAll'),
    testSlackWebhook: () =>
      ipcRenderer.invoke('settings:testSlackWebhook'),
  },

  fub: {
    // Person sync
    syncPeople: () =>
      ipcRenderer.invoke('fub:syncPeople'),
    pushStage: (dealId: string, stage: string) =>
      ipcRenderer.invoke('fub:pushStage', dealId, stage),
    postTaskNote: (dealId: string, taskId: string) =>
      ipcRenderer.invoke('fub:postTaskNote', dealId, taskId),
    getPersonSyncStatus: () =>
      ipcRenderer.invoke('fub:getPersonSyncStatus'),
    getPersonSyncRecords: () =>
      ipcRenderer.invoke('fub:getPersonSyncRecords'),
    onPersonSyncComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('fub:person-sync-complete', (_event: any, data: any) => callback(data));
    },
    // Activities
    getActivities: (dealId: string, activityType?: string) =>
      ipcRenderer.invoke('fub:getActivities', dealId, activityType),
    syncActivities: (dealId: string) =>
      ipcRenderer.invoke('fub:syncActivities', dealId),
    // File sync
    getFileSyncStatus: (dealId: string) =>
      ipcRenderer.invoke('fub:getFileSyncStatus', dealId),
    getAllFileSyncStatuses: () =>
      ipcRenderer.invoke('fub:getAllFileSyncStatuses'),
    triggerFileSync: (dealId?: string) =>
      ipcRenderer.invoke('fub:triggerFileSync', dealId),
    getDealsWithFubLinks: () =>
      ipcRenderer.invoke('fub:getDealsWithFubLinks'),
    // Browser file sync
    browserSyncDeal: (dealId: string) =>
      ipcRenderer.invoke('fub-browser:syncDeal', dealId),
    browserSyncAll: () =>
      ipcRenderer.invoke('fub-browser:syncAll'),
    closeFubBrowser: () =>
      ipcRenderer.invoke('fub-browser:closeBrowser'),
    onBrowserSyncProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('fub-browser:progress', (_event: any, data: any) => callback(data));
    },
    offBrowserSyncProgress: () => {
      ipcRenderer.removeAllListeners('fub-browser:progress');
    },
    onBrowserBulkComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('fub-browser:bulk-complete', (_event: any, data: any) => callback(data));
    },
    offBrowserBulkComplete: () => {
      ipcRenderer.removeAllListeners('fub-browser:bulk-complete');
    },
  },

  kpi: {
    getDashboardData: () =>
      ipcRenderer.invoke('kpi:getDashboardData'),
    getCeoBrief: (dashboardState: any) =>
      ipcRenderer.invoke('kpi:getCeoBrief', dashboardState),
  },

  cfo: {
    getInsights: (data: any) =>
      ipcRenderer.invoke('cfo:getInsights', data),
  },

  reminders: {
    create: (taskId: string, remindAt: string) =>
      ipcRenderer.invoke('reminders:create', taskId, remindAt),
    getByTask: (taskId: string) =>
      ipcRenderer.invoke('reminders:getByTask', taskId),
    delete: (id: string) =>
      ipcRenderer.invoke('reminders:delete', id),
    getPending: () =>
      ipcRenderer.invoke('reminders:getPending'),
    onFired: (callback: (data: any) => void) => {
      ipcRenderer.on('reminder:fired', (_event: any, data: any) => callback(data));
    },
  },

  dialer: {
    getCallQueue: (limit?: number, listIds?: string[]) =>
      ipcRenderer.invoke('dialer:getCallQueue', limit, listIds),
    getCallHistory: (limit?: number, filters?: any) =>
      ipcRenderer.invoke('dialer:getCallHistory', limit, filters),
    getCallsForLead: (phoneNormalized: string) =>
      ipcRenderer.invoke('dialer:getCallsForLead', phoneNormalized),
    getLeadById: (id: string) =>
      ipcRenderer.invoke('dialer:getLeadById', id),
    getLeadMemory: (phoneNormalized: string) =>
      ipcRenderer.invoke('dialer:getLeadMemory', phoneNormalized),
    getDNCList: () =>
      ipcRenderer.invoke('dialer:getDNCList'),
    getDNCStats: () =>
      ipcRenderer.invoke('dialer:getDNCStats'),
    addManualDNC: (phone: string, reason: string) =>
      ipcRenderer.invoke('dialer:addManualDNC', phone, reason),
    removeFromDNC: (phone: string) =>
      ipcRenderer.invoke('dialer:removeFromDNC', phone),
    getDailyStats: (days?: number) =>
      ipcRenderer.invoke('dialer:getDailyStats', days),
    getHotLeads: () =>
      ipcRenderer.invoke('dialer:getHotLeads'),
    getCallbacksDue: () =>
      ipcRenderer.invoke('dialer:getCallbacksDue'),
    triggerCadence: () =>
      ipcRenderer.invoke('dialer:triggerCadence'),
    reviewCall: (callId: string) =>
      ipcRenderer.invoke('dialer:reviewCall', callId),
    reviewRecentCalls: (limit?: number) =>
      ipcRenderer.invoke('dialer:reviewRecentCalls', limit),
    getTodayCallCount: () =>
      ipcRenderer.invoke('dialer:getTodayCallCount'),
    onReviewProgress: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:review-progress', handler);
      return () => { ipcRenderer.removeListener('dialer:review-progress', handler); };
    },
    onNewCalls: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:new-calls', handler);
      return () => { ipcRenderer.removeListener('dialer:new-calls', handler); };
    },
    uploadLeads: (leads: any[], batchId: string, listName?: string) =>
      ipcRenderer.invoke('dialer:uploadLeads', leads, batchId, listName),
    onUploadProgress: (callback: (data: { processed: number; total: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:upload-progress', handler);
      return () => { ipcRenderer.removeListener('dialer:upload-progress', handler); };
    },
    syncFubDNC: () =>
      ipcRenderer.invoke('dialer:syncFubDNC'),
    syncFubExceptUnreachedToDNC: () =>
      ipcRenderer.invoke('dialer:syncFubExceptUnreachedToDNC'),
    onFubSyncProgress: (callback: (data: { stage: string; fetched: number; phones: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:fub-sync-progress', handler);
      return () => { ipcRenderer.removeListener('dialer:fub-sync-progress', handler); };
    },
    getUploadBatches: () =>
      ipcRenderer.invoke('dialer:getUploadBatches'),
    getUploadBatchLeads: (batchId: string) =>
      ipcRenderer.invoke('dialer:getUploadBatchLeads', batchId),
    deleteUploadBatch: (batchId: string) =>
      ipcRenderer.invoke('dialer:deleteUploadBatch', batchId),
    callLead: (lead: any) =>
      ipcRenderer.invoke('dialer:callLead', lead),

    // Lists
    getLists: () =>
      ipcRenderer.invoke('dialer:getLists'),

    // Browse all leads in a list (no cadence filtering)
    getLeadsByList: (listIds: string[], limit?: number) =>
      ipcRenderer.invoke('dialer:getLeadsByList', listIds, limit),

    // Local cache reads
    getLocalCallQueue: (limit?: number, listIds?: string[]) =>
      ipcRenderer.invoke('dialer:getLocalCallQueue', limit, listIds),
    getLocalCallHistory: (limit?: number, filters?: any) =>
      ipcRenderer.invoke('dialer:getLocalCallHistory', limit, filters),
    getLocalDNCList: () =>
      ipcRenderer.invoke('dialer:getLocalDNCList'),
    getLocalDNCStats: () =>
      ipcRenderer.invoke('dialer:getLocalDNCStats'),
    getLocalInboundCalls: (limit?: number) =>
      ipcRenderer.invoke('dialer:getLocalInboundCalls', limit),

    // Inbound calls
    getInboundCalls: (limit?: number) =>
      ipcRenderer.invoke('dialer:getInboundCalls', limit),

    // Batch dial
    batchDial: (leadIds: string[], fromNumbers?: string | string[]) =>
      ipcRenderer.invoke('dialer:batchDial', leadIds, fromNumbers),
    getNumberHealth: (fromNumbers: string[]) =>
      ipcRenderer.invoke('dialer:getNumberHealth', fromNumbers),
    getNumberThrottle: (fromNumbers: string[]) =>
      ipcRenderer.invoke('dialer:getNumberThrottle', fromNumbers),
    setNumberLimits: (phone: string, dailyLimit?: number, hourlyLimit?: number) =>
      ipcRenderer.invoke('dialer:setNumberLimits', phone, dailyLimit, hourlyLimit),
    setNumberPaused: (phone: string, paused: boolean, reason?: string) =>
      ipcRenderer.invoke('dialer:setNumberPaused', phone, paused, reason),
    getCampaignCapacity: (fromNumbers: string[]) =>
      ipcRenderer.invoke('dialer:getCampaignCapacity', fromNumbers),
    onBatchDialProgress: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:batch-dial-progress', handler);
      return () => { ipcRenderer.removeListener('dialer:batch-dial-progress', handler); };
    },

    // Inbound call notification
    onInboundCall: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:inbound-call', handler);
      return () => { ipcRenderer.removeListener('dialer:inbound-call', handler); };
    },

    // Cache update notification
    onCacheUpdated: (callback: (data: { type: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on('dialer:cache-updated', handler);
      return () => { ipcRenderer.removeListener('dialer:cache-updated', handler); };
    },

    // Retell phone numbers
    getRetellPhoneNumbers: () =>
      ipcRenderer.invoke('dialer:getRetellPhoneNumbers'),

    // Force sync
    forceSync: () =>
      ipcRenderer.invoke('dialer:forceSync'),

    // Force Retell poll (manual trigger)
    forcePollRetell: () =>
      ipcRenderer.invoke('dialer:forcePollRetell'),

    // Backfill historical calls from Retell
    backfillRetell: (daysBack: number) =>
      ipcRenderer.invoke('dialer:backfillRetell', daysBack),
    onBackfillProgress: (callback: (data: { fetched: number; inserted: number; page: number }) => void) => {
      ipcRenderer.on('dialer:backfill-progress', (_event: any, data: any) => callback(data));
    },

    // Sync + poller health status
    getSyncStatus: () =>
      ipcRenderer.invoke('dialer:syncStatus'),

    // Call guard audit log
    getGuardLog: (limit?: number) =>
      ipcRenderer.invoke('dialer:getGuardLog', limit),

    // Campaign pause/resume
    pauseBatchDial: () =>
      ipcRenderer.invoke('dialer:pauseBatchDial'),
    resumeBatchDial: () =>
      ipcRenderer.invoke('dialer:resumeBatchDial'),
    isBatchPaused: () =>
      ipcRenderer.invoke('dialer:isBatchPaused'),

    // Lead actions
    setLeadOutcome: (phoneNormalized: string, outcome: string, reason?: string) =>
      ipcRenderer.invoke('dialer:setLeadOutcome', phoneNormalized, outcome, reason),
    clearLeadOutcome: (phoneNormalized: string) =>
      ipcRenderer.invoke('dialer:clearLeadOutcome', phoneNormalized),
    setLeadCallback: (phoneNormalized: string, callbackDatetime: string | null) =>
      ipcRenderer.invoke('dialer:setLeadCallback', phoneNormalized, callbackDatetime),
    addLeadNote: (phoneNormalized: string, note: string) =>
      ipcRenderer.invoke('dialer:addLeadNote', phoneNormalized, note),
    getLeadNotes: (phoneNormalized: string) =>
      ipcRenderer.invoke('dialer:getLeadNotes', phoneNormalized),
    deleteLeadNote: (noteId: string) =>
      ipcRenderer.invoke('dialer:deleteLeadNote', noteId),

    // Lead search
    searchLeads: (query: string, limit?: number) =>
      ipcRenderer.invoke('dialer:searchLeads', query, limit),

    // Paginated call history
    getCallHistoryPaginated: (limit?: number, offset?: number, filters?: any) =>
      ipcRenderer.invoke('dialer:getCallHistoryPaginated', limit, offset, filters),

    // RAG: Transcript search + conversation memory
    searchTranscripts: (query: string, options?: { phoneNormalized?: string; topN?: number }) =>
      ipcRenderer.invoke('dialer:searchTranscripts', query, options),
    getPreCallContext: (phoneNormalized: string) =>
      ipcRenderer.invoke('dialer:getPreCallContext', phoneNormalized),
    backfillDialerEmbeddings: () =>
      ipcRenderer.invoke('dialer:backfillEmbeddings'),
  },
});
