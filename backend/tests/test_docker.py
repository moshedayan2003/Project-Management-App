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


def status_of(opener, path, data=None):
    request = urllib.request.Request(
        URL + path,
        data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"},
        method="POST" if data else "GET",
    )
    try:
        return opener.open(request).status
    except urllib.error.HTTPError as error:
        return error.code


@pytest.mark.docker
def test_container_serves_page_and_auth_flow():
    subprocess.run(["docker", "build", "-t", NAME, str(ROOT)], check=True)
    subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
    subprocess.run(["docker", "run", "-d", "--name", NAME, "-p", f"{PORT}:8000", NAME], check=True)
    try:
        body = None
        for _ in range(30):
            try:
                body = urllib.request.urlopen(URL + "/").read().decode()
                break
            except OSError:
                time.sleep(1)
        assert body and "Kanban Studio" in body

        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        assert status_of(opener, "/api/health") == 200
        assert status_of(opener, "/api/me") == 401
        assert status_of(opener, "/api/login", {"username": "user", "password": "bad"}) == 401
        assert status_of(opener, "/api/login", {"username": "user", "password": "password"}) == 200
        assert status_of(opener, "/api/me") == 200
    finally:
        subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
