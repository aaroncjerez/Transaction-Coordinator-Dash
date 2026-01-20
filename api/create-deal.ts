// serverless function

export const dynamic = 'force-dynamic';

export default async function handler(request: any, response: any) {
    // CORS Headers
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const AIRTABLE_PAT = process.env.AIRTABLE_PAT || process.env.VITE_AIRTABLE_PAT;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || process.env.VITE_AIRTABLE_BASE_ID;

    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
        return response.status(500).json({ error: 'Missing Airtable Configuration' });
    }

    try {
        const { fields } = request.body;

        // Construct Airtable URL
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Deals`;

        const airtableRes = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AIRTABLE_PAT}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields })
        });

        if (!airtableRes.ok) {
            const errorText = await airtableRes.text();
            throw new Error(`Airtable Creation Failed: ${errorText}`);
        }

        const data = await airtableRes.json();
        return response.status(200).json(data);

    } catch (error) {
        console.error('Create Deal Error:', error);
        return response.status(500).json({ error: 'Failed to create deal', details: String(error) });
    }
}
