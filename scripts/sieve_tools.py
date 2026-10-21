"""Client-side helpers for Sieve bidders and operators.

Computing a commitment locally is the only safe way to do it: sending the price,
URL, hash and salt to any remote service (including an RPC node) before the
reveal window would leak the sealed bid.
"""

from __future__ import annotations

import hashlib
import re
import secrets

COMMITMENT_DOMAIN = "sieve-bid-v1"
SALT_PATTERN = re.compile(r"[A-Za-z0-9_.~-]{16,64}")


def sha256_hex(raw: bytes) -> str:
    """0x-prefixed lowercase SHA-256, the format the contract expects."""
    return "0x" + hashlib.sha256(raw).hexdigest()


def new_salt() -> str:
    """A fresh 43-character URL-safe salt with 256 bits of entropy."""
    return secrets.token_urlsafe(32)


def tender_key(funder_address: str, tender_id: str) -> str:
    return funder_address.lower() + ":" + tender_id


def commitment(
    funder_address: str,
    tender_id: str,
    bidder_address: str,
    price_wei: int,
    proposal_url: str,
    proposal_hash: str,
    salt: str,
) -> str:
    """Return the sealed-bid commitment exactly as the contract recomputes it."""
    if not SALT_PATTERN.fullmatch(salt):
        raise ValueError("salt must be 16-64 characters from [A-Za-z0-9_.~-]")
    if price_wei < 1:
        raise ValueError("price must be positive")
    fields = [
        COMMITMENT_DOMAIN,
        tender_key(funder_address, tender_id),
        bidder_address.lower(),
        str(int(price_wei)),
        proposal_url,
        proposal_hash.lower(),
        salt,
    ]
    data = b""
    for field in fields:
        encoded = field.encode("utf-8")
        data += len(encoded).to_bytes(4, "big") + encoded
    return "0x" + hashlib.sha256(data).hexdigest()
