"""Commit, withdraw and reveal rules, including exact deadline boundaries."""

import pytest

from tests.direct.support import (
    BOND, BUDGET, COMMIT_BY, NOW_TS, REVEAL_BY, TENDER_ID, Spec, addr, at, bid_of, check_books,
    commit, credit, deploy, deposit, digest, open_tender, reveal, tender_of,
)


def _open(direct_vm, direct_deploy, actors, **kw):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0], **kw)
    direct_vm.warp(at(NOW_TS + 60))
    return contract


def test_commit_locks_exactly_one_bond_and_assigns_sequential_indexes(
    direct_vm, direct_deploy, actors
):
    contract = _open(direct_vm, direct_deploy, actors)
    for position in range(3):
        spec = Spec(f"b{position}", actors[1 + position], 10**15)
        assert commit(contract, direct_vm, actors[0], spec) == position
        assert credit(contract, spec.who) == 0
    assert contract.get_accounting()["total_locked_bonds"] == 3 * BOND
    assert tender_of(contract, actors[0])["bid_count"] == 3
    check_books(contract, actors, [(actors[0], TENDER_ID)])


def test_bond_can_come_from_a_larger_existing_credit(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("rich", actors[1], 10**15)
    deposit(contract, direct_vm, spec.who, 5 * BOND)
    commit(contract, direct_vm, actors[0], spec, topup=False)
    assert credit(contract, spec.who) == 4 * BOND


def test_commit_without_enough_credit_reverts(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("poor", actors[1], 10**15)
    deposit(contract, direct_vm, spec.who, BOND - 1)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], spec, topup=False)
    assert credit(contract, spec.who) == BOND - 1
    assert tender_of(contract, actors[0])["bid_count"] == 0
    deposit(contract, direct_vm, spec.who, 1)
    assert commit(contract, direct_vm, actors[0], spec, topup=False) == 0


def test_funder_cannot_bid_on_their_own_tender(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("self", actors[0], 10**15)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], spec)
    assert tender_of(contract, actors[0])["bid_count"] == 0


def test_one_sealed_bid_per_address_even_with_a_different_commitment(
    direct_vm, direct_deploy, actors
):
    contract = _open(direct_vm, direct_deploy, actors)
    first = Spec("first", actors[1], 10**15)
    commit(contract, direct_vm, actors[0], first)
    second = Spec("second", actors[1], 9 * 10**14)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], second)
    assert tender_of(contract, actors[0])["bid_count"] == 1
    assert credit(contract, actors[1]) == BOND  # the failed top-up stays available


def test_withdrawn_bidder_cannot_commit_again(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("fickle", actors[1], 10**15)
    commit(contract, direct_vm, actors[0], spec)
    direct_vm.sender = spec.who
    contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], spec, topup=False)
    assert bid_of(contract, actors[0], spec)["status"] == "withdrawn"


def test_capacity_is_enforced_and_withdrawals_do_not_free_slots(
    direct_vm, direct_deploy, actors
):
    contract = _open(direct_vm, direct_deploy, actors, max_bids=2)
    one = Spec("one", actors[1], 10**15)
    two = Spec("two", actors[2], 10**15)
    commit(contract, direct_vm, actors[0], one)
    commit(contract, direct_vm, actors[0], two)
    late = Spec("late", actors[3], 10**15)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], late)
    direct_vm.sender = one.who
    contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], late, topup=False)
    assert tender_of(contract, actors[0])["bid_count"] == 2


def test_sixteen_bidders_fill_a_maximum_tender(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors, max_bids=16)
    for position in range(16):
        commit(contract, direct_vm, actors[0],
               Spec(f"m{position}", actors[1 + position], 10**15))
    assert tender_of(contract, actors[0])["bid_count"] == 16
    extra = Spec("extra", actors[17], 10**15)
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], extra)


@pytest.mark.parametrize("bad", ["", "0x12", "0x" + "z" * 64, "ab" * 32, "0x" + "a" * 65])
def test_malformed_commitment_reverts(direct_vm, direct_deploy, actors, bad):
    contract = _open(direct_vm, direct_deploy, actors)
    deposit(contract, direct_vm, actors[1], BOND)
    direct_vm.sender = actors[1]
    with direct_vm.expect_revert():
        contract.commit_bid(addr(actors[0]), TENDER_ID, bad)
    assert credit(contract, actors[1]) == BOND
    assert tender_of(contract, actors[0])["bid_count"] == 0


def test_commit_to_unknown_tender_reverts(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("x", actors[1], 10**15)
    deposit(contract, direct_vm, spec.who, BOND)
    direct_vm.sender = spec.who
    with direct_vm.expect_revert():
        contract.commit_bid(addr(actors[0]), "nope", spec.seal(actors[0]))
    assert credit(contract, spec.who) == BOND


def test_commit_deadline_boundary_is_exclusive(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    last = Spec("last", actors[1], 10**15)
    direct_vm.warp(at(COMMIT_BY - 1))
    commit(contract, direct_vm, actors[0], last)
    miss = Spec("miss", actors[2], 10**15)
    direct_vm.warp(at(COMMIT_BY))
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], miss)
    assert tender_of(contract, actors[0])["bid_count"] == 1


def test_withdraw_rules(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    mine = Spec("mine", actors[1], 10**15)
    commit(contract, direct_vm, actors[0], mine)
    # A stranger and the funder have nothing to withdraw.
    for who in (actors[2], actors[0]):
        direct_vm.sender = who
        with direct_vm.expect_revert():
            contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    direct_vm.sender = mine.who
    contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    assert credit(contract, mine.who) == BOND
    with direct_vm.expect_revert():
        contract.withdraw_bid(addr(actors[0]), TENDER_ID)  # twice
    assert credit(contract, mine.who) == BOND
    check_books(contract, actors, [(actors[0], TENDER_ID)])


def test_withdraw_is_closed_from_the_commit_deadline(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    mine = Spec("mine", actors[1], 10**15)
    commit(contract, direct_vm, actors[0], mine)
    direct_vm.warp(at(COMMIT_BY))
    direct_vm.sender = mine.who
    with direct_vm.expect_revert():
        contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    assert bid_of(contract, actors[0], mine)["status"] == "committed"
    assert bid_of(contract, actors[0], mine)["bond_wei"] == BOND


def test_withdraw_after_reveal_is_impossible(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    mine = Spec("mine", actors[1], 10**15)
    commit(contract, direct_vm, actors[0], mine)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, actors[0], mine)
    with direct_vm.expect_revert():
        contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    assert bid_of(contract, actors[0], mine)["bond_wei"] == BOND


def _committed(direct_vm, direct_deploy, actors, price=10**15):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("rev", actors[1], price)
    commit(contract, direct_vm, actors[0], spec)
    return contract, spec


def test_reveal_window_boundaries(direct_vm, direct_deploy, actors):
    contract, spec = _committed(direct_vm, direct_deploy, actors)
    # Too early: still in the commit window.
    direct_vm.warp(at(COMMIT_BY - 1))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "committed"
    # Exactly at commit_by the reveal opens.
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"


def test_reveal_closes_exactly_at_the_reveal_deadline(direct_vm, direct_deploy, actors):
    contract, spec = _committed(direct_vm, direct_deploy, actors)
    direct_vm.warp(at(REVEAL_BY))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec)
    direct_vm.warp(at(REVEAL_BY - 1))
    reveal(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"


@pytest.mark.parametrize("field", ["price", "url", "proposal_hash", "salt"])
def test_any_single_changed_reveal_field_breaks_the_commitment(
    direct_vm, direct_deploy, actors, field
):
    contract, spec = _committed(direct_vm, direct_deploy, actors)
    direct_vm.warp(at(COMMIT_BY))
    changed = {
        "price": spec.price - 1,
        "url": "https://bids.example.org/other.md",
        "proposal_hash": digest(b"different bytes"),
        "salt": "x" * 20,
    }[field]
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec, **{field: changed})
    assert bid_of(contract, actors[0], spec)["status"] == "committed"
    reveal(contract, direct_vm, actors[0], spec)  # control: the true values still work
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"


def test_double_reveal_reverts(direct_vm, direct_deploy, actors):
    contract, spec = _committed(direct_vm, direct_deploy, actors)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, actors[0], spec)
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec)


def test_reveal_without_a_commitment_reverts(direct_vm, direct_deploy, actors):
    contract, spec = _committed(direct_vm, direct_deploy, actors)
    direct_vm.warp(at(COMMIT_BY))
    stranger = Spec("rev", actors[5], spec.price)
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], stranger)


def test_price_must_be_between_one_wei_and_the_budget(direct_vm, direct_deploy, actors):
    contract = _open(direct_vm, direct_deploy, actors)
    too_high = Spec("high", actors[1], BUDGET + 1)
    zero = Spec("zero", actors[2], 0 + 1)
    commit(contract, direct_vm, actors[0], too_high)
    # A zero price cannot even be sealed by the client helper, so seal it manually.
    deposit(contract, direct_vm, zero.who, BOND)
    direct_vm.sender = zero.who
    import hashlib
    fields = ["sieve-bid-v1", addr(actors[0]) + ":" + TENDER_ID, addr(zero.who), "0",
              zero.url, zero.committed_hash, zero.salt]
    data = b"".join(len(f.encode()).to_bytes(4, "big") + f.encode() for f in fields)
    contract.commit_bid(addr(actors[0]), TENDER_ID, "0x" + hashlib.sha256(data).hexdigest())
    direct_vm.warp(at(COMMIT_BY))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], too_high)
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], zero, price=0)
    assert bid_of(contract, actors[0], too_high)["status"] == "committed"
    assert bid_of(contract, actors[0], zero)["status"] == "committed"


@pytest.mark.parametrize("salt", ["short", "a" * 15, "a" * 65, "has space inside!!", "ünïcödé-salt-salt-salt"])
def test_weak_or_malformed_salts_cannot_be_revealed(direct_vm, direct_deploy, actors, salt):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("weak", actors[1], 10**15)
    spec.salt = salt
    deposit(contract, direct_vm, spec.who, BOND)
    direct_vm.sender = spec.who
    import hashlib
    fields = ["sieve-bid-v1", addr(actors[0]) + ":" + TENDER_ID, addr(spec.who),
              str(spec.price), spec.url, spec.committed_hash, salt]
    data = b"".join(len(f.encode()).to_bytes(4, "big") + f.encode() for f in fields)
    contract.commit_bid(addr(actors[0]), TENDER_ID, "0x" + hashlib.sha256(data).hexdigest())
    direct_vm.warp(at(COMMIT_BY))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "committed"


@pytest.mark.parametrize("url", [
    "http://bids.example.org/p.md", "https://127.0.0.1/p.md", "https://bids.example.org:99/p.md",
    "https://u:p@bids.example.org/p.md", "https://intranet/p.md",
])
def test_unsafe_proposal_urls_cannot_be_revealed(direct_vm, direct_deploy, actors, url):
    contract = _open(direct_vm, direct_deploy, actors)
    spec = Spec("unsafe", actors[1], 10**15, url=url)
    commit(contract, direct_vm, actors[0], spec)
    direct_vm.warp(at(COMMIT_BY))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "committed"


def test_reveal_cannot_be_replayed_in_a_different_tender(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0], "A")
    open_tender(contract, direct_vm, actors[0], "B")
    direct_vm.warp(at(NOW_TS + 60))
    spec = Spec("replay", actors[1], 10**15)
    commit(contract, direct_vm, actors[0], spec, "A")
    # The same sealed value, committed to tender B, was computed for tender A.
    deposit(contract, direct_vm, spec.who, BOND)
    direct_vm.sender = spec.who
    contract.commit_bid(addr(actors[0]), "B", spec.seal(actors[0], "A"))
    direct_vm.warp(at(COMMIT_BY))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[0], spec, "B")
    reveal(contract, direct_vm, actors[0], spec, "A")


def test_reveal_cannot_be_replayed_under_a_different_funder(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    open_tender(contract, direct_vm, actors[5])
    direct_vm.warp(at(NOW_TS + 60))
    spec = Spec("replay", actors[1], 10**15)
    deposit(contract, direct_vm, spec.who, BOND)
    direct_vm.sender = spec.who
    contract.commit_bid(addr(actors[5]), TENDER_ID, spec.seal(actors[0]))
    direct_vm.warp(at(COMMIT_BY))
    with direct_vm.expect_revert():
        reveal(contract, direct_vm, actors[5], spec)
