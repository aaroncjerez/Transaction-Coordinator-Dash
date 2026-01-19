import urllib.request
import json
import sys

token = sys.argv[1]

def list_projects():
    url = "https://api.supabase.com/v1/projects"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Error fetching projects: {e}")
        sys.exit(1)

if __name__ == "__main__":
    list_projects()
