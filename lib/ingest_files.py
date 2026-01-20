import os
import io
import json
import requests
import time
from supabase import create_client, Client
from dotenv import load_dotenv

# Try importing pypdf, handle failure
try:
    from pypdf import PdfReader
except ImportError:
    print("pypdf not found. Install with `pip install pypdf`.")
    PdfReader = None

load_dotenv()

# Config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY]):
    print("Error: Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

FILE_COLUMNS = [
    'purchase_agreement_files',
    'deed_files',
    'sale_contract_files',
    'hud_files'
]

def get_gemini_embedding(text):
    """Generates 768-dimensional embedding using Gemini API (text-embedding-004)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={GEMINI_API_KEY}"
    
    payload = {
        "content": {
            "parts": [{"text": text}]
        }
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["embedding"]["values"]
    except Exception as e:
        print(f"Gemini API Error: {e}")
        if response.status_code != 200:
            print(f"Response: {response.text}")
        return None

def extract_text_from_pdf(content: bytes) -> str:
    if not PdfReader:
        return "Error: PDF processing library missing."
    try:
        f = io.BytesIO(content)
        reader = PdfReader(f)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        print(f"PDF Extraction Error: {e}")
        return ""

def process_file(deal_id: str, file_obj: dict):
    url = file_obj.get("url")
    filename = file_obj.get("filename")
    
    if not url: return

    # Check existence
    existing = supabase.table("document_vectors").select("id").eq("deal_id", deal_id).eq("file_name", filename).execute()
    if existing.data and len(existing.data) > 0:
        print(f"Re-indexing {filename} (Deleting old vectors)...")
        supabase.table("document_vectors").delete().eq("deal_id", deal_id).eq("file_name", filename).execute()

    print(f"Processing {filename}...")
    
    try:
        # Download
        resp = requests.get(url)
        resp.raise_for_status()
        
        # Extract Text
        content_type = resp.headers.get('Content-Type', '').lower()
        if 'pdf' in content_type or filename.lower().endswith('.pdf'):
            text = extract_text_from_pdf(resp.content)
        else:
            # Assume text/plain or skip
            text = "Skipped non-PDF file"
            
        if not text.strip() or "Error" in text:
            print(f"No text extracted from {filename}")
            return

        # Chunk & Embed
        # Simple paragraph splitting
        chunks = [c for c in text.split('\n\n') if c.strip()]
        
        # Limit to reasonable number of chunks per file for demo
        for i, chunk in enumerate(chunks[:20]): 
            if len(chunk) < 50: continue # Skip tiny chunks
            
            # Generate Embedding
            vector = get_gemini_embedding(chunk)
            
            if not vector:
                print(f"Skipping chunk {i} due to embedding failure.")
                continue

            try:
                supabase.table("document_vectors").insert({
                    "deal_id": deal_id,
                    "file_name": filename,
                    "content": chunk, 
                    "chunk_index": i,
                    "embedding": vector
                }).execute()
            except Exception as db_err:
                 print(f"Supabase Insert Error: {db_err}")
            
            # Rate limiting
            time.sleep(0.5)
            
        print(f"Indexed {filename} ({len(chunks)} chunks)")

    except Exception as e:
        print(f"Failed to process {filename}: {e}")

def run_ingestion():
    print("Fetching deals...")
    try:
        deals = supabase.table("deal_vault").select("*").execute().data
    except Exception as e:
        print(f"Error fetching deals: {e}")
        return
    
    print(f"Found {len(deals)} deals.")
    
    for deal in deals:
        print(f"Checking Deal: {deal.get('deal_name') or deal.get('id')}")
        for col in FILE_COLUMNS:
            files_json = deal.get(col)
            if not files_json: continue
            
            # Supabase/Airtable sync might store it as string or object
            if isinstance(files_json, str):
                try:
                    files = json.loads(files_json)
                except:
                    continue
            else:
                files = files_json
                
            if isinstance(files, list):
                for f in files:
                    process_file(deal['id'], f)

if __name__ == "__main__":
    run_ingestion()
