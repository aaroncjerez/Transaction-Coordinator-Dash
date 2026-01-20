-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create a table to store document chunks and their embeddings
create table if not exists deal_knowledge (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null, -- Can be UUID or string depending on your system, using text to be safe and flexible
  content text,
  metadata jsonb, -- To store extra info like chunk index, source file, etc.
  embedding vector(768) -- Google text-embedding-004 uses 768 dimensions
);

-- Create a function to search for documents
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    deal_knowledge.id,
    deal_knowledge.content,
    deal_knowledge.metadata,
    1 - (deal_knowledge.embedding <=> query_embedding) as similarity
  from deal_knowledge
  where 1 - (deal_knowledge.embedding <=> query_embedding) > match_threshold
  order by deal_knowledge.embedding <=> query_embedding
  limit match_count;
end;
$$;
