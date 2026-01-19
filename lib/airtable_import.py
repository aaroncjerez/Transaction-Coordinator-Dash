import os
import json
import requests
from supabase import create_client, Client

# Configuration
AIRTABLE_PAT = os.environ.get("AIRTABLE_PAT")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not all([AIRTABLE_PAT, AIRTABLE_BASE_ID, SUPABASE_URL, SUPABASE_KEY]):
    print("Error: Missing environment variables.")
    print(f"AIRTABLE_PAT: {'OK' if AIRTABLE_PAT else 'MISSING'}")
    print(f"AIRTABLE_BASE_ID: {'OK' if AIRTABLE_BASE_ID else 'MISSING'}")
    print(f"SUPABASE_URL: {'OK' if SUPABASE_URL else 'MISSING'}")
    print(f"SUPABASE_SERVICE_ROLE_KEY: {'OK' if SUPABASE_KEY else 'MISSING'}")
    exit(1)

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_airtable_deals():
    """Fetches all records from the Deals table."""
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Deals"
    headers = {
        "Authorization": f"Bearer {AIRTABLE_PAT}"
    }
    params = {} # Add pagination if needed
    
    all_records = []
    
    while True:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        all_records.extend(data.get("records", []))
        
        offset = data.get("offset")
        if not offset:
            break
        params["offset"] = offset
        
    return all_records

def transform_record(record):
    """Maps Airtable record fields to Supabase columns."""
    fields = record.get("fields", {})
    
    # Helper to clean currency strings if necessary, though Airtable API returns numbers for currency fields often.
    # If they are strings like "$100.00", need parsing. Usually they are numbers.
    
    return {
        "airtable_id": record.get("id"),
        "deal_type": fields.get("Deal type"),
        "county": fields.get("County"),
        "state": fields.get("State"),
        "notes": fields.get("Notes"),
        "purchase_price": fields.get("Purchase Price"),
        "expected_sales_price": fields.get("Expected sales price"),
        "contract_execution_date": fields.get("Contract Execution date"),
        "expected_close_date": fields.get("Expected close date"),
        "close_date": fields.get("Close date"),
        "phone_number": fields.get("Phone (from Contacts)", [None])[0] if isinstance(fields.get("Phone (from Contacts)"), list) else fields.get("Phone (from Contacts)"),
        "days_to_close": str(fields.get("Days To Close")) if fields.get("Days To Close") is not None else None,
        "due_diligence_link": fields.get("Due Diligence link"),
        "stage": fields.get("Status"),
        # Status/Stage mapping
        # Airtable 'Status' -> Supabase 'deal_vault/status' (Wait, schema says we need to map this)
        # Checking schema: deal_vault doesn't have 'status', it has 'stage' (from my implementation plan? or SQL?)
        # Let's check SQL file content from memory or view it.
        # SQL said: `deal_type text`, wait... 
        # Line 13: deal_type text, -- Mapped from 'Deal type'
        # I don't see a 'stage' column in the SQL I viewed in Step 367?
        # Step 367: 
        # 13:   deal_type text, -- Mapped from 'Deal type'
        # 53:   status text, -- To do... (This is Tasks vault)
        # Wait, deal_vault columns (lines 6-43):
        # id, airtable_id, created_at, updated_at
        # deal_type, county, state, notes
        # purchase_price, expected_sales_price
        # contract_execution_date, expected_close_date, close_date, days_to_close
        # phone_number, assigned_to
        # purchase_agreement_files...
        # due_diligence_link
        # It seems I MISSED the 'Status' or 'Stage' column in the SQL??
        # Checking Step 367 again.
        # Lines 6-43: No 'status' or 'stage' column explicitly named 'status' or 'stage'.
        # Line 13 is `deal_type`.
        # This is a BUG in the schema if I want to track status.
        # The Deals.tsx uses `deal.stage`.
        # Implementation plan said: "stage (text) - Mapped from 'Status'".
        # So I probably forgot to add it to the SQL or the `view_file` output didn't show it?
        # Let me re-read Step 367 carefully.
        # Line 13: deal_type text
        # Line 14: county text
        # ...
        # I don't see 'stage' or 'status'.
        # I MUST FIX THE SCHEMA FIRST if it's missing.
    }

def run_import():
    print("Fetching records from Airtable...")
    records = fetch_airtable_deals()
    print(f"Found {len(records)} records.")
    
    transformed_data = []
    for rec in records:
        transformed_data.append(transform_record(rec))
        
    print("Upserting to Supabase...")
    # Using upsert on airtable_id
    response = supabase.table("deal_vault").upsert(transformed_data, on_conflict="airtable_id").execute()
    
    print("Import complete.")
    # print(response)

if __name__ == "__main__":
    run_import()
