import os
import sys
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv

load_dotenv()

def get_schema(pat, base_id):
    url = f"https://api.airtable.com/v0/meta/bases/{base_id}/tables"
    headers = {
        "Authorization": f"Bearer {pat}"
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data
    except urllib.error.HTTPError as e:
        print(f"Error fetching schema: {e.code} - {e.reason}")
        print(e.read().decode('utf-8'))
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        sys.exit(1)

def analyze_schema(schema):
    """
    Analyzes the schema to find Deals and Tasks tables and their columns.
    """
    tables = {table['name']: table for table in schema.get('tables', [])}
    
    required_tables = ['Deals', 'Tasks']
    found_tables = {}
    
    for req in required_tables:
        if req in tables:
            found_tables[req] = tables[req]
        else:
            print(f"WARNING: Table '{req}' not found in base.")
    
    # Print summary
    print(json.dumps({
        "status": "success",
        "found_tables": list(found_tables.keys()),
        "details": found_tables
    }, indent=2))

if __name__ == "__main__":
    pat = os.environ.get("AIRTABLE_PAT")
    base_id = os.environ.get("AIRTABLE_BASE_ID")

    if not pat or not base_id:
        print("Error: AIRTABLE_PAT and AIRTABLE_BASE_ID environment variables are required.")
        sys.exit(1)

    print(f"Fetching schema for Base ID: {base_id}...")
    schema = get_schema(pat, base_id)
    analyze_schema(schema)
