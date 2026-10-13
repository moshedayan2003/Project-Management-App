from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

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


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


@router.get("/me")
def me(request: Request):
    return {"username": current_user(request)}
