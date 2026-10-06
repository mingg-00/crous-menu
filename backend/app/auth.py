import os

import jwt
from fastapi import Header, HTTPException

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ISSUER = f"{SUPABASE_URL}/auth/v1"

_jwks: jwt.PyJWKClient | None = None


def _signing_key(token: str):
    """Public key from the project's JWKS (cached by PyJWKClient, refetched on unknown kid)."""
    global _jwks
    _jwks = _jwks or jwt.PyJWKClient(f"{ISSUER}/.well-known/jwks.json", cache_keys=True, timeout=5)
    return _jwks.get_signing_key_from_jwt(token).key


def _user_id(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Expected 'Authorization: Bearer <token>'")
    try:
        claims = jwt.decode(
            token, _signing_key(token), algorithms=["ES256", "RS256"], audience="authenticated", issuer=ISSUER
        )
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    return claims["sub"]


# Sync on purpose: PyJWKClient fetches with blocking I/O, so FastAPI runs these in its threadpool.
def current_user(authorization: str | None = Header(None)) -> str:
    user = _user_id(authorization)
    if user is None:
        raise HTTPException(401, "Login required")
    return user


def optional_user(authorization: str | None = Header(None)) -> str | None:
    return _user_id(authorization)
