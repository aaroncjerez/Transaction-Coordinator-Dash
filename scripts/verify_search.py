import os
import sys
import vertexai
from vertexai.language_models import TextEmbeddingModel
from supabase import create_client, Client

# Configuration
EMBEDDING_MODEL_NAME = "text-embedding-004"

def load_env():
    """Manually load .env file"""
    try:
        with open('.env') as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    value = value.strip('"').strip("'")
                    os.environ[key] = value
    except Exception as e:
        print(f"Warning: Could not load .env: {e}")

def verify_search(query: str):
    load_env()
    # Load Env
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT_ID")
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not all([project_id, supabase_url, supabase_key]):
        print("Error: Missing environment variables.")
        return

    print(f"Initializing Vertex AI with project: {project_id}")
    vertexai.init(project=project_id, location="us-central1")
    
    emb_model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL_NAME)
    sb: Client = create_client(supabase_url, supabase_key)

    print(f"Generating embedding for query: '{query}'")
    embeddings = emb_model.get_embeddings([query])
    query_vector = embeddings[0].values
    
    print("Executing similarity search (RPC match_documents)...")
    try:
        response = sb.rpc("match_documents", {
            "query_embedding": query_vector,
            "match_threshold": 0.5, # Adjust as needed
            "match_count": 5
        }).execute()
        
        results = response.data
        if not results:
            print("No matches found.")
        else:
            print(f"Found {len(results)} matches:")
            for i, match in enumerate(results):
                content_snippet = match.get('content', '')[:100].replace('\n', ' ')
                similarity = match.get('similarity', 0)
                deal_id = match.get('metadata', {}).get('deal_id') or "Unknown Deal"
                filename = match.get('metadata', {}).get('filename') or "Unknown File"
                print(f"{i+1}. [{similarity:.4f}] {filename} (Deal {deal_id}): \"{content_snippet}...\"")
                
    except Exception as e:
        print(f"Search failed: {e}")
        print("Hint: Ensure you have run 'supabase_extension.sql' to create the 'match_documents' function.")

if __name__ == "__main__":
    query_arg = "What are the key dates for Walker - Burke?"
    if len(sys.argv) > 1:
        query_arg = sys.argv[1]
    
    verify_search(query_arg)
