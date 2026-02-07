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
    deleteDealsByAirtableIds: (ids: string[]) =>
      ipcRenderer.invoke('db:deals:deleteByAirtableIds', ids),
    getExistingAirtableIds: () =>
      ipcRenderer.invoke('db:deals:getAirtableIds'),
    checkStageChange: (dealId: string, newStage: string) =>
      ipcRenderer.invoke('db:deals:checkStageChange', dealId, newStage),

    // tasks
    getTasks: (options?: { orderBy?: string; ascending?: boolean }) =>
      ipcRenderer.invoke('db:tasks:getAll', options),
    getTasksByDealId: (dealId: string) =>
      ipcRenderer.invoke('db:tasks:getByDealId', dealId),
    getTasksByDealAirtableId: (dealAirtableId: string) =>
      ipcRenderer.invoke('db:tasks:getByDealAirtableId', dealAirtableId),
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
    getExistingTaskAirtableIds: () =>
      ipcRenderer.invoke('db:tasks:getAirtableIds'),
    deleteTasksByAirtableIds: (ids: string[]) =>
      ipcRenderer.invoke('db:tasks:deleteByAirtableIds', ids),

    // daily_leads
    getDailyLeads: (options?: { orderBy?: string; ascending?: boolean }) =>
      ipcRenderer.invoke('db:leads:getAll', options),
    updateLead: (id: number, fields: Record<string, any>) =>
      ipcRenderer.invoke('db:leads:update', id, fields),

    // market_analysis
    getMarketData: (options?: { orderBy?: string; ascending?: boolean; limit?: number }) =>
      ipcRenderer.invoke('db:market:getAll', options),
  },

  airtable: {
    fetchDeals: () => ipcRenderer.invoke('airtable:fetchDeals'),
    fetchTasks: () => ipcRenderer.invoke('airtable:fetchTasks'),
    createRecord: (fields: Record<string, any>) =>
      ipcRenderer.invoke('airtable:createRecord', fields),
    updateRecord: (recordId: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('airtable:updateRecord', recordId, fields),
    deleteRecord: (recordId: string) =>
      ipcRenderer.invoke('airtable:deleteRecord', recordId),
    updateTask: (recordId: string, fields: Record<string, any>) =>
      ipcRenderer.invoke('airtable:updateTask', recordId, fields),
  },

  ai: {
    askQuestion: (query: string, dealId: string) =>
      ipcRenderer.invoke('ai:ask', query, dealId),
    analyzeDeal: (dealId: string) =>
      ipcRenderer.invoke('ai:analyzeDeal', dealId),
    getDealAnalysis: (dealId: string) =>
      ipcRenderer.invoke('ai:getDealAnalysis', dealId),
  },

  pdf: {
    analyze: (dealId: string, filePath: string, fileName: string, category: string) =>
      ipcRenderer.invoke('pdf:analyze', dealId, filePath, fileName, category),
    getAnalysis: (dealId: string, filePath: string) =>
      ipcRenderer.invoke('pdf:getAnalysis', dealId, filePath),
    getAnalysesByDeal: (dealId: string) =>
      ipcRenderer.invoke('pdf:getAnalysesByDeal', dealId),
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
  },

  sync: {
    getQueueStatus: () =>
      ipcRenderer.invoke('sync:getQueueStatus'),
  },

  fub: {
    getFileSyncStatus: (dealId: string) =>
      ipcRenderer.invoke('fub:getFileSyncStatus', dealId),
    getAllFileSyncStatuses: () =>
      ipcRenderer.invoke('fub:getAllFileSyncStatuses'),
    triggerFileSync: (dealId?: string) =>
      ipcRenderer.invoke('fub:triggerFileSync', dealId),
    getDealsWithFubLinks: () =>
      ipcRenderer.invoke('fub:getDealsWithFubLinks'),
  },
});
