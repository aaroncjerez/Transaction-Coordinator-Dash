import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Apply schema change via raw SQL
sql = "ALTER TABLE deal_vault ADD COLUMN IF NOT EXISTS deal_name text;"

try:
    result = supabase.rpc('exec_sql', {'query': sql}).execute()
    print("Schema updated successfully!")
except Exception as e:
    print(f"Note: Direct SQL execution not available via RPC. Error: {e}")
    print("Attempting via PostgREST...")
    # Alternative: Use postgrest's SQL execution if available
    # For Supabase, we typically need to use the SQL Editor or a custom RPC function
    print("Please run this SQL manually in Supabase SQL Editor:")
    print(sql)
