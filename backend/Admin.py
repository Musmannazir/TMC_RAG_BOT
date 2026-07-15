from fastapi import APIRouter, HTTPException
import users_store 

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/users")
def list_users():
    """Fetches all real registered users from the SQLite database."""
    try:
        real_users = users_store.get_all_users() 
        
        # Format the SQLite rows for your React frontend
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
    """Deletes a real user from the SQLite database."""
    try:
        users_store.delete_user_by_id(user_id)
        return {"detail": f"User {user_id} successfully removed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))