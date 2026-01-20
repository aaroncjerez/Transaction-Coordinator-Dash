-- Enable RLS on all tables
alter table deal_vault enable row level security;
alter table tasks_vault enable row level security;
alter table fub_cache enable row level security;
alter table document_vectors enable row level security;

-- STORAGE POLICIES (transaction-docs)
-- 1. Allow authenticated users to upload their own files
create policy "Users can upload their own files"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'transaction-docs' and auth.uid() = owner );

-- 2. Allow users to view/download their own files
create policy "Users can view their own files"
on storage.objects for select
to authenticated
using ( bucket_id = 'transaction-docs' and auth.uid() = owner );

-- 3. Allow users to update their own files
create policy "Users can update their own files"
on storage.objects for update
to authenticated
using ( bucket_id = 'transaction-docs' and auth.uid() = owner );

-- 4. Allow users to delete their own files
create policy "Users can delete their own files"
on storage.objects for delete
to authenticated
using ( bucket_id = 'transaction-docs' and auth.uid() = owner );


-- DATA TABLES POLICIES
-- For now, until granular permissions are defined, allow all authenticated users to access deal data.
-- This prevents 'anon' access but allows team collaboration.

-- deal_vault
create policy "Authenticated users can view deals"
on deal_vault for select
to authenticated
using ( true );

create policy "Authenticated users can insert/update deals"
on deal_vault for all
to authenticated
using ( true )
with check ( true );

-- tasks_vault
create policy "Authenticated users can view tasks"
on tasks_vault for select
to authenticated
using ( true );

create policy "Authenticated users can manage tasks"
on tasks_vault for all
to authenticated
using ( true );

-- fub_cache
create policy "Authenticated users can access FUB cache"
on fub_cache for all
to authenticated
using ( true );

-- document_vectors
-- Inherit access: If you can see the deal, you can see the vector.
-- Since we allow all auth users to see deals, we allow all auth users to see vectors.
create policy "Authenticated users can access vectors"
on document_vectors for all
to authenticated
using ( true );
