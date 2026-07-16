import os
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
import users_store 
import config

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Base data directory path
DATA_DIR = Path(__file__).parent / "DATA"

# Helper to run ingestion dynamically
def run_dynamic_ingestion():
    """Runs the document ingestion pipeline to update the FAISS index."""
    try:
        from ingest import load_documents
        from langchain_huggingface import HuggingFaceEmbeddings  # Import directly
        from langchain_community.vectorstores import FAISS
        import sys

        print("[Admin Ingest] Triggering dynamic vector store indexing...")
        
        # We pass the list of tenant directories inside DATA_DIR
        data_dirs = [DATA_DIR]
        docs = load_documents(data_dirs)
        
        # Initialize embeddings locally using the config model
        embeddings = HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL)
        
        # Re-build and save the FAISS vector index
        vector_store = FAISS.from_documents(docs, embeddings)
        vector_store.save_local(str(config.VECTORSTORE_DIR))
        
        # Clear cached conversational chains so they reload the new index on next request
        from rag_chain import _conversational_chains, _vectorstore
        _conversational_chains.clear()
        
        # Force reload the global vectorstore on next query
        import rag_chain
        rag_chain._vectorstore = None

        print("[Admin Ingest] FAISS Vector Store successfully updated and saved on disk!")
    except Exception as e:
        print(f"[Admin Ingest Error] Failed to run database ingestion: {e}")

# =========================================================================
# 1. USER MANAGEMENT ENDPOINTS
# =========================================================================

@router.get("/users")
def list_users():
    """Fetches all registered users from the SQLite database."""
    try:
        real_users = users_store.get_all_users() 
        return [
            {
                "id": user["id"],
                "email": user["email"],
                "role": user["role"],
                "org_id": user["org_id"]
            }
            for user in real_users
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}")
def delete_user(user_id: str):
    """Deletes a user from the SQLite database."""
    try:
        users_store.delete_user_by_id(user_id)
        return {"detail": f"User {user_id} successfully removed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# 2. MULTI-TENANT & DOCUMENT OPERATIONS
# =========================================================================

@router.get("/organizations")
def list_organizations():
    """Scans the DATA directory to list all active organizations (tenants)."""
    try:
        if not DATA_DIR.exists():
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            
        orgs = []
        for item in DATA_DIR.iterdir():
            if item.is_dir():
                # Count files inside the directory (including subdirectories)
                doc_count = sum(1 for p in item.rglob('*') if p.is_file())
                orgs.append({
                    "org_id": item.name,
                    "document_count": doc_count
                })
        return sorted(orgs, key=lambda x: x["org_id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan organizations: {str(e)}")


@router.post("/organizations")
def create_organization(org_id: str = Form(...)):
    """Creates a new organization folder inside the DATA directory."""
    org_id_clean = org_id.lower().strip()
    if not org_id_clean:
        raise HTTPException(status_code=400, detail="Organization ID cannot be empty.")
    
    target_path = DATA_DIR / org_id_clean
    if target_path.exists():
        raise HTTPException(status_code=400, detail=f"Organization '{org_id_clean}' already exists.")
    
    try:
        target_path.mkdir(parents=True, exist_ok=True)
        # Create standard policy subfolders for host tmc
        if org_id_clean == "tmc":
            (target_path / "public").mkdir(exist_ok=True)
            (target_path / "policy").mkdir(exist_ok=True)
            
        return {"detail": f"Organization '{org_id_clean}' successfully created."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create workspace: {str(e)}")


@router.delete("/organizations/{org_id}")
def delete_organization(org_id: str):
    """Deletes an entire organization folder and all its documents from disk."""
    target_path = DATA_DIR / org_id.lower().strip()
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Organization directory not found.")
    
    try:
        shutil.rmtree(target_path)
        return {"detail": f"Organization '{org_id}' and all its files deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete organization workspace: {str(e)}")


@router.get("/organizations/{org_id}/documents")
def list_documents(org_id: str):
    """Lists all files uploaded inside a specific organization's directory."""
    target_path = DATA_DIR / org_id.lower().strip()
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Organization directory not found.")
        
    try:
        documents = []
        for file_path in sorted(target_path.rglob("*")):
            if file_path.is_file():
                # Store relative path (e.g. "public/manual.pdf" or "guide.txt")
                rel_path = file_path.relative_to(target_path)
                documents.append({
                    "filename": file_path.name,
                    "relative_path": str(rel_path).replace("\\", "/"),
                    "size_kb": round(file_path.stat().st_size / 1024, 2)
                })
        return documents
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")


@router.post("/organizations/{org_id}/upload")
def upload_document(org_id: str, file: UploadFile = File(...), folder: str = Form("root")):
    """Uploads a document file directly into a specific organization's folder."""
    org_clean = org_id.lower().strip()
    target_dir = DATA_DIR / org_clean
    
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail="Organization directory not found.")
        
    # Handle subdirectory classification for tmc
    if org_clean == "tmc" and folder in ["public", "policy"]:
        target_dir = target_dir / folder

    file_path = target_dir / file.filename
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"detail": f"File '{file.filename}' uploaded successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {str(e)}")


@router.delete("/organizations/{org_id}/documents/{filename:path}")
def delete_document(org_id: str, filename: str):
    """Deletes a single document file from an organization's directory."""
    target_path = DATA_DIR / org_id.lower().strip() / filename
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Document file not found.")
        
    try:
        target_path.unlink()
        return {"detail": f"Document '{filename}' successfully deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete document file: {str(e)}")


# =========================================================================
# 3. TRIGGER MANUAL INGESTION (DYNAMIC RAG SYNC)
# =========================================================================

@router.post("/ingest")
def trigger_ingestion():
    """
    Rebuilds the vector database index synchronously.
    This allows the frontend admin panel to know exactly when the ingestion 
    completes, so it can display a custom success popup.
    """
    try:
        # Run the ingestion process synchronously 
        run_dynamic_ingestion()
        return {"detail": "Ingestion process completed successfully and FAISS index rebuilt."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute ingestion: {str(e)}")