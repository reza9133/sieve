import hashlib

import pytest


@pytest.fixture
def actors(direct_accounts):
    """Ten framework accounts plus deterministic extras for capacity tests."""
    extra = [hashlib.sha256(f"sieve-extra-{i}".encode()).digest()[:20] for i in range(12)]
    return list(direct_accounts) + extra
