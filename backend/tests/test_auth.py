import pytest

from conftest import login


def register(client, username="ann", password="secret-pass"):
    return client.post("/api/register", json={"username": username, "password": password})


def test_me_requires_login(client):
    assert client.get("/api/me").status_code == 401


def test_login_logout_flow(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json()["username"] == "user"
    assert "httponly" in response.headers["set-cookie"].lower()

    assert client.get("/api/me").json() == response.json()

    assert client.post("/api/logout").status_code == 204
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    "username,password",
    [("user", "wrong"), ("other", "password"), ("", ""), ("USER", "password")],
)
def test_bad_credentials_rejected(client, username, password):
    assert login(client, username, password).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_missing_fields_rejected(client):
    assert client.post("/api/login", json={"username": "user"}).status_code == 422
    assert client.post("/api/login").status_code == 422


def test_failed_login_keeps_existing_session(client):
    login(client)
    assert login(client, "user", "wrong").status_code == 401
    assert client.get("/api/me").status_code == 200


def test_tampered_cookie_rejected(client):
    login(client)
    cookie = client.cookies.get("session")
    client.cookies.set("session", cookie[:-3] + "abc")
    assert client.get("/api/me").status_code == 401


def test_sessions_are_per_client(client, make_client):
    login(client)
    other = make_client()
    assert other.get("/api/me").status_code == 401


def test_logout_without_session_is_ok(client):
    assert client.post("/api/logout").status_code == 204


# --- registration


def test_register_signs_in_with_one_empty_board(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["username"] == "ann"
    assert client.get("/api/me").json()["username"] == "ann"
    [board] = client.get("/api/boards").json()
    assert board["name"] == "My board" and board["card_count"] == 0


def test_registered_user_can_log_in_again(client, make_client):
    register(client)
    other = make_client()
    assert login(other, "ann", "wrong").status_code == 401
    assert login(other, "ann", "secret-pass").status_code == 200


def test_register_taken_username_is_409(client):
    assert register(client, "user").status_code == 409
    register(client, "ann")
    assert register(client, "ann").status_code == 409


@pytest.mark.parametrize(
    "username,password",
    [("ab", "long enough"), ("Ann", "long enough"), ("a b c", "long enough"), ("x" * 33, "long enough"),
     ("ann", "short"), ("ann", "x" * 129)],
)
def test_register_validation(client, username, password):
    assert register(client, username, password).status_code == 422
    assert client.get("/api/me").status_code == 401


def test_register_replaces_an_existing_session(client):
    login(client)
    register(client)
    assert client.get("/api/me").json()["username"] == "ann"


# --- users only ever see their own boards


def test_users_cannot_see_or_change_each_others_boards(client, make_client):
    login(client)
    demo_board = client.get("/api/boards").json()[0]["id"]
    ann = make_client()
    register(ann)

    assert [b["id"] for b in ann.get("/api/boards").json()] != [demo_board]
    url = f"/api/boards/{demo_board}"
    assert ann.get(url).status_code == 404
    assert ann.patch(url, json={"name": "Mine"}).status_code == 404
    assert ann.delete(url).status_code == 404
    assert ann.post(f"{url}/cards", json={"column_id": "col-backlog", "title": "X"}).status_code == 404
    assert ann.delete(f"{url}/cards/card-1").status_code == 404
    assert ann.post(f"{url}/chat", json={"message": "hi"}).status_code == 404

    assert len(client.get(url).json()["cards"]) == 8
    assert client.get("/api/boards").json()[0]["name"] == "My board"


# --- password change


def change_password(client, current, new):
    return client.post("/api/me/password", json={"current_password": current, "new_password": new})


def test_change_password(auth_client, make_client):
    assert change_password(auth_client, "password", "a better one").status_code == 204
    assert auth_client.get("/api/me").status_code == 200  # still signed in
    other = make_client()
    assert login(other).status_code == 401
    assert login(other, "user", "a better one").status_code == 200


def test_change_password_needs_the_current_one(auth_client):
    assert change_password(auth_client, "wrong", "a better one").status_code == 403
    assert change_password(auth_client, "password", "short").status_code == 422
    auth_client.post("/api/logout")
    assert change_password(auth_client, "password", "a better one").status_code == 401


# --- account deletion


def test_delete_account(client, make_client):
    register(client)
    assert client.request("DELETE", "/api/me", json={"password": "wrong"}).status_code == 403
    assert client.get("/api/me").status_code == 200

    assert client.request("DELETE", "/api/me", json={"password": "secret-pass"}).status_code == 204
    assert client.get("/api/me").status_code == 401
    assert login(make_client(), "ann", "secret-pass").status_code == 401
    assert register(make_client(), "ann").status_code == 201  # the name is free again


def test_session_of_a_deleted_account_is_rejected(client, make_client):
    register(client)
    other = make_client()
    login(other, "ann", "secret-pass")
    client.request("DELETE", "/api/me", json={"password": "secret-pass"})
    assert other.get("/api/me").status_code == 401
    assert other.get("/api/boards").status_code == 401
