import hashlib
import hmac
import secrets

# scrypt work factor for new hashes (about 16 MB and 50 ms each). Each hash stores the
# factor it was made with, so it can change without breaking existing passwords.
COST = 2**14


def _scrypt(password: str, salt: bytes, cost: int) -> str:
    return hashlib.scrypt(password.encode(), salt=salt, n=cost, r=8, p=1).hex()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${COST}${salt.hex()}${_scrypt(password, salt, COST)}"


def verify_password(password: str, stored: str) -> bool:
    _, cost, salt, expected = stored.split("$")
    return hmac.compare_digest(_scrypt(password, bytes.fromhex(salt), int(cost)), expected)
