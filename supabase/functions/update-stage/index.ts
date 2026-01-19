import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Environment variables (Set these in Supabase Dashboard -> Edge Functions -> Secrets)
// AIRTABLE_PAT
// AIRTABLE_BASE_ID

serve(async (req) => {
    try {
        const { record } = await req.json()

        // Check if this is a relevant update
        // We expect the payload from a Database Webhook triggered on UPDATE of deal_vault
        if (!record || !record.airtable_id || !record.stage) {
            return new Response(JSON.stringify({ message: "No relevant data" }), { headers: { "Content-Type": "application/json" } });
        }

        const airtableId = record.airtable_id;
        const newStage = record.stage;

        console.log(`Syncing Deal ${airtableId} to Stage: ${newStage}`);

        const baseId = Deno.env.get('AIRTABLE_BASE_ID');
        const pat = Deno.env.get('AIRTABLE_PAT');

        if (!baseId || !pat) {
            throw new Error("Missing Airtable Credentials");
        }

        // Map Supabase 'Stage' to Airtable 'Status' (Single Select ID or Name)
        // Note: In a real scenario, we might need a mapping table if names don't match exactly.
        // For now, assuming names match or we pass the text. Airtable API accepts text for Single Select if "typecast: true" is usually not for Single Select updates via API 
        // without ID unless we PATCH.

        const url = `https://api.airtable.com/v0/${baseId}/Deals/${airtableId}`;

        const body = JSON.stringify({
            fields: {
                "Status": newStage // 'Status' is the Airtable field name we found in schema analysis
            }
        });

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${pat}`,
                'Content-Type': 'application/json'
            },
            body
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Airtable API Error: ${err}`);
        }

        return new Response(
            JSON.stringify({ message: "Synced successfully" }),
            { headers: { "Content-Type": "application/json" } },
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        )
    }
})
