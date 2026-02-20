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

export async function updateDealFields(id: string, fields: Record<string, any>): Promise<{ success: boolean; fubPush?: { queued: boolean; success?: boolean; error?: string } }> {
  return api.db.updateDeal(id, fields);
}

export async function deleteDealById(id: string): Promise<void> {
  await api.db.deleteDeal(id);
}

export async function upsertDeals(deals: any[]): Promise<void> {
  await api.db.upsertDeals(deals);
}

export async function purgeOldDeals(): Promise<{ purged: number }> {
  return api.db.purgeOldDeals();
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

// ---- daily_leads ----

export async function fetchDailyLeads(orderBy = 'score', ascending = false): Promise<any[]> {
  return api.db.getDailyLeads({ orderBy, ascending });
}

export async function updateLeadCompleted(id: number, isCompleted: boolean): Promise<void> {
  await api.db.updateLead(id, { is_completed: isCompleted });
}

export async function updateLeadFields(id: number, fields: Record<string, any>): Promise<void> {
  await api.db.updateLead(id, fields);
}

export async function fetchAndAnalyzeLeads(): Promise<{ success: boolean; analyzed: number; errors: number; total: number }> {
  return api.leads.fetchAndAnalyze();
}

export async function refreshLeadAnalysis(leadId: number): Promise<{ success: boolean; lead?: any; error?: string }> {
  return api.leads.refreshAnalysis(leadId);
}

export async function markLeadContacted(leadId: number): Promise<{ success: boolean }> {
  return api.leads.markContacted(leadId);
}

export async function unmarkLeadContacted(leadId: number): Promise<{ success: boolean }> {
  return api.leads.unmarkContacted(leadId);
}

export async function getLeadStats(): Promise<{ total: number; newLeads48h: number; doneToday: number; highDiscount: number }> {
  return api.leads.getStats();
}

export function onLeadAnalysisProgress(callback: (data: { current: number; total: number; name: string }) => void): void {
  api.leads.onAnalysisProgress(callback);
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

// ---- task reminders ----

export async function createReminder(taskId: string, remindAt: string): Promise<any> {
  return api.reminders.create(taskId, remindAt);
}

export async function getRemindersByTask(taskId: string): Promise<any[]> {
  return api.reminders.getByTask(taskId);
}

export async function deleteReminder(id: string): Promise<void> {
  await api.reminders.delete(id);
}

export async function getPendingReminders(): Promise<any[]> {
  return api.reminders.getPending();
}

export function onReminderFired(callback: (data: any) => void): void {
  api.reminders.onFired(callback);
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

export async function testSlackWebhook(): Promise<{ success: boolean; error?: string }> {
  return api.settings.testSlackWebhook();
}

// ---- FUB person sync ----

export async function triggerFubPersonSync(): Promise<{ success: boolean; newDeals: number; updatedDeals: number; errors: number }> {
  return api.fub.syncPeople();
}

export async function pushDealStageToFub(dealId: string, stage: string): Promise<{ success: boolean }> {
  return api.fub.pushStage(dealId, stage);
}

export async function postTaskNoteToFub(dealId: string, taskId: string): Promise<{ success: boolean }> {
  return api.fub.postTaskNote(dealId, taskId);
}

export async function getFubPersonSyncStatus(): Promise<any> {
  return api.fub.getPersonSyncStatus();
}

export async function getFubPersonSyncRecords(): Promise<any[]> {
  return api.fub.getPersonSyncRecords();
}

export function onFubPersonSyncComplete(callback: (data: any) => void): void {
  api.fub.onPersonSyncComplete(callback);
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

// ---- FUB activities ----

export async function getFubActivities(dealId: string, activityType?: string): Promise<any[]> {
  return api.fub.getActivities(dealId, activityType);
}

export async function syncFubActivities(dealId: string): Promise<{ success: boolean; synced?: number; error?: string; notes?: number; calls?: number; texts?: number; emails?: number }> {
  return api.fub.syncActivities(dealId);
}

// ---- AI ----

export async function askAI(query: string, dealId: string): Promise<{ answer: string }> {
  return api.ai.askQuestion(query, dealId);
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

export async function crawlDealDeadlines(dealId: string): Promise<any> {
  return api.pdf.crawlDealDeadlines(dealId);
}

export async function crawlAllDeadlines(): Promise<any> {
  return api.pdf.crawlAllDeadlines();
}

// ---- AI Deal Analysis ----

export async function analyzeDeal(dealId: string): Promise<any> {
  return api.ai.analyzeDeal(dealId);
}

export async function getDealAnalysis(dealId: string): Promise<any> {
  return api.ai.getDealAnalysis(dealId);
}

// ---- KPI Dashboard ----

export async function fetchKpiDashboardData(): Promise<any> {
  return api.kpi.getDashboardData();
}

export async function fetchKpiCeoBrief(dashboardState: any): Promise<any> {
  return api.kpi.getCeoBrief(dashboardState);
}

// ---- CFO Insights ----

export async function getCfoInsights(data: any): Promise<any> {
  return api.cfo.getInsights(data);
}

// ---- AI Dialer (Supabase) ----

export async function fetchDialerCallQueue(limit?: number): Promise<any[]> {
  return api.dialer.getCallQueue(limit);
}

export async function fetchDialerCallHistory(limit?: number, filters?: any): Promise<any[]> {
  return api.dialer.getCallHistory(limit, filters);
}

export async function fetchDialerCallsForLead(phoneNormalized: string): Promise<any[]> {
  return api.dialer.getCallsForLead(phoneNormalized);
}

export async function fetchDialerLeadById(id: string): Promise<any> {
  return api.dialer.getLeadById(id);
}

export async function fetchDialerLeadMemory(phoneNormalized: string): Promise<any> {
  return api.dialer.getLeadMemory(phoneNormalized);
}

export async function fetchDialerDNCList(): Promise<any[]> {
  return api.dialer.getDNCList();
}

export async function fetchDialerDNCStats(): Promise<any> {
  return api.dialer.getDNCStats();
}

export async function addDialerManualDNC(phone: string, reason: string): Promise<any> {
  return api.dialer.addManualDNC(phone, reason);
}

export async function removeDialerDNC(phone: string): Promise<any> {
  return api.dialer.removeFromDNC(phone);
}

export async function fetchDialerDailyStats(days?: number): Promise<any[]> {
  return api.dialer.getDailyStats(days);
}

export async function fetchDialerHotLeads(): Promise<any[]> {
  return api.dialer.getHotLeads();
}

export async function fetchDialerCallbacksDue(): Promise<any[]> {
  return api.dialer.getCallbacksDue();
}

export async function triggerDialerCadence(): Promise<{ success: boolean }> {
  return api.dialer.triggerCadence();
}

export async function reviewDialerCall(callId: string): Promise<any> {
  return api.dialer.reviewCall(callId);
}

export async function reviewDialerRecentCalls(limit?: number): Promise<any> {
  return api.dialer.reviewRecentCalls(limit);
}

export async function fetchDialerTodayCallCount(): Promise<number> {
  return api.dialer.getTodayCallCount();
}

export function onDialerReviewProgress(callback: (data: { current: number; total: number; callId: string }) => void): void {
  api.dialer.onReviewProgress(callback);
}

export function onDialerNewCalls(callback: (data: { count: number }) => void): void {
  api.dialer.onNewCalls(callback);
}

export async function uploadDialerLeads(leads: any[], batchId: string): Promise<import('../types').UploadBatchResult> {
  return api.dialer.uploadLeads(leads, batchId);
}

export function onDialerUploadProgress(callback: (data: { processed: number; total: number }) => void): void {
  api.dialer.onUploadProgress(callback);
}

export async function syncDialerFubDNC(): Promise<{ total: number; added: number; duplicates: number; errors: number; fub_people_fetched: number; unique_phones: number }> {
  return api.dialer.syncFubDNC();
}

export function onDialerFubSyncProgress(callback: (data: { stage: string; fetched: number; phones: number }) => void): void {
  api.dialer.onFubSyncProgress(callback);
}

export async function fetchDialerUploadBatches(): Promise<Array<{ batch_id: string; lead_count: number; uploaded_at: string }>> {
  return api.dialer.getUploadBatches();
}

export async function fetchDialerUploadBatchLeads(batchId: string): Promise<any[]> {
  return api.dialer.getUploadBatchLeads(batchId);
}

export async function deleteDialerUploadBatch(batchId: string): Promise<{ deleted: number }> {
  return api.dialer.deleteUploadBatch(batchId);
}

export async function dialerCallLead(lead: any): Promise<{ call_id: string; status: string }> {
  return api.dialer.callLead(lead);
}

// ---- AI Dialer — Local Cache + Batch Dial + Inbound ----

export async function fetchLocalDialerCallQueue(limit?: number): Promise<any[]> {
  return api.dialer.getLocalCallQueue(limit);
}

export async function fetchLocalDialerCallHistory(limit?: number, filters?: any): Promise<any[]> {
  return api.dialer.getLocalCallHistory(limit, filters);
}

export async function fetchLocalDialerDNCList(): Promise<any[]> {
  return api.dialer.getLocalDNCList();
}

export async function fetchLocalDialerDNCStats(): Promise<any> {
  return api.dialer.getLocalDNCStats();
}

export async function fetchLocalDialerInboundCalls(limit?: number): Promise<any[]> {
  return api.dialer.getLocalInboundCalls(limit);
}

export async function fetchDialerInboundCalls(limit?: number): Promise<any[]> {
  return api.dialer.getInboundCalls(limit);
}

export async function startBatchDial(leadIds: string[]): Promise<import('../types').BatchDialResult> {
  return api.dialer.batchDial(leadIds);
}

export function onBatchDialProgress(callback: (data: import('../types').BatchDialProgress) => void): void {
  api.dialer.onBatchDialProgress(callback);
}

export function onDialerInboundCall(callback: (data: import('../types').InboundCallNotification) => void): void {
  api.dialer.onInboundCall(callback);
}

export function onDialerCacheUpdated(callback: (data: { type: string }) => void): void {
  api.dialer.onCacheUpdated(callback);
}

export async function forceDialerSync(): Promise<{ success: boolean }> {
  return api.dialer.forceSync();
}
