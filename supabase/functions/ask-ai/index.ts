import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

        // 1. Generate Embedding (Stubbed - In production, call OpenAI or Vertex AI)
        // For this demo, we can't easily generate an embedding without an API key in env.
        // We will simulate it or use a keyword search if possible.
        // Let's assume we have a "mock" vector for now or just return meaningful text.

        // However, to make it "Real RAG", we need to search.
        // If we can't embed, we'll try a text search on the 'content' column as a fallback.
        const { data: textMatches, error: searchError } = await supabaseClient
            .from('document_vectors')
            .select('content')
            .eq('deal_id', deal_id)
            .textSearch('content', query, { type: 'websearch', config: 'english' })
            .limit(3);

        let context = ""
        if (textMatches && textMatches.length > 0) {
            context = textMatches.map(m => m.content).join("\n---\n")
        } else {
            // Fallback: If text search fails (e.g. no index), just grab 1 chunk
            const { data: randomChunk } = await supabaseClient
                .from('document_vectors')
                .select('content')
                .eq('deal_id', deal_id)
                .limit(1)
            if (randomChunk && randomChunk.length > 0) context = randomChunk[0].content
        }

        if (!context) {
            return new Response(JSON.stringify({
                answer: "I couldn't find any documents for this deal yet. Please upload files to the vault."
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 2. Generate Answer using LLM (Stubbed)
        // Here we would send `context` + `query` to Gemini/OpenAI.
        // Since we don't have the API key set up in this Deno environment explicitly:
        const answer = `[RAG Analysis]\nBased on the documents, here is what I found regarding "${query}":\n\n${context.substring(0, 200)}...\n\n(Note: This is utilizing the 'ask-ai' Edge Function. Connect a live LLM API key to generate full synthesis.)`

        return new Response(JSON.stringify({ answer }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
