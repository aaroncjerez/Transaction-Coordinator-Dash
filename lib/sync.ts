import { Deal } from '../types';
import {
  airtableFetchDeals,
  airtableFetchTasks,
  airtableCreateRecord,
  airtableUpdateRecord,
  airtableDeleteRecord,
  airtableUpdateTask,
  upsertDeals,
  upsertTasks,
  getExistingAirtableIds,
  getExistingTaskAirtableIds,
  deleteDealsByAirtableIds,
  deleteTasksByAirtableIds,
} from './database';

/**
 * Maps an Airtable record to our Deal interface.
 */
export function mapAirtableRecordToDeal(record: any): Partial<Deal> {
  const f = record.fields || {};
  const dealName = f["Deal Name"] || "";
  const lastName = dealName.includes(" - ") ? dealName.split(" - ")[0].trim() : "";

  return {
    airtable_id: record.id,
    deal_name: dealName,
    last_name: lastName,
    deal_type: f["Deal type"] || "New",
    stage: f["Stage"] || "New",
    county: f["County"] || "",
    state: f["State"] || "",
    notes: f["Notes"] || "",
    purchase_price: f["Purchase Price"] || 0,
    expected_sales_price: f["Expected sales price"] || 0,
    contract_execution_date: f["Contract Execution date"] || null,
    expected_close_date: f["Expected close date"] || null,
    close_date: f["Close date"] || null,
    phone_number: Array.isArray(f["Phone (from Contacts)"]) ? f["Phone (from Contacts)"][0] : f["Phone (from Contacts)"],
    assigned_to: f["Assigned To"] || null,
    days_to_close: f["Days To Close"] || null,
    purchase_agreement_files: f["Purchase Agreement"] || [],
    funding_agreement_files: f["Funding agreement"] || [],
    deed_files: f["Deed"] || [],
    plat_files: f["Plat"] || [],
    soil_test_files: f["Soil test"] || [],
    hud_files: f["HUD"] || [],
    sale_contract_files: f["Sale Contract"] || [],
    due_diligence_link: f["Due Diligence link"] || "",
  };
}

/**
 * Maps an Airtable task record to our local task schema.
 */
export function mapAirtableRecordToTask(record: any): any {
  const f = record.fields || {};
  return {
    airtable_id: record.id,
    task_name: f["Task Name"] || f["Name"] || "",
    status: f["Status"] || "To Do",
    notes: f["Notes"] || "",
    assignee: f["Assignee"] || null,
    task_order: f["Order"] || null,
    deal_airtable_id: Array.isArray(f["Deal"]) ? f["Deal"][0] : (f["Deal"] || null),
  };
}

/**
 * Fetches all records from Airtable via the Electron main process.
 */
export async function fetchAirtableDeals(): Promise<any[]> {
  return airtableFetchDeals();
}

/**
 * Sync: Fetches from Airtable, upserts to local SQLite, garbage collects stale records.
 */
export async function syncFromAirtable(): Promise<Deal[]> {
  console.log("Starting Sync...");

  try {
    // 1. Fetch from Airtable
    const airtableRecords = await airtableFetchDeals();
    console.log(`Fetched ${airtableRecords.length} records from Airtable.`);

    if (airtableRecords.length === 0) return [];

    // 2. Map to local schema
    const mappedDeals = airtableRecords.map(mapAirtableRecordToDeal);
    const airtableIds = mappedDeals.map(d => d.airtable_id).filter(Boolean) as string[];

    // 3. Upsert to local SQLite
    await upsertDeals(mappedDeals);

    // 4. Garbage collection: delete local records not in Airtable
    if (airtableIds.length > 0) {
      const existingIds = await getExistingAirtableIds();
      const idsToDelete = existingIds.filter(id => !airtableIds.includes(id));
      if (idsToDelete.length > 0) {
        console.log(`Garbage collecting ${idsToDelete.length} records...`);
        await deleteDealsByAirtableIds(idsToDelete);
      }
    }

    // 5. Sync Tasks from Airtable
    try {
      const airtableTaskRecords = await airtableFetchTasks();
      console.log(`Fetched ${airtableTaskRecords.length} tasks from Airtable.`);

      if (airtableTaskRecords.length > 0) {
        const mappedTasks = airtableTaskRecords.map(mapAirtableRecordToTask);
        const taskAirtableIds = mappedTasks.map((t: any) => t.airtable_id).filter(Boolean) as string[];

        await upsertTasks(mappedTasks);

        // Garbage collect stale tasks
        if (taskAirtableIds.length > 0) {
          const existingTaskIds = await getExistingTaskAirtableIds();
          const taskIdsToDelete = existingTaskIds.filter(id => !taskAirtableIds.includes(id));
          if (taskIdsToDelete.length > 0) {
            console.log(`Garbage collecting ${taskIdsToDelete.length} tasks...`);
            await deleteTasksByAirtableIds(taskIdsToDelete);
          }
        }
      }
    } catch (taskErr: any) {
      console.error("Task sync FAILED (deals still synced):", taskErr?.message || taskErr);
      console.error("Full task sync error:", taskErr);
    }

    console.log("Sync Complete.");
    return mappedDeals as unknown as Deal[];

  } catch (e) {
    console.error("Sync Logic Error:", e);
    throw e;
  }
}

/**
 * Updates a record in Airtable and triggers sync.
 */
export async function updateAirtableRecord(recordId: string, fields: Record<string, any>) {
  const result = await airtableUpdateRecord(recordId, fields);

  // Trigger sync after success
  try {
    await syncFromAirtable();
  } catch (syncError) {
    console.error("Sync Error: Airtable update succeeded but local sync failed.", syncError);
  }

  return result;
}

/**
 * Updates a TASK record in Airtable.
 */
export async function updateAirtableTask(recordId: string, fields: Record<string, any>) {
  return airtableUpdateTask(recordId, fields);
}

/**
 * Deletes a record from Airtable.
 */
export async function deleteAirtableRecord(recordId: string) {
  return airtableDeleteRecord(recordId);
}

/**
 * Creates a new record in Airtable.
 */
export async function createAirtableRecord(fields: Record<string, any>) {
  return airtableCreateRecord(fields);
}
