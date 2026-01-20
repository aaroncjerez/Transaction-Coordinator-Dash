import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Configuration
AIRTABLE_PAT = os.environ.get("AIRTABLE_PAT")
AIRTABLE_BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not all([AIRTABLE_PAT, AIRTABLE_BASE_ID, SUPABASE_URL, SUPABASE_KEY]):
    print("Error: Missing environment variables. Make sure .env is populated.")
    print(f"AIRTABLE_PAT: {AIRTABLE_PAT}") # Debug
    exit(1)

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all(table_name):
    """Fetches all records from an Airtable table."""
    url = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{table_name}"
    headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}
    params = {}
    all_records = []
    
    print(f"Fetching {table_name}...")
    while True:
        try:
            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            all_records.extend(data.get("records", []))
            offset = data.get("offset")
            if not offset: break
            params["offset"] = offset
        except Exception as e:
            print(f"Error fetching {table_name}: {e}")
            if response.status_code == 404:
                print(f"Table {table_name} not found or permission error.")
            break
            
    return all_records

def map_deal(record):
    f = record.get("fields", {})
    
    # Extract last name from "Deal Name" field (format: "Last Name - County, State")
    deal_name = f.get("Deal Name", "")
    last_name = deal_name.split(" - ")[0].strip() if " - " in deal_name else ""
    
    return {
        "airtable_id": record.get("id"),
        "deal_name": deal_name,
        "last_name": last_name,  # Extracted for easier display
        "deal_type": f.get("Deal type"),
        "stage": f.get("Stage"),
        "county": f.get("County"),
        "state": f.get("State"),
        "notes": f.get("Notes"),
        "purchase_price": f.get("Purchase Price"),
        "expected_sales_price": f.get("Expected sales price"),
        "contract_execution_date": f.get("Contract Execution date"),
        "expected_close_date": f.get("Expected close date"),
        "close_date": f.get("Close date"),
        "phone_number": f.get("Phone (from Contacts)", [None])[0] if isinstance(f.get("Phone (from Contacts)"), list) else f.get("Phone (from Contacts)"),
        # Attachments
        "purchase_agreement_files": f.get("Purchase Agreement"),
        "deed_files": f.get("Deed"),
        "hud_files": f.get("HUD"),
        "sale_contract_files": f.get("Sale Contract"),
    }

def map_task(record):
    f = record.get("fields", {})
    # Map Linked Deal (Field name is 'Deals')
    linked_deals = f.get("Deals", [])
    deal_airtable_id = linked_deals[0] if linked_deals else None
    
    return {
        "airtable_id": record.get("id"),
        "task_name": f.get("Task name") or f.get("Name") or "Untitled Task",
        "status": f.get("Status") or "To Do",
        "notes": f.get("Notes"),
        "deal_airtable_id": deal_airtable_id
    }

def run_sync():
    # 1. Clear Tables (Delete Sample Data)
    print("Clearing existing data...")
    try:
        # Delete in correct order: document_vectors -> tasks_vault -> deal_vault
        supabase.table("document_vectors").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("tasks_vault").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("deal_vault").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except Exception as e:
        print(f"Warning during clearing data (might be empty): {e}")
    
    # 2. Sync Deals
    deals = fetch_all("Deals")
    print(f"Syncing {len(deals)} Deals...")
    if deals:
        mapped_deals = [map_deal(d) for d in deals]
        # Batch insert to avoid payload limits
        batch_size = 50
        for i in range(0, len(mapped_deals), batch_size):
            batch = mapped_deals[i:i+batch_size]
            try:
                supabase.table("deal_vault").insert(batch).execute()
            except Exception as e:
                print(f"Error inserting deals batch {i}: {e}")

    # 3. Sync Tasks
    tasks = fetch_all("Tasks")
    print(f"Syncing {len(tasks)} Tasks...")
    if tasks:
        mapped_tasks = [map_task(t) for t in tasks]
         # Batch insert
        for i in range(0, len(mapped_tasks), batch_size):
            try:
                batch = mapped_tasks[i:i+batch_size]
                supabase.table("tasks_vault").insert(batch).execute()
            except Exception as e:
                print(f"Error inserting tasks batch {i}: {e}")

    print("Sync Complete.")

if __name__ == "__main__":
    run_sync()
