import os
import sys
import glob
import time
from typing import List
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from vertexai.language_models import TextEmbeddingModel
from supabase import create_client, Client

# Configuration
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
EMBEDDING_MODEL_NAME = "text-embedding-004"
GENERATIVE_MODEL_NAME = "gemini-1.5-pro-001"

def chunk_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def index_directory(directory_path: str, deal_id: str):
    # Load Environment Variables (Assuming they are set or loaded from .env manually if needed)
    # For local run, user might need to `source .env` or similar.
    # We'll check for them.
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT_ID")
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not all([project_id, supabase_url, supabase_key]):
        print("Error: Missing environment variables. Please ensure GOOGLE_CLOUD_PROJECT_ID, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are set.")
        return

    print(f"Initializing Vertex AI with project: {project_id}")
    vertexai.init(project=project_id, location="us-central1")
    
    gen_model = GenerativeModel(GENERATIVE_MODEL_NAME)
    emb_model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL_NAME)
    
    sb: Client = create_client(supabase_url, supabase_key)

    # Find PDFs
    pdf_pattern = os.path.join(directory_path, "*.pdf")
    pdf_files = glob.glob(pdf_pattern)
    
    if not pdf_files:
        print(f"No PDF files found in {directory_path}")
        return

    print(f"Found {len(pdf_files)} PDFs to process.")

    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        print(f"Processing {filename}...")
        
        try:
            # 1. Extract Text using Gemini
            with open(pdf_path, "rb") as f:
                pdf_data = f.read()
            
            pdf_part = Part.from_data(data=pdf_data, mime_type="application/pdf")
            prompt = """
            Extract the full text content from this document. 
            Return ONLY the text content, no markdown formatting or intro/outro.
            """
            
            # Rate limit handling (simple sleep)
            time.sleep(1) 
            response = gen_model.generate_content([pdf_part, prompt])
            full_text = response.text
            
            if not full_text:
                print(f"Warning: No text extracted from {filename}")
                continue
                
            print(f"Extracted {len(full_text)} characters.")

            # 2. Chunk Text
            chunks = chunk_text(full_text, CHUNK_SIZE, CHUNK_OVERLAP)
            print(f"Created {len(chunks)} chunks.")

            # 3. Generate Embeddings & Store
            for i, chunk in enumerate(chunks):
                if not chunk.strip(): continue
                
                # Embedding
                # Vertex AI expects a list, returns a list of objects
                # Rate limit handling
                time.sleep(0.2)
                try:
                    embeddings = emb_model.get_embeddings([chunk])
                    vector = embeddings[0].values
                    
                    # Store in Supabase
                    data = {
                        "deal_id": deal_id,
                        "content": chunk,
                        "embedding": vector,
                        "metadata": {
                            "filename": filename,
                            "chunk_index": i,
                            "total_chunks": len(chunks),
                            "source_path": pdf_path
                        }
                    }
                    
                    sb.table("deal_knowledge").insert(data).execute()
                    # print(f"Stored chunk {i}/{len(chunks)}")
                    
                except Exception as e:
                    print(f"Error embedding/storing chunk {i}: {e}")
                    
            print(f"Finished processing {filename}")

        except Exception as e:
            print(f"Failed to process {filename}: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python index_local_files.py <directory_path> <deal_id>")
        sys.exit(1)
    
    dir_path = sys.argv[1]
    deal_id_arg = sys.argv[2]
    
    index_directory(dir_path, deal_id_arg)
