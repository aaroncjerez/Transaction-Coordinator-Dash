import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { dealId, field, value } = await req.json()

        if (!dealId || !field) {
            return new Response(
                JSON.stringify({ error: 'Missing dealId or field' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Get Airtable ID from deal_vault
        const { data: dealData, error: dealError } = await supabase
            .from('deal_vault')
            .select('airtable_id')
            .eq('id', dealId)
            .single()

        if (dealError || !dealData?.airtable_id) {
            return new Response(
                JSON.stringify({ error: 'Deal not found or missing Airtable ID' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Map Supabase field to Airtable column
        const fieldMapping: Record<string, string> = {
            'purchase_price': 'Purchase Price',
            'expected_sales_price': 'Expected sales price',
            'contract_date': 'Contract Execution date',
            'contract_execution_date': 'Contract Execution date',
            'close_date': 'Close date',
            'phone_number': 'Phone (from Contacts)',
            'notes': 'Notes',
            'stage': 'Stage',
        }

        const airtableField = fieldMapping[field]
        if (!airtableField) {
            return new Response(
                JSON.stringify({ error: `Field ${field} not mapped to Airtable` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Update Airtable
        const airtablePat = Deno.env.get('AIRTABLE_PAT')!
        const airtableBaseId = Deno.env.get('AIRTABLE_BASE_ID')!
        const airtableUrl = `https://api.airtable.com/v0/${airtableBaseId}/Deal%20CRM/${dealData.airtable_id}`

        const airtableResponse = await fetch(airtableUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${airtablePat}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fields: {
                    [airtableField]: value,
                },
            }),
        })

        if (!airtableResponse.ok) {
            const errorText = await airtableResponse.text()
            console.error('Airtable API error:', errorText)
            return new Response(
                JSON.stringify({ error: 'Failed to update Airtable', details: errorText }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const airtableData = await airtableResponse.json()

        return new Response(
            JSON.stringify({ success: true, airtableData }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
