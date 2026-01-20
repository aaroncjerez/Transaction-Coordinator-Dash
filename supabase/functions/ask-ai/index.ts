import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { query, deal_id } = await req.json()

        // Initialize Supabase Client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

        if (!geminiApiKey) {
            console.error("Missing GEMINI_API_KEY secret.")
            return new Response(JSON.stringify({
                answer: "I'm having trouble accessing my cognitive functions (API Key missing). Please check the backend configuration."
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 1. Generate Embedding for the Query
        let queryEmbedding = null
        try {
            const embeddingResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: { parts: [{ text: query }] }
                })
            })

            if (!embeddingResp.ok) {
                const errText = await embeddingResp.text()
                console.error("Gemini Embedding Error:", errText)
                // Proceed to fallback text search if embedding fails
            } else {
                const embeddingData = await embeddingResp.json()
                queryEmbedding = embeddingData.embedding?.values
            }
        } catch (e) {
            console.error("Embedding Fetch Error:", e)
        }

        // 2. Retrieve Relevant Documents
        let context = ""

        if (queryEmbedding && deal_id) {
            console.log(`Searching vectors for deal ${deal_id}...`)
            const { data: documents, error: matchError } = await supabaseClient.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: 0.3, // Lowered slightly to ensure recall
                match_count: 5,
                filter_deal_id: deal_id
            })

            if (matchError) {
                console.error("Vector Match Error:", matchError)
            } else if (documents && documents.length > 0) {
                console.log(`Found ${documents.length} vector matches.`)
                context = documents.map((d: any) => d.content).join("\n---\n")
            }
        }

        // 3. Fallback: Text Search if vector search yielded nothing
        if (!context && deal_id) {
            console.log("Vector search failed or empty, trying text search fallback...")
            const { data: textMatches } = await supabaseClient
                .from('document_vectors')
                .select('content')
                .eq('deal_id', deal_id)
                .textSearch('content', query, { type: 'websearch', config: 'english' })
                .limit(3)

            if (textMatches && textMatches.length > 0) {
                context = textMatches.map((d: any) => d.content).join("\n---\n")
            }
        }

        if (!context) {
            return new Response(JSON.stringify({
                answer: "I couldn't find any relevant documents for this deal. Please ensure files are uploaded and ingested."
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 4. Generate Answer using Gemini 1.5 Pro
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are an expert real estate transaction coordinator assistant. 
                        
Context from documents:
${context}

Question: ${query}

Instructions:
- Answer the question based STRICTLY on the provided context.
- If the answer is not in the context, say "I don't see that information in the provided documents."
- Cite specific details (dates, amounts, clauses) from the text.
- Be professional and concise.`
                    }]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1000,
                }
            })
        })

        if (!geminiResponse.ok) {
            const error = await geminiResponse.text()
            console.error('Gemini Generation Error:', error)
            throw new Error('Failed to generate response from Gemini')
        }

        const geminiData = await geminiResponse.json()
        const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate response'

        return new Response(JSON.stringify({ answer }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error("Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
