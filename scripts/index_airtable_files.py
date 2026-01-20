import os
import sys
import time
import requests
from typing import List, Dict, Any
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from vertexai.language_models import TextEmbeddingModel
from supabase import create_client, Client

# Configuration
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
EMBEDDING_MODEL_NAME = "text-embedding-004"
GENERATIVE_MODEL_NAME = "gemini-1.5-pro-001"
AIRTABLE_TABLE_NAME = "Deals"

def load_env():
    """Manually load .env file"""
    try:
        with open('.env') as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    # Handle quotes
                    value = value.strip('"').strip("'")
                    os.environ[key] = value
    except Exception as e:
        print(f"Warning: Could not load .env: {e}")

ATTACHMENT_FIELDS = [
    "Purchase Agreement",
    "Funding agreement",
    "Deed",
    "Plat",
    "Soil test",
    "HUD",
    "Sale Contract"
]

def chunk_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def fetch_airtable_records(pat: str, base_id: str) -> List[Dict[str, Any]]:
    all_records = []
    offset = None
    headers = {"Authorization": f"Bearer {pat}"}
    
    print("Fetching Airtable records...")
    while True:
        url = f"https://api.airtable.com/v0/{base_id}/{AIRTABLE_TABLE_NAME}"
        params = {}
        if offset:
            params["offset"] = offset
            
        try:
            r = requests.get(url, headers=headers, params=params)
            r.raise_for_status()
            data = r.json()
            all_records.extend(data.get("records", []))
            offset = data.get("offset")
            if not offset:
                break
        except Exception as e:
            print(f"Error fetching Airtable: {e}")
            break
    
    print(f"Fetched {len(all_records)} records.")
    return all_records

def index_airtable_deals():
    load_env()
    # Load Env
    pat = os.environ.get("AIRTABLE_PAT") or os.environ.get("VITE_AIRTABLE_PAT")
    base_id = os.environ.get("AIRTABLE_BASE_ID") or os.environ.get("VITE_AIRTABLE_BASE_ID")
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT_ID")
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not all([pat, base_id, project_id, supabase_url, supabase_key]):
        print("Error: Missing environment variables.")
        return

    print(f"Initializing Vertex AI with project: {project_id}")
    vertexai.init(project=project_id, location="us-central1")
    
    gen_model = GenerativeModel(GENERATIVE_MODEL_NAME)
    emb_model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL_NAME)
    sb: Client = create_client(supabase_url, supabase_key)

    records = fetch_airtable_records(pat, base_id)
    
    for record in records:
        deal_id = record.get("id")
        fields = record.get("fields", {})
        deal_name = fields.get("Deal Name", "Unknown Deal")
        
        print(f"Checking Deal: {deal_name} ({deal_id})")
        
        for field_name in ATTACHMENT_FIELDS:
            attachments = fields.get(field_name)
            if not attachments or not isinstance(attachments, list):
                continue
                
            for att in attachments:
                url = att.get("url")
                filename = att.get("filename", "unknown.pdf")
                mime_type = att.get("type", "")
                
                # Filter for PDFs
                if "application/pdf" not in mime_type and not filename.lower().endswith(".pdf"):
                    continue
                    
                print(f"  > Processing {field_name}: {filename}")
                
                try:
                    # Check if already indexed? (Optional optimization, skipping for now to force backfill)
                    
                    # Download
                    pdf_resp = requests.get(url)
                    pdf_resp.raise_for_status()
                    pdf_data = pdf_resp.content
                    
                    # Extract
                    pdf_part = Part.from_data(data=pdf_data, mime_type="application/pdf")
                    prompt = "Extract the full text content from this document. Return ONLY the text."
                    
                    time.sleep(1) # Rate limit
                    response = gen_model.generate_content([pdf_part, prompt])
                    full_text = response.text
                    
                    if not full_text:
                        print("    Warning: No text extracted.")
                        continue
                        
                    chunks = chunk_text(full_text, CHUNK_SIZE, CHUNK_OVERLAP)
                    print(f"    Extracted {len(full_text)} chars, {len(chunks)} chunks.")
                    
                    # Embed & Store
                    for i, chunk in enumerate(chunks):
                        if not chunk.strip(): continue
                        
                        time.sleep(0.2)
                        embeddings = emb_model.get_embeddings([chunk])
                        vector = embeddings[0].values
                        
                        data = {
                            "deal_id": deal_id, # Linking to Airtable Record ID as requested
                            "content": chunk,
                            "embedding": vector,
                            "metadata": {
                                "filename": filename,
                                "airtable_field": field_name,
                                "chunk_index": i,
                                "source_url": url
                            }
                        }
                        
                        sb.table("deal_knowledge").insert(data).execute()
                        
                    print("    Indexed successfully.")
                    
                except Exception as e:
                    print(f"    Error processing {filename}: {e}")

if __name__ == "__main__":
    index_airtable_deals()
