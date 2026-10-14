import json
import subprocess
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NAME = "pm-app-test"
PORT = 8765
URL = f"http://localhost:{PORT}"


def call(opener, path, data=None, method=None):
    """Return (status, parsed JSON body or None)."""
    request = urllib.request.Request(
        URL + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json"},
        method=method or ("POST" if data is not None else "GET"),
    )
    try:
        response = opener.open(request)
    except urllib.error.HTTPError as error:
        return error.code, None
    body = response.read()
    return response.status, json.loads(body) if body else None


def wait_until_up():
    for _ in range(30):
        try:
            urllib.request.urlopen(URL + "/api/health")
            return
        except OSError:
            time.sleep(1)
    raise AssertionError("container did not start")


@pytest.mark.docker
def test_container_serves_page_auth_and_persists_board():
    subprocess.run(["docker", "build", "-t", NAME, str(ROOT)], check=True)
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
    subprocess.run(["docker", "run", "-d", "--name", NAME, "-p", f"127.0.0.1:{PORT}:8000", NAME], check=True)
    try:
        wait_until_up()
        assert "Kanban Studio" in urllib.request.urlopen(URL + "/").read().decode()

        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        assert call(opener, "/api/me")[0] == 401
        assert call(opener, "/api/board")[0] == 401
        assert call(opener, "/api/login", {"username": "user", "password": "bad"})[0] == 401
        assert call(opener, "/api/login", {"username": "user", "password": "password"})[0] == 200

        status, board = call(opener, "/api/board")
        assert status == 200 and len(board["columns"]) == 5 and len(board["cards"]) == 8

        status, _ = call(opener, "/api/columns/col-done", {"title": "Shipped"}, method="PATCH")
        assert status == 200

        # The database file survives a container restart.
        subprocess.run(["docker", "restart", NAME], check=True, capture_output=True)
        wait_until_up()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        call(opener, "/api/login", {"username": "user", "password": "password"})
        assert call(opener, "/api/board")[1]["columns"][-1]["title"] == "Shipped"
    finally:
        subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
