-- Enable pgvector extension for embeddings
create extension if not exists vector;

-- DEALS VAULT (Mirrors Airtable Deals)
-- Based on analysis: Primary field is 'Deal type', plus County, State, etc.
create table if not exists deal_vault (
  id uuid primary key default gen_random_uuid(),
  airtable_id text unique not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  -- Core Deal Fields
  deal_name text,
  last_name text, -- Extracted from deal_name for card display
  deal_type text, -- Mapped from 'Deal type'
  stage text, -- Mapped from 'Status'
  county text,
  state text,
  notes text,
  
  -- Financials
  purchase_price numeric,
  expected_sales_price numeric,
  
  -- Dates
  contract_execution_date date,
  expected_close_date date,
  close_date date,
  days_to_close text, -- Formula field in Airtable, storing as text or computed
  
  -- Contacts
  phone_number text, -- Mapped from 'Phone (from Contacts)'
  assigned_to jsonb, -- Storing collaborator info
  
  -- Attachments (Storing URLs as JSON arrays)
  purchase_agreement_files jsonb,
  funding_agreement_files jsonb,
  deed_files jsonb,
  plat_files jsonb,
  soil_test_files jsonb,
  hud_files jsonb,
  sale_contract_files jsonb,
  
  -- Links
  due_diligence_link text
);

-- TASKS VAULT (Mirrors Airtable Tasks)
create table if not exists tasks_vault (
  id uuid primary key default gen_random_uuid(),
  airtable_id text unique not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  
  task_name text,
  status text, -- To do, In progress, Done, Canceled
  notes text,
  assignee jsonb,
  task_order numeric,
  
  -- Link back to Deal
  deal_airtable_id text references deal_vault(airtable_id)
);

-- FUB CACHE (Recent Communications)
create table if not exists fub_cache (
  phone_number text primary key,
  history_json jsonb, -- Stores list of last 10 events/texts
  last_updated timestamp with time zone default now()
);

-- DOCUMENT VECTORS (RAG Store)
create table if not exists document_vectors (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deal_vault(id),
  file_name text,
  file_type text,
  content text,
  chunk_index integer,
  embedding vector(768) -- Gemini 1.5 embedding dimension
);

-- Indicies for performance
create index on document_vectors using ivfflat (embedding vector_cosine_ops);
create index on deal_vault(phone_number);

-- Similarity Search Function
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_deal_id uuid
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    document_vectors.id,
    document_vectors.content,
    1 - (document_vectors.embedding <=> query_embedding) as similarity
  from document_vectors
  where 1 - (document_vectors.embedding <=> query_embedding) > match_threshold
  and document_vectors.deal_id = filter_deal_id
  order by document_vectors.embedding <=> query_embedding
  limit match_count;
end;
$$;
