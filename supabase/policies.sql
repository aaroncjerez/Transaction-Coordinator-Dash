-- Enable RLS for the main table (if not already enabled)
alter table deal_vault enable row level security;

-- Policy 1: Allow Anonymous Read Access
-- Necessary for the dashboard to display data to users without a login (if applicable)
-- or using the Anon Key.
create policy "Allow Public Read Access"
on deal_vault
for select
to anon, authenticated
using (true);

-- Policy 2: Allow Anonymous Insert/Upsert Access
-- Necessary for the 'Shadow Write' logic (syncing Airtable to Supabase from the client).
create policy "Allow Public Insert Access"
on deal_vault
for insert
to anon, authenticated
with check (true);

-- Policy 3: Allow Anonymous Update Access
-- Necessary for updating stages or editing records.
create policy "Allow Public Update Access"
on deal_vault
for update
to anon, authenticated
using (true);

-- Repeat for other tables if necessary (e.g. tasks_vault)
alter table tasks_vault enable row level security;

create policy "Allow Public Read Access Tasks"
on tasks_vault for select to anon, authenticated using (true);

create policy "Allow Public Insert Access Tasks"
on tasks_vault for insert to anon, authenticated with check (true);

create policy "Allow Public Update Access Tasks"
on tasks_vault for update to anon, authenticated using (true);

-- Document Vectors (If used from Client side)
alter table document_vectors enable row level security;
create policy "Allow Public Read Vectors" on document_vectors for select to anon, authenticated using (true);
create policy "Allow Public Insert Vectors" on document_vectors for insert to anon, authenticated with check (true);

