from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.deps import current_user

# MVP: a single hardcoded user.
USERNAME = "user"
PASSWORD = "password"

router = APIRouter(prefix="/api")


class Credentials(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(credentials: Credentials, request: Request):
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["username"] = credentials.username
    return {"username": credentials.username}


@router.post("/logout", status_code=204)
def logout(request: Request):
    request.session.clear()
    return Response(status_code=204)


@router.get("/me")
def me(username: Annotated[str, Depends(current_user)]):
    return {"username": username}
