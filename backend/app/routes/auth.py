from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

from app import db
from app.deps import CurrentUser
from app.models.board import empty_board
from app.services.passwords import hash_password, verify_password

router = APIRouter(prefix="/api")

Username = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_-]{3,32}$")]
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Username
    password: NewPassword


class PasswordChange(BaseModel):
    current_password: str
    new_password: NewPassword


class AccountDeletion(BaseModel):
    password: str


def _sign_in(request: Request, user: db.User) -> dict:
    request.session.clear()
    request.session["user_id"] = user.id
    return {"id": user.id, "username": user.username}


def _check_password(user: db.User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=403, detail="Wrong password")


@router.post("/register", status_code=201)
def register(body: Registration, request: Request):
    db_path = request.app.state.db_path
    user = db.create_user(db_path, body.username, hash_password(body.password))
    if user is None:
        raise HTTPException(status_code=409, detail="That username is taken")
    db.create_board(db_path, user.id, db.FIRST_BOARD_NAME, empty_board())
    return _sign_in(request, user)


@router.post("/login")
def login(credentials: Credentials, request: Request):
    user = db.get_user(request.app.state.db_path, credentials.username)
    if user is None or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return _sign_in(request, user)


@router.post("/logout", status_code=204)
def logout(request: Request):
    request.session.clear()
    return Response(status_code=204)


@router.get("/me")
def me(user: CurrentUser):
    return {"id": user.id, "username": user.username}


@router.post("/me/password", status_code=204)
def change_password(body: PasswordChange, request: Request, user: CurrentUser):
    _check_password(user, body.current_password)
    db.set_password(request.app.state.db_path, user.id, hash_password(body.new_password))
    return Response(status_code=204)


@router.delete("/me", status_code=204)
def delete_account(body: AccountDeletion, request: Request, user: CurrentUser):
    _check_password(user, body.password)
    db.delete_user(request.app.state.db_path, user.id)
    request.session.clear()
    return Response(status_code=204)
