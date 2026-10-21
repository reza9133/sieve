"""Shared scenario helpers for the Sieve Direct Mode tests."""

import hashlib
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.sieve_tools import commitment as client_commitment  # noqa: E402
from scripts.sieve_tools import sha256_hex  # noqa: E402

CONTRACT = "contracts/sieve.py"
RUNNER = "v0.2.16"
NOW = "2026-10-01T12:00:00Z"
NOW_TS = int(datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc).timestamp())
HOUR = 3600
DAY = 24 * HOUR

BUDGET = 3 * 10**15
BOND = 3 * 10**14
MIN_BUDGET = 10**15
MIN_BOND = 10**14
COMMIT_BY = NOW_TS + HOUR
REVEAL_BY = COMMIT_BY + HOUR
REVIEW_BY = REVEAL_BY + 3 * DAY
TENDER_ID = "T-001"

REQ_URL = "https://tenders.example.org/requirements.md"
REQUIREMENTS = (
    b"R1: The bidder must deliver within 90 days.\n"
    b"R2: The bidder must hold liability insurance of at least 1,000,000.\n"
    b"R3: The bidder must provide a 5-year warranty.\n"
)

# Every proposal prompt contains exactly one marker line that mocks can key on.
PROMPT_HEAD = r"(?s)You are independently screening one sealed-bid proposal"
CONFIDENT = 92


def at(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def addr(value):
    return "0x" + value.hex().lower().removeprefix("0x")


def digest(raw):
    return sha256_hex(raw)


def analysis(requirements=("met", "met", "met"), attempt="no", confidence=CONFIDENT,
             rationale="Each mandatory requirement was checked against the proposal."):
    return {
        "requirements": list(requirements),
        "reviewer_instruction_attempt": attempt,
        "confidence": confidence,
        "rationale": rationale,
    }


VERDICTS = {
    "compliant": analysis(),
    "noncompliant": analysis(("met", "not_met", "met")),
    "noncompliant_r1_r3": analysis(("not_met", "met", "not_met")),
    "injection": analysis(attempt="yes"),
    "unclear": analysis(("met", "unclear", "met")),
    "low_confidence": analysis(confidence=79),
}


@dataclass
class Spec:
    """One bidder's sealed bid plus the evidence it will serve."""

    name: str
    who: bytes
    price: int
    verdict: object = "compliant"
    content: bytes = b""
    salt: str = ""
    url: str = ""
    committed_hash: str = ""
    extra: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.content:
            self.content = (
                f"PROPOSAL-{self.name.upper()}: we will deliver within 90 days, carry "
                f"insurance and a 5-year warranty.\n"
            ).encode()
        if not self.salt:
            self.salt = hashlib.sha256(f"salt-{self.name}".encode()).hexdigest()[:40]
        if not self.url:
            self.url = f"https://bids.example.org/{self.name}.md"
        if not self.committed_hash:
            self.committed_hash = digest(self.content)

    @property
    def marker(self):
        return f"PROPOSAL-{self.name.upper()}"

    def verdict_json(self):
        verdict = VERDICTS[self.verdict] if isinstance(self.verdict, str) else self.verdict
        return json.dumps(verdict)

    def seal(self, funder, tender_id=TENDER_ID, price=None, url=None, proposal_hash=None, salt=None):
        return client_commitment(
            addr(funder), tender_id, addr(self.who),
            self.price if price is None else price,
            self.url if url is None else url,
            self.committed_hash if proposal_hash is None else proposal_hash,
            self.salt if salt is None else salt,
        )


def deploy(direct_vm, direct_deploy):
    direct_vm.warp(NOW)
    return direct_deploy(CONTRACT, sdk_version=RUNNER)


def deposit(contract, direct_vm, who, amount):
    direct_vm.sender = who
    direct_vm.value = amount
    assert contract.deposit_credit() == amount
    direct_vm.value = 0


def open_tender(contract, direct_vm, funder, tender_id=TENDER_ID, *, count=3, budget=BUDGET,
                bond=BOND, max_bids=8, commit_by=COMMIT_BY, reveal_by=REVEAL_BY,
                title="Roof renovation tender", summary="Sealed bids for a roof renovation.",
                url=REQ_URL, req_hash=None, fund=True):
    if fund:
        deposit(contract, direct_vm, funder, budget)
    direct_vm.sender = funder
    return contract.open_tender(
        tender_id, title, summary, url,
        req_hash if req_hash is not None else digest(REQUIREMENTS),
        count, budget, bond, max_bids, commit_by, reveal_by,
    )


def commit(contract, direct_vm, funder, spec, tender_id=TENDER_ID, bond=BOND, topup=True):
    if topup:
        deposit(contract, direct_vm, spec.who, bond)
    direct_vm.sender = spec.who
    return contract.commit_bid(addr(funder), tender_id, spec.seal(funder, tender_id))


def reveal(contract, direct_vm, funder, spec, tender_id=TENDER_ID, **overrides):
    direct_vm.sender = spec.who
    contract.reveal_bid(
        addr(funder), tender_id,
        overrides.get("price", spec.price),
        overrides.get("url", spec.url),
        overrides.get("proposal_hash", spec.committed_hash),
        overrides.get("salt", spec.salt),
    )


def serve(direct_vm, specs, requirements=REQUIREMENTS, req_url=REQ_URL):
    """Mock the web and the model for every spec. Patterns are mutually exclusive."""
    direct_vm.mock_web(req_url, {"status": 200, "body": requirements})
    for spec in specs:
        direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
        direct_vm.mock_llm(
            PROMPT_HEAD + r".*BEGIN_UNTRUSTED_PROPOSAL\n[^\n]*" + spec.marker,
            spec.verdict_json(),
        )


def screen(contract, direct_vm, funder, spec, caller=None, tender_id=TENDER_ID):
    direct_vm.sender = caller if caller is not None else funder
    contract.review_bid(addr(funder), tender_id, addr(spec.who))


def finalize(contract, direct_vm, caller, funder, tender_id=TENDER_ID):
    direct_vm.sender = caller
    contract.finalize_tender(addr(funder), tender_id)


def credit(contract, who):
    return contract.get_available_credit(addr(who))


def bid_of(contract, funder, spec, tender_id=TENDER_ID):
    return contract.get_bid(addr(funder), tender_id, addr(spec.who))


def tender_of(contract, funder, tender_id=TENDER_ID):
    return contract.get_tender(addr(funder), tender_id)


def run_to_screening(contract, direct_vm, funder, specs, tender_id=TENDER_ID, **tender_kwargs):
    """Open, commit and reveal every spec, serve evidence, then enter screening."""
    open_tender(contract, direct_vm, funder, tender_id, **tender_kwargs)
    direct_vm.warp(at(NOW_TS + 60))
    for spec in specs:
        commit(contract, direct_vm, funder, spec, tender_id)
    direct_vm.warp(at(COMMIT_BY))
    for spec in specs:
        reveal(contract, direct_vm, funder, spec, tender_id)
    serve(direct_vm, specs)
    direct_vm.warp(at(REVEAL_BY))


def check_books(contract, addresses, tenders=()):
    """Assert the whole ledger is internally consistent.

    addresses: every account that may hold credit or a bond.
    tenders: (funder, tender_id) pairs whose escrow may still be locked.
    """
    accounting = contract.get_accounting()
    held = sum(credit(contract, who) for who in addresses)
    assert held == accounting["total_credits"], "per-account credits must sum to the aggregate"
    budgets = 0
    bonds = 0
    for funder, tender_id in tenders:
        tender = tender_of(contract, funder, tender_id)
        if tender["status"] == "open":
            budgets += tender["budget_wei"]
        for bidder in contract.get_bidders(addr(funder), tender_id)["bidders"]:
            bonds += contract.get_bid(addr(funder), tender_id, bidder)["bond_wei"]
    assert budgets == accounting["total_locked_budgets"], "locked budgets must match open tenders"
    assert bonds == accounting["total_locked_bonds"], "locked bonds must match unreleased bids"
    assert accounting["accounted_liabilities"] == (
        accounting["total_credits"] + accounting["total_locked_budgets"]
        + accounting["total_locked_bonds"]
    )
    return accounting
