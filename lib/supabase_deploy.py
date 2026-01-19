import urllib.request
import json
import sys

token = sys.argv[1]
ref = "keouzvhgtqzvbknzppdi"

def get_keys():
    # Attempt to use the api-keys endpoint if it exists in v1
    # Note: This is an educated guess based on some management API shapes. 
    # If this fails, we might just have to ask the user.
    # Another common pattern is GET /v1/projects/{ref} returning config, but we already saw it didn't return keys.
    
    # Try the 'api-keys' endpoint? Or checking if we can find it via accessing settings?
    # Actually, let's try to just run the query directly to applying schema first.
    pass

def apply_schema(sql_file_path):
    url = f"https://api.supabase.com/v1/projects/{ref}/query"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    with open(sql_file_path, 'r') as f:
        sql = f.read()
    
    payload = json.dumps({"query": sql}).encode('utf-8')
    
    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
        with urllib.request.urlopen(req) as response:
            print("Schema applied successfully!")
            print(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error applying schema: {e.code}")
        print(e.read().decode())
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    apply_schema("supabase_schema.sql")
