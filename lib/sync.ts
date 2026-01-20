
import { supabase } from './supabase';
import { Deal } from '../types';

const AIRTABLE_PAT = import.meta.env.VITE_AIRTABLE_PAT;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;

if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
    console.error("Missing Airtable environment variables");
}

/*
 * Fetches all records from the 'Deals' table in Airtable.
 */
export async function fetchAirtableDeals(): Promise<any[]> {
    // Use Serverless Function to proxy request (avoids CORS and handles Env vars securely)
    // In local development with 'vite', this might 404 unless we setup a proxy or run 'vercel dev'.
    // We will attempt the API route first.

    try {
        const response = await fetch('/api/sync');

        // If API route is not found (e.g. local without vercel dev), fallback to direct logic if Env vars exist
        // Note: Direct logic requires VITE_ keys to be exposed to client. 
        if (response.status === 404 && import.meta.env.DEV) {
            console.warn("API route not found (local?), falling back to direct fetch.");
            return fetchAirtableDealsDirect();
        }

        if (!response.ok) {
            throw new Error(`Sync API failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.records || [];
    } catch (error) {
        console.error("Error fetching from /api/sync:", error);
        // Fallback or re-throw? 
        // If we are local and simple 'fetch' failed, maybe try direct?
        if (import.meta.env.DEV) {
            return fetchAirtableDealsDirect();
        }
        throw error;
    }
}

/*
 * Legacy/Local Method: Fetches directly from Airtable (Client-side)
 * Kept for local dev fallback.
 */
async function fetchAirtableDealsDirect(): Promise<any[]> {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
        console.error("Missing Airtable keys for direct fetch");
        return [];
    }

    let allRecords: any[] = [];
    let offset = '';
    const headers = { Authorization: `Bearer ${AIRTABLE_PAT}` };

    try {
        do {
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Deals?offset=${offset}`;
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`Airtable fetch failed: ${response.statusText}`);
            const data = await response.json();
            allRecords = [...allRecords, ...data.records];
            offset = data.offset;
        } while (offset);
        return allRecords;
    } catch (error) {
        console.error("Direct Airtable fetch failed:", error);
        throw error;
    }
}

/*
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

        // New Mapped Fields
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

/*
 * Sync Function: Fetches from Airtable, Upserts to Supabase, Returns merged data.
 * Strategy: "Refresh button to pull from Airtable first, then check Supabase"
 * Uses 'airtable_id' for unique mapping.
 */
export async function syncAirtableToSupabase(): Promise<Deal[]> {
    console.log("Starting Sync...");

    try {
        // 1. Fetch from Airtable
        const airtableRecords = await fetchAirtableDeals();
        console.log(`Fetched ${airtableRecords.length} records from Airtable.`);

        if (airtableRecords.length === 0) return [];

        // 2. Map to Supabase Schema
        const mappedDeals = airtableRecords.map(mapAirtableRecordToDeal);

        // 3. Upsert to Supabase (Shadow Write)
        // We use 'airtable_id' as the conflict key as defined in the Supabase schema.
        try {
            const batchSize = 50;
            for (let i = 0; i < mappedDeals.length; i += batchSize) {
                const chunk = mappedDeals.slice(i, i + batchSize);
                const { error } = await supabase.from('deal_vault').upsert(chunk, {
                    onConflict: 'airtable_id',
                    ignoreDuplicates: false
                });

                if (error) {
                    console.error("Supabase Upsert Error (RLS?):", error);
                    // We continue even if upsert fails, so user still sees Airtable data.
                }
            }
        } catch (supaError) {
            console.error("Supabase Sync Exception:", supaError);
        }

        console.log("Sync Complete. Returning mapped deals directly.");

        // 4. Return the mapped data directly
        // This mitigates RLS issues where 'select' might return empty.
        // We prioritize showing the user the data we just fetched from Airtable.
        return mappedDeals as unknown as Deal[];

    } catch (e) {
        console.error("Sync Logic Error:", e);
        throw e;
    }
}


/*
 * Updates a record in Airtable and triggers Sync.
 */
export async function updateAirtableRecord(recordId: string, fields: Record<string, any>) {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) throw new Error("Missing Config");

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Deals/${recordId}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to update Airtable: ${err}`);
    }

    const result = await response.json();

    // Trigger Sync immediately after success
    try {
        await syncAirtableToSupabase();
    } catch (syncError) {
        // Requirement 4: Log error locally. 
        // NOTE: In a browser environment, we cannot write a file to the project folder.
        // We log clearly to console.
        console.error("Sync Error: Airtable update succeeded but Supabase sync failed.", syncError);
    }

    return result;
}

// Deprecated alias compatibility if needed, but we will update usages.
// Update existing tool
export const syncDealsFromAirtable = syncAirtableToSupabase;

/*
 * Creates a new record in Airtable.
 */
export async function createAirtableRecord(fields: Record<string, any>) {
    // 1. Try Serverless Function (Preferred)
    try {
        const response = await fetch('/api/create-deal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields })
        });

        // Fallback for local dev if API 404
        if (response.status === 404 && import.meta.env.DEV) {
            console.warn("API route not found (local), using direct create.");
            return createAirtableRecordDirect(fields);
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.details || response.statusText);
        }

        return await response.json();

    } catch (e) {
        console.error("Create API failed:", e);
        if (import.meta.env.DEV) return createAirtableRecordDirect(fields);
        throw e;
    }
}

// Fallback for Local Dev
async function createAirtableRecordDirect(fields: Record<string, any>) {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) throw new Error("Missing Config");

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Deals`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Direct Create Failed: ${txt}`);
    }

    return await response.json();
}
