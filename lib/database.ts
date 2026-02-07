// lib/database.ts - Renderer-side database adapter
// Wraps window.electronAPI IPC calls for use in React components

const api = window.electronAPI;

// ---- deals ----

export async function fetchAllDeals(orderBy = 'created_at', ascending = false): Promise<any[]> {
  return api.db.getDeals({ orderBy, ascending });
}

export async function fetchDealById(id: string): Promise<any> {
  return api.db.getDealById(id);
}

export async function insertDeal(deal: any): Promise<any> {
  return api.db.insertDeal(deal);
}

export async function updateDealFields(id: string, fields: Record<string, any>): Promise<void> {
  await api.db.updateDeal(id, fields);
}

export async function deleteDealById(id: string): Promise<void> {
  await api.db.deleteDeal(id);
}

export async function upsertDeals(deals: any[]): Promise<void> {
  await api.db.upsertDeals(deals);
}

export async function getExistingAirtableIds(): Promise<string[]> {
  return api.db.getExistingAirtableIds();
}

export async function deleteDealsByAirtableIds(ids: string[]): Promise<void> {
  await api.db.deleteDealsByAirtableIds(ids);
}

export async function checkStageChange(dealId: string, newStage: string): Promise<{
  canProceed: boolean;
  incompleteTasks?: { id: string; title: string; status: string }[];
  currentStage?: string;
  newStage?: string;
  error?: string;
}> {
  return api.db.checkStageChange(dealId, newStage);
}

// ---- tasks ----

export async function fetchAllTasks(orderBy = 'created_at', ascending = false): Promise<any[]> {
  return api.db.getTasks({ orderBy, ascending });
}

export async function fetchTasksByDealId(dealId: string): Promise<any[]> {
  return api.db.getTasksByDealId(dealId);
}

// Legacy: lookup by airtable_id (backward compat)
export async function fetchTasksByDeal(dealAirtableId: string): Promise<any[]> {
  return api.db.getTasksByDealAirtableId(dealAirtableId);
}

export async function fetchTaskById(id: string): Promise<any> {
  return api.db.getTaskById(id);
}

export async function insertTask(task: any): Promise<any> {
  return api.db.insertTask(task);
}

export async function updateTaskFields(id: string, fields: Record<string, any>): Promise<void> {
  await api.db.updateTask(id, fields);
}

export async function updateTaskWithLog(id: string, fields: Record<string, any>): Promise<void> {
  await api.db.updateTaskWithLog(id, fields);
}

export async function getTaskActivity(taskId: string): Promise<any[]> {
  return api.db.getTaskActivity(taskId);
}

export async function logTaskActivity(taskId: string, action: string, details?: string): Promise<void> {
  await api.db.logTaskActivity(taskId, action, details);
}

export async function upsertTasks(tasks: any[]): Promise<void> {
  await api.db.upsertTasks(tasks);
}

export async function getExistingTaskAirtableIds(): Promise<string[]> {
  return api.db.getExistingTaskAirtableIds();
}

export async function deleteTasksByAirtableIds(ids: string[]): Promise<void> {
  await api.db.deleteTasksByAirtableIds(ids);
}

// ---- daily_leads ----

export async function fetchDailyLeads(orderBy = 'score', ascending = false): Promise<any[]> {
  return api.db.getDailyLeads({ orderBy, ascending });
}

export async function updateLeadCompleted(id: number, isCompleted: boolean): Promise<void> {
  await api.db.updateLead(id, { is_completed: isCompleted });
}

// ---- market_analysis ----

export async function fetchMarketData(limit = 100): Promise<any[]> {
  return api.db.getMarketData({ orderBy: 'absorption_rate', ascending: false, limit });
}

// ---- files ----

export async function listFiles(dealId: string, category?: string): Promise<any[]> {
  return api.files.listFiles(dealId, category);
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.files.deleteFile(fileId);
}

// ---- deadlines ----

export async function createDeadline(deadline: { deal_id: string; label: string; due_date: string }): Promise<any> {
  return api.deadlines.create(deadline);
}

export async function updateDeadline(id: string, fields: Record<string, any>): Promise<void> {
  await api.deadlines.update(id, fields);
}

export async function deleteDeadline(id: string): Promise<void> {
  await api.deadlines.delete(id);
}

export async function getDeadlinesByDeal(dealId: string): Promise<any[]> {
  return api.deadlines.getByDeal(dealId);
}

export async function getAllDeadlines(): Promise<any[]> {
  return api.deadlines.getAll();
}

export async function getUpcomingDeadlines(daysAhead?: number): Promise<any[]> {
  return api.deadlines.getUpcoming(daysAhead);
}

export async function acknowledgeDeadline(id: string): Promise<void> {
  await api.deadlines.acknowledge(id);
}

export function onDeadlineAlert(callback: (data: any) => void): void {
  api.deadlines.onAlert(callback);
}

// ---- audit log ----

export async function getAuditLog(dealId: string, limit?: number): Promise<any[]> {
  return api.audit.getByDeal(dealId, limit);
}

export async function logAuditEvent(dealId: string | null, eventType: string, details: any): Promise<void> {
  await api.audit.log(dealId, eventType, details);
}

// ---- settings ----

export async function getSetting(key: string): Promise<string | null> {
  return api.settings.get(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await api.settings.set(key, value);
}

export async function getAllSettings(): Promise<{ key: string; hasValue: boolean; updated_at?: string }[]> {
  return api.settings.getAll();
}

// ---- sync ----

export async function getSyncQueueStatus(): Promise<{
  pending: number;
  failed: number;
  lastSync: string | null;
}> {
  return api.sync.getQueueStatus();
}

// ---- FUB file sync ----

export async function getFubFileSyncStatus(dealId: string): Promise<any> {
  return api.fub.getFileSyncStatus(dealId);
}

export async function getAllFubFileSyncStatuses(): Promise<any[]> {
  return api.fub.getAllFileSyncStatuses();
}

export async function triggerFubFileSync(dealId?: string): Promise<{ success: boolean; synced: number; errors: number }> {
  return api.fub.triggerFileSync(dealId);
}

export async function getDealsWithFubLinks(): Promise<{ id: string; deal_name: string; fub_person_id: string }[]> {
  return api.fub.getDealsWithFubLinks();
}

// ---- AI ----

export async function askAI(query: string, dealId: string): Promise<{ answer: string }> {
  return api.ai.askQuestion(query, dealId);
}

// ---- Airtable (proxied through main process) ----

export async function airtableFetchDeals(): Promise<any[]> {
  return api.airtable.fetchDeals();
}

export async function airtableCreateRecord(fields: Record<string, any>): Promise<any> {
  return api.airtable.createRecord(fields);
}

export async function airtableUpdateRecord(recordId: string, fields: Record<string, any>): Promise<any> {
  return api.airtable.updateRecord(recordId, fields);
}

export async function airtableDeleteRecord(recordId: string): Promise<any> {
  return api.airtable.deleteRecord(recordId);
}

export async function airtableUpdateTask(recordId: string, fields: Record<string, any>): Promise<any> {
  return api.airtable.updateTask(recordId, fields);
}

export async function airtableFetchTasks(): Promise<any[]> {
  return api.airtable.fetchTasks();
}

// ---- PDF Analysis ----

export async function analyzePdf(dealId: string, filePath: string, fileName: string, category: string): Promise<any> {
  return api.pdf.analyze(dealId, filePath, fileName, category);
}

export async function getPdfAnalysis(dealId: string, filePath: string): Promise<any> {
  return api.pdf.getAnalysis(dealId, filePath);
}

export async function getPdfAnalysesByDeal(dealId: string): Promise<any[]> {
  return api.pdf.getAnalysesByDeal(dealId);
}

// ---- AI Deal Analysis ----

export async function analyzeDeal(dealId: string): Promise<any> {
  return api.ai.analyzeDeal(dealId);
}

export async function getDealAnalysis(dealId: string): Promise<any> {
  return api.ai.getDealAnalysis(dealId);
}
