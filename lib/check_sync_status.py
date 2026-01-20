
import os
import sys
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

PAT = os.environ.get("AIRTABLE_PAT")
BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not all([PAT, BASE_ID, SUPABASE_URL, SUPABASE_KEY]):
    print("Error: Missing environment variables.")
    sys.exit(1)

def get_airtable_ids():
    offset = ""
    ids = []
    
    while True:
        url = f"https://api.airtable.com/v0/{BASE_ID}/Deals?fields%5B%5D=Deal+Name&offset={offset}"
        headers = {"Authorization": f"Bearer {PAT}"}
        
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode('utf-8'))
                ids.extend([r['id'] for r in data.get('records', [])])
                offset = data.get('offset')
                if not offset:
                    break
        except Exception as e:
            print(f"Error fetching Airtable records: {e}")
            break
            
    return set(ids)

def get_supabase_ids():
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        # Fetch all airtable_ids
        # Pagination might be needed if > 1000, but let's assume < 1000 for now or use range
        res = supabase.from_('deal_vault').select('airtable_id').execute()
        # The python client returns object with 'data'
        ids = [r['airtable_id'] for r in res.data if r['airtable_id']]
        return set(ids)
    except Exception as e:
        print(f"Error fetching Supabase records: {e}")
        return set()

def main():
    print("Fetching Airtable IDs...")
    airtable_ids = get_airtable_ids()
    print(f"Found {len(airtable_ids)} records in Airtable.")
    
    print("Fetching Supabase IDs...")
    supabase_ids = get_supabase_ids()
    print(f"Found {len(supabase_ids)} synced records in Supabase.")
    
    missing_in_supabase = airtable_ids - supabase_ids
    missing_in_airtable = supabase_ids - airtable_ids # Orphans in Supabase
    
    print("\n--- SYNC REPORT ---")
    if not missing_in_supabase and not missing_in_airtable:
        print("✅ SUCCESS: 100% Synced.")
    else:
        if missing_in_supabase:
            print(f"❌ Missing in Supabase (Need Sync): {len(missing_in_supabase)}")
            print(list(missing_in_supabase)[:10]) # Show first 10
        if missing_in_airtable:
            print(f"⚠️ Orphans in Supabase (Deleted in Airtable?): {len(missing_in_airtable)}")
            print(list(missing_in_airtable)[:10])

if __name__ == "__main__":
    main()
