import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in environment.")
    exit(1)

supabase: Client = create_client(url, key)

print("Attempting connection...")
try:
    # Just list buckets or something to verify admin access
    res = supabase.storage.list_buckets()
    print("Connection Successful! Buckets:", res)
except Exception as e:
    print("Connection Failed:", e)
