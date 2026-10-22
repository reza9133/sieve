"""Input validation: every malformed tender must revert and leave the books untouched."""

import pytest

from tests.direct.support import (
    BOND, BUDGET, COMMIT_BY, MIN_BOND, MIN_BUDGET, NOW_TS, REQ_URL, REQUIREMENTS, REVEAL_BY,
    TENDER_ID, addr, check_books, credit, deploy, deposit, digest, open_tender, tender_of,
)

DAY = 86400


def _raw_open(contract, vm, funder, **kw):
    params = dict(
        tender_id=TENDER_ID, title="Title", summary="Summary", url=REQ_URL,
        req_hash=digest(REQUIREMENTS), count=3, budget=BUDGET, bond=BOND, max_bids=8,
        commit_by=COMMIT_BY, reveal_by=REVEAL_BY,
    )
    params.update(kw)
    vm.sender = funder
    return contract.open_tender(
        params["tender_id"], params["title"], params["summary"], params["url"],
        params["req_hash"], params["count"], params["budget"], params["bond"],
        params["max_bids"], params["commit_by"], params["reveal_by"],
    )


BAD_CASES = {
    "empty_id": dict(tender_id=""),
    "long_id": dict(tender_id="a" * 65),
    "id_with_space": dict(tender_id="bad id"),
    "id_leading_dash": dict(tender_id="-x"),
    "id_hash_char": dict(tender_id="a#b"),
    "id_colon": dict(tender_id="a:b"),
    "empty_title": dict(title="   "),
    "long_title": dict(title="t" * 121),
    "empty_summary": dict(summary=""),
    "long_summary": dict(summary="s" * 601),
    "short_hash": dict(req_hash="0x1234"),
    "no_prefix_hash": dict(req_hash="ab" * 32),
    "non_hex_hash": dict(req_hash="0x" + "g" * 64),
    "http_url": dict(url="http://tenders.example.org/r.md"),
    "localhost": dict(url="https://localhost/r.md"),
    "ipv4": dict(url="https://127.0.0.1/r.md"),
    "private_ip": dict(url="https://10.0.0.5/r.md"),
    "ipv6": dict(url="https://[::1]/r.md"),
    "credentials": dict(url="https://user:pw@tenders.example.org/r.md"),
    "odd_port": dict(url="https://tenders.example.org:8443/r.md"),
    "fragment": dict(url="https://tenders.example.org/r.md#x"),
    "dot_local": dict(url="https://printer.local/r.md"),
    "dot_internal": dict(url="https://svc.internal/r.md"),
    "single_label": dict(url="https://intranet/r.md"),
    "space_in_url": dict(url="https://tenders.example.org/a b.md"),
    "control_in_url": dict(url="https://tenders.example.org/a\x01b.md"),
    "long_url": dict(url="https://tenders.example.org/" + "a" * 520),
    "zero_requirements": dict(count=0),
    "too_many_requirements": dict(count=9),
    "u16_overflow_requirements": dict(count=70_000),
    "budget_below_min": dict(budget=MIN_BUDGET - 1),
    "bond_below_min": dict(bond=MIN_BOND - 1),
    "bond_above_budget": dict(bond=BUDGET + 1),
    "zero_capacity": dict(max_bids=0),
    "capacity_over_limit": dict(max_bids=17),
    "commit_too_soon": dict(commit_by=NOW_TS + 119),
    "commit_in_past": dict(commit_by=NOW_TS - 1),
    "commit_too_far": dict(commit_by=NOW_TS + 30 * DAY + 1),
    "reveal_too_soon": dict(reveal_by=COMMIT_BY + 119),
    "reveal_before_commit": dict(reveal_by=COMMIT_BY - 1),
    "reveal_too_far": dict(reveal_by=COMMIT_BY + 7 * DAY + 1),
}


@pytest.mark.parametrize("case", sorted(BAD_CASES))
def test_malformed_tender_reverts_without_touching_the_books(
    direct_vm, direct_deploy, actors, case
):
    funder = actors[0]
    contract = deploy(direct_vm, direct_deploy)
    deposit(contract, direct_vm, funder, 10 * BUDGET)
    with direct_vm.expect_revert():
        _raw_open(contract, direct_vm, funder, **BAD_CASES[case])
    assert credit(contract, funder) == 10 * BUDGET
    accounting = contract.get_accounting()
    assert accounting["total_locked_budgets"] == 0
    # Control: the same call with every field valid succeeds, so the revert above was
    # caused by the single bad field.
    _raw_open(contract, direct_vm, funder)
    assert tender_of(contract, funder)["status"] == "open"


@pytest.mark.parametrize("count", [1, 8])
def test_requirement_count_boundaries_are_inclusive(direct_vm, direct_deploy, actors, count):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0], count=count)
    assert tender_of(contract, actors[0])["requirement_count"] == count


@pytest.mark.parametrize("capacity", [1, 16])
def test_capacity_boundaries_are_inclusive(direct_vm, direct_deploy, actors, capacity):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0], max_bids=capacity)
    assert tender_of(contract, actors[0])["max_bids"] == capacity


def test_exact_minimum_windows_and_amounts_are_accepted(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    direct_vm.warp("2026-10-01T12:00:00Z")
    commit_by = NOW_TS + 120
    open_tender(
        contract, direct_vm, actors[0], budget=MIN_BUDGET, bond=MIN_BOND,
        commit_by=commit_by, reveal_by=commit_by + 120,
    )
    tender = tender_of(contract, actors[0])
    assert tender["review_by"] == commit_by + 120 + 3 * DAY


def test_maximum_windows_are_accepted(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    commit_by = NOW_TS + 30 * DAY
    open_tender(contract, direct_vm, actors[0], commit_by=commit_by,
                reveal_by=commit_by + 7 * DAY)
    assert tender_of(contract, actors[0])["reveal_by"] == commit_by + 7 * DAY


def test_whitespace_in_text_fields_is_normalised(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0], title="  Roof \n  renovation\t tender ")
    assert tender_of(contract, actors[0])["title"] == "Roof renovation tender"


def test_opening_needs_enough_credit_and_never_borrows(direct_vm, direct_deploy, actors):
    funder = actors[0]
    contract = deploy(direct_vm, direct_deploy)
    deposit(contract, direct_vm, funder, BUDGET - 1)
    with direct_vm.expect_revert():
        _raw_open(contract, direct_vm, funder)
    assert credit(contract, funder) == BUDGET - 1
    deposit(contract, direct_vm, funder, 1)
    _raw_open(contract, direct_vm, funder)
    assert credit(contract, funder) == 0


def test_duplicate_tender_id_reverts_but_other_funders_may_reuse_it(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    deposit(contract, direct_vm, actors[0], BUDGET)
    with direct_vm.expect_revert():
        _raw_open(contract, direct_vm, actors[0])
    assert credit(contract, actors[0]) == BUDGET
    open_tender(contract, direct_vm, actors[1])
    assert tender_of(contract, actors[1])["funder"].lower() == addr(actors[1])
    check_books(contract, actors, [(actors[0], TENDER_ID), (actors[1], TENDER_ID)])


def test_unknown_tender_and_unknown_bid_reads_revert(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    with direct_vm.expect_revert():
        contract.get_tender(addr(actors[0]), "missing")
    open_tender(contract, direct_vm, actors[0])
    with direct_vm.expect_revert():
        contract.get_bid(addr(actors[0]), TENDER_ID, addr(actors[1]))
    with direct_vm.expect_revert():
        contract.get_tender("not-an-address", TENDER_ID)
    with direct_vm.expect_revert():
        contract.get_tender("0x" + "0" * 40, TENDER_ID)


def test_cancel_by_stranger_or_unknown_tender_reverts(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    direct_vm.sender = actors[1]
    with direct_vm.expect_revert():
        contract.cancel_tender(TENDER_ID)
    assert tender_of(contract, actors[0])["status"] == "open"
    direct_vm.sender = actors[0]
    with direct_vm.expect_revert():
        contract.cancel_tender("unknown")
