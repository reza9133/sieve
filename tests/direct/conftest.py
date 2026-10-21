import hashlib

import pytest


@pytest.fixture
def actors(direct_accounts):
    """Ten framework accounts plus deterministic extras for capacity tests."""
    extra = [hashlib.sha256(f"sieve-extra-{i}".encode()).digest()[:20] for i in range(12)]
    return list(direct_accounts) + extra


@pytest.fixture(autouse=True)
def _latest_web_mock_wins(direct_vm):
    """Make a later ``mock_web`` for the same URL replace the earlier one.

    genlayer-test appends mocks and answers with the first match, so a test that serves a
    healthy page in its setup and then re-mocks the same URL with a failure would keep
    receiving the healthy page. Replacing in place keeps hit-tracking indices stable.
    """
    original = direct_vm.mock_web

    def mock_web(url_pattern, response):
        for index, (pattern, _old) in enumerate(direct_vm._web_mocks):
            if pattern.pattern == url_pattern and _old.get("method", "GET") == response.get("method", "GET"):
                direct_vm._web_mocks[index] = (pattern, response)
                return
        original(url_pattern, response)

    direct_vm.mock_web = mock_web
    yield
