// serverless function

export const dynamic = 'force-dynamic';

export default async function handler(request: any, response: any) {
    // 1. Set CORS and Cache Headers
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Critical for "Missing Data": Ensure Vercel never caches this response
    response.setHeader('Cache-Control', 'no-store, max-age=0');

    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    // 2. Get Env Vars (Support both standard and VITE_ prefixed for compatibility)
    const AIRTABLE_PAT = process.env.AIRTABLE_PAT || process.env.VITE_AIRTABLE_PAT;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID;

    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
        return response.status(500).json({
            error: 'Missing Airtable Configuration',
            details: 'Environment variables not found on server.'
        });
    }

    try {
        // 3. Fetch from Airtable
        // Pagination logic included to ensure we get ALL records
        let allRecords: any[] = [];
        let offset = '';
        const headers = { Authorization: `Bearer ${AIRTABLE_PAT}` };

        do {
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Deals?offset=${offset}`;
            const airtableRes = await fetch(url, { headers });

            if (!airtableRes.ok) {
                throw new Error(`Airtable Error: ${airtableRes.statusText}`);
            }

            const data = await airtableRes.json();
            allRecords = [...allRecords, ...data.records];
            offset = data.offset;
        } while (offset);

        // 4. Return Data
        return response.status(200).json({ records: allRecords });

    } catch (error) {
        console.error('Serverless Sync Error:', error);
        return response.status(500).json({ error: 'Failed to sync with Airtable', raw: String(error) });
    }
}
