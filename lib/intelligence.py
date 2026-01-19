import modal
import os

# Define the image with necessary dependencies
image = modal.Image.debian_slim().pip_install(
    "google-cloud-aiplatform",
    "requests",
    "supabase"
)

app = modal.App("tc-engine-intelligence")

# Secrets required for the application
# Users must create these in Modal dashboard or CLI:
# 1. tc-engine-secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FUB_API_KEY, GOOGLE_CLOUD_PROJECT_ID)
# 2. gcp-credentials (GOOGLE_APPLICATION_CREDENTIALS json content mapped to a file or similar mechanism)
# For now, we assume environment variables are set via valid secrets.

@app.function(image=image, secrets=[modal.Secret.from_name("tc-engine-secrets")])
def process_pdf(url: str, deal_id: str):
    import vertexai
    from vertexai.generative_models import GenerativeModel, Part
    import requests
    from supabase import create_client, Client

    print(f"Processing Deal {deal_id}: Downloading PDF from {url}...")
    
    # 1. Download PDF
    try:
        response = requests.get(url)
        response.raise_for_status()
        pdf_data = response.content
    except Exception as e:
        print(f"Failed to download PDF: {e}")
        return {"error": str(e)}

    # 2. Analyze with Gemini 1.5 Pro
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT_ID")
    if not project_id:
        print("Error: GOOGLE_CLOUD_PROJECT_ID not set.")
        return {"error": "Missing GCP Project ID"}

    # Initialize Vertex AI
    # Note: This requires GOOGLE_APPLICATION_CREDENTIALS to be set in the Helper/Secret
    # If using 'modal.Secret.from_name("gcp-credentials")', ensure it mounts the JSON or sets the ENV.
    try:
        vertexai.init(project=project_id, location="us-central1")
        model = GenerativeModel("gemini-1.5-pro-001")
        
        prompt = """
        You are an expert Transaction Coordinator.
        Analyze this real estate document.
        1. Extract the full text content.
        2. Identify key dates (Contract Date, Closing Date, Inspection Period).
        3. Summarize any unusual clauses.
        Return the result as a JSON object with keys: 'text', 'dates', 'summary'.
        """
        
        pdf_part = Part.from_data(data=pdf_data, mime_type="application/pdf")
        
        response = model.generate_content([pdf_part, prompt])
        print("Gemini Analysis Complete.")
        
    # 3. Upsert to Supabase
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and supabase_key:
            sb = create_client(supabase_url, supabase_key)
            
            # Initialize Embedding Model
            from vertexai.language_models import TextEmbeddingModel
            embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
            
            # Simple chunking (Split by paragraph for now)
            # In production, use a text splitter with overlap
            chunks = response.text.split('\n\n')
            
            for i, chunk in enumerate(chunks):
                if not chunk.strip(): continue
                
                # Generate Embedding
                try:
                    embeddings = embedding_model.get_embeddings([chunk])
                    vector = embeddings[0].values
                    
                    sb.table("document_vectors").insert({
                        "deal_id": deal_id,
                        "file_name": url.split('/')[-1],
                        "content": chunk,
                        "chunk_index": i,
                        "embedding": vector
                    }).execute()
                except Exception as emb_err:
                    print(f"Embedding failed for chunk {i}: {emb_err}")
                    continue
                    
            print("Upserted vectors to Supabase.")
        else:
             print("Skipping Supabase upsert: Credentials missing.")
        
        return response.text
    except Exception as e:
        print(f"AI Processing Failed: {e}")
        return {"error": str(e)}

@app.function(image=image, secrets=[modal.Secret.from_name("tc-engine-secrets")])
def sync_fub_events(phone_number: str):
    import requests
    
    fub_key = os.environ.get("FUB_API_KEY")
    if not fub_key:
        print("FUB_API_KEY missing")
        return
    
    # Stub for FUB API call
    # url = "https://api.followupboss.com/v1/events"
    # ... query logic ...
    print(f"Syncing FUB events for {phone_number}")
    return {"status": "synced"}

@app.local_entrypoint()
def test_pdf_extraction():
    # Helper to test the function remotely
    test_pdf_url = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" 
    result = process_pdf.remote(test_pdf_url, "test-deal-123")
    print(result)
