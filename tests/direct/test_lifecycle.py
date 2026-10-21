"""Normal, end-to-end behavior of a Sieve tender."""

import hashlib

import pytest

from tests.direct.support import (
    BOND, BUDGET, COMMIT_BY, MIN_BOND, MIN_BUDGET, NOW_TS, REVEAL_BY, REVIEW_BY, TENDER_ID,
    Spec, addr, at, bid_of, check_books, commit, credit, deploy, deposit, digest, finalize,
    open_tender, reveal, run_to_screening, screen, serve, tender_of,
)


def test_info_reports_the_deployed_rules(direct_vm, direct_deploy):
    contract = deploy(direct_vm, direct_deploy)
    info = contract.get_info()
    assert info["name"] == "Sieve"
    assert info["version"] == "0.1.0"
    assert info["min_budget_wei"] == MIN_BUDGET
    assert info["min_bond_wei"] == MIN_BOND
    assert info["max_requirements"] == 8
    assert info["max_bids_limit"] == 16
    assert info["minimum_confidence"] == 80
    assert info["max_review_calls_per_bid"] == 8
    assert info["max_semantic_assessments_per_bid"] == 3
    assert "emits no transfers" in info["settlement_model"]


def test_lowest_compliant_bid_wins_and_everything_is_credited(
    direct_vm, direct_deploy, actors
):
    funder, a, b, c = actors[0], actors[1], actors[2], actors[3]
    alpha = Spec("alpha", a, 2_000_000_000_000_000)
    bravo = Spec("bravo", b, 1_500_000_000_000_000)
    charlie = Spec("charlie", c, 1_000_000_000_000_000, verdict="noncompliant")
    specs = [alpha, bravo, charlie]
    contract = deploy(direct_vm, direct_deploy)
    run_to_screening(contract, direct_vm, funder, specs)
    for spec in specs:
        screen(contract, direct_vm, funder, spec)
    assert bid_of(contract, funder, alpha)["status"] == "compliant"
    assert bid_of(contract, funder, bravo)["status"] == "compliant"
    assert bid_of(contract, funder, charlie)["status"] == "noncompliant"
    assert bid_of(contract, funder, charlie)["failed_mask"] == 0b010

    ranking = contract.get_ranking(addr(funder), TENDER_ID)["entries"]
    assert [entry["bidder"].lower() for entry in ranking] == [addr(b), addr(a)]

    # Anyone may finalize, including a stranger.
    finalize(contract, direct_vm, actors[9], funder)
    tender = tender_of(contract, funder)
    assert tender["status"] == "finalized"
    assert tender["winner"].lower() == addr(b)
    assert tender["award_price"] == bravo.price
    assert tender["settlement"] == "awarded_to_lowest_compliant_bid"
    assert tender["forfeited_wei"] == 0

    assert credit(contract, b) == bravo.price + BOND
    assert credit(contract, a) == BOND
    assert credit(contract, c) == BOND
    assert credit(contract, funder) == BUDGET - bravo.price
    assert bid_of(contract, funder, bravo)["outcome"] == "won"
    assert bid_of(contract, funder, alpha)["outcome"] == "compliant_not_lowest"
    assert bid_of(contract, funder, charlie)["outcome"] == "noncompliant_bond_refunded"
    accounting = check_books(contract, actors, [(funder, TENDER_ID)])
    assert accounting["total_locked_budgets"] == 0
    assert accounting["total_locked_bonds"] == 0
    # Value is conserved: 3 bonds + budget were deposited, all of it is now credit.
    assert accounting["total_credits"] == BUDGET + 3 * BOND


def test_tie_goes_to_the_earliest_commitment(direct_vm, direct_deploy, actors):
    funder = actors[0]
    price = 1_200_000_000_000_000
    first = Spec("first", actors[1], price)
    second = Spec("second", actors[2], price)
    contract = deploy(direct_vm, direct_deploy)
    # second reveals and is screened first, but first committed first.
    open_tender(contract, direct_vm, funder)
    direct_vm.warp(at(NOW_TS + 10))
    commit(contract, direct_vm, funder, first)
    direct_vm.warp(at(NOW_TS + 20))
    commit(contract, direct_vm, funder, second)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, funder, second)
    reveal(contract, direct_vm, funder, first)
    serve(direct_vm, [first, second])
    direct_vm.warp(at(REVEAL_BY))
    screen(contract, direct_vm, funder, second)
    screen(contract, direct_vm, funder, first)
    finalize(contract, direct_vm, funder, funder)
    assert tender_of(contract, funder)["winner"].lower() == addr(first.who)
    assert bid_of(contract, funder, first)["index"] == 0
    assert bid_of(contract, funder, second)["index"] == 1


def test_cheapest_overall_but_noncompliant_does_not_win(direct_vm, direct_deploy, actors):
    funder = actors[0]
    cheap_bad = Spec("cheap", actors[1], 1, verdict="noncompliant")
    fair = Spec("fair", actors[2], 2_500_000_000_000_000)
    contract = deploy(direct_vm, direct_deploy)
    run_to_screening(contract, direct_vm, funder, [cheap_bad, fair])
    screen(contract, direct_vm, funder, cheap_bad)
    screen(contract, direct_vm, funder, fair)
    finalize(contract, direct_vm, funder, funder)
    assert tender_of(contract, funder)["winner"].lower() == addr(fair.who)
    assert credit(contract, cheap_bad.who) == BOND


def test_price_equal_to_the_whole_budget_can_win(direct_vm, direct_deploy, actors):
    funder = actors[0]
    full = Spec("full", actors[1], BUDGET)
    contract = deploy(direct_vm, direct_deploy)
    run_to_screening(contract, direct_vm, funder, [full])
    screen(contract, direct_vm, funder, full)
    finalize(contract, direct_vm, funder, funder)
    assert credit(contract, full.who) == BUDGET + BOND
    assert credit(contract, funder) == 0
    check_books(contract, actors, [(funder, TENDER_ID)])


def test_one_wei_price_is_valid(direct_vm, direct_deploy, actors):
    funder = actors[0]
    tiny = Spec("tiny", actors[1], 1)
    contract = deploy(direct_vm, direct_deploy)
    run_to_screening(contract, direct_vm, funder, [tiny])
    screen(contract, direct_vm, funder, tiny)
    finalize(contract, direct_vm, funder, funder)
    assert credit(contract, tiny.who) == 1 + BOND
    assert credit(contract, funder) == BUDGET - 1


def test_no_compliant_bid_returns_the_full_budget(direct_vm, direct_deploy, actors):
    funder = actors[0]
    bad = Spec("bad", actors[1], 1_000_000_000_000_000, verdict="noncompliant")
    contract = deploy(direct_vm, direct_deploy)
    run_to_screening(contract, direct_vm, funder, [bad])
    screen(contract, direct_vm, funder, bad)
    finalize(contract, direct_vm, funder, funder)
    tender = tender_of(contract, funder)
    assert tender["winner"] == ""
    assert tender["award_price"] == 0
    assert tender["settlement"] == "no_compliant_bid_budget_returned"
    assert credit(contract, funder) == BUDGET
    assert credit(contract, bad.who) == BOND
    check_books(contract, actors, [(funder, TENDER_ID)])


def test_unrevealed_bond_is_forfeited_to_the_funder(direct_vm, direct_deploy, actors):
    funder = actors[0]
    honest = Spec("honest", actors[1], 2_000_000_000_000_000)
    ghost = Spec("ghost", actors[2], 1_000_000_000_000_000)
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, funder)
    direct_vm.warp(at(NOW_TS + 60))
    commit(contract, direct_vm, funder, honest)
    commit(contract, direct_vm, funder, ghost)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, funder, honest)
    serve(direct_vm, [honest])
    direct_vm.warp(at(REVEAL_BY))
    screen(contract, direct_vm, funder, honest)
    finalize(contract, direct_vm, funder, funder)
    assert bid_of(contract, funder, ghost)["outcome"] == "unrevealed_bond_forfeited"
    assert tender_of(contract, funder)["forfeited_wei"] == BOND
    assert credit(contract, ghost.who) == 0
    assert credit(contract, funder) == (BUDGET - honest.price) + BOND
    assert credit(contract, honest.who) == honest.price + BOND
    check_books(contract, actors, [(funder, TENDER_ID)])


def test_withdrawn_sealed_bid_gets_its_bond_back_and_is_not_forfeited(
    direct_vm, direct_deploy, actors
):
    funder, leaver, stayer = actors[0], actors[1], actors[2]
    leaving = Spec("leaving", leaver, 1_000_000_000_000_000)
    staying = Spec("staying", stayer, 2_000_000_000_000_000)
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, funder)
    direct_vm.warp(at(NOW_TS + 60))
    commit(contract, direct_vm, funder, leaving)
    commit(contract, direct_vm, funder, staying)
    assert credit(contract, leaver) == 0
    direct_vm.sender = leaver
    contract.withdraw_bid(addr(funder), TENDER_ID)
    assert credit(contract, leaver) == BOND
    assert bid_of(contract, funder, leaving)["status"] == "withdrawn"
    assert bid_of(contract, funder, leaving)["bond_wei"] == 0
    check_books(contract, actors, [(funder, TENDER_ID)])
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, funder, staying)
    serve(direct_vm, [staying])
    direct_vm.warp(at(REVEAL_BY))
    screen(contract, direct_vm, funder, staying)
    finalize(contract, direct_vm, funder, funder)
    assert tender_of(contract, funder)["forfeited_wei"] == 0
    assert bid_of(contract, funder, leaving)["outcome"] == "withdrawn_bond_refunded"
    assert credit(contract, leaver) == BOND
    check_books(contract, actors, [(funder, TENDER_ID)])


def test_tender_with_no_bids_can_be_cancelled_and_refunds_the_budget(
    direct_vm, direct_deploy, actors
):
    funder = actors[0]
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, funder)
    assert credit(contract, funder) == 0
    direct_vm.sender = funder
    contract.cancel_tender(TENDER_ID)
    assert tender_of(contract, funder)["status"] == "cancelled"
    assert credit(contract, funder) == BUDGET
    check_books(contract, actors, [(funder, TENDER_ID)])
    with direct_vm.expect_revert():
        contract.cancel_tender(TENDER_ID)
    assert credit(contract, funder) == BUDGET


def test_tender_with_no_bids_can_also_be_finalized_after_reveal(direct_vm, direct_deploy, actors):
    funder = actors[0]
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, funder)
    direct_vm.warp(at(REVEAL_BY))
    finalize(contract, direct_vm, actors[5], funder)
    assert tender_of(contract, funder)["settlement"] == "no_compliant_bid_budget_returned"
    assert credit(contract, funder) == BUDGET


def test_credit_withdrawal_is_caller_owned_and_cleared_first(direct_vm, direct_deploy, actors):
    owner, other = actors[0], actors[1]
    contract = deploy(direct_vm, direct_deploy)
    deposit(contract, direct_vm, owner, 5 * 10**14)
    direct_vm.sender = other
    with direct_vm.expect_revert():
        contract.withdraw_credit()
    assert credit(contract, owner) == 5 * 10**14
    direct_vm.sender = owner
    contract.withdraw_credit()
    assert credit(contract, owner) == 0
    assert contract.get_accounting()["total_credits"] == 0
    with direct_vm.expect_revert():
        contract.withdraw_credit()


def test_zero_deposit_is_rejected(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    direct_vm.sender = actors[0]
    direct_vm.value = 0
    with direct_vm.expect_revert():
        contract.deposit_credit()
    assert contract.get_accounting()["total_credits"] == 0


def test_bidder_list_preserves_commit_order(direct_vm, direct_deploy, actors):
    funder = actors[0]
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, funder)
    direct_vm.warp(at(NOW_TS + 5))
    order = [actors[3], actors[1], actors[2]]
    for position, who in enumerate(order):
        commit(contract, direct_vm, funder, Spec(f"n{position}", who, 10**15))
    listed = contract.get_bidders(addr(funder), TENDER_ID)["bidders"]
    assert [item.lower() for item in listed] == [addr(who) for who in order]


def test_sealed_price_is_hidden_until_reveal(direct_vm, direct_deploy, actors):
    funder = actors[0]
    spec = Spec("secret", actors[1], 1_234_567_890_123_456)
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, funder)
    direct_vm.warp(at(NOW_TS + 5))
    commit(contract, direct_vm, funder, spec)
    sealed = bid_of(contract, funder, spec)
    assert sealed["price"] == 0
    assert sealed["proposal_url"] == ""
    assert sealed["status"] == "committed"
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, funder, spec)
    opened = bid_of(contract, funder, spec)
    assert opened["price"] == spec.price
    assert opened["proposal_hash"] == spec.committed_hash
    assert opened["status"] == "revealed"


def test_commitment_known_answer_vector():
    """Pins the commitment scheme so contract and clients cannot drift apart."""
    from scripts.sieve_tools import commitment

    fields = [
        "sieve-bid-v1", "0x" + "ab" * 20 + ":T-1", "0x" + "cd" * 20, "1500",
        "https://bids.example.org/a.md", "0x" + "11" * 32, "salt-salt-salt-salt-1",
    ]
    data = b"".join(len(f.encode()).to_bytes(4, "big") + f.encode() for f in fields)
    expected = "0x" + hashlib.sha256(data).hexdigest()
    got = commitment(
        "0x" + "AB" * 20, "T-1", "0x" + "CD" * 20, 1500,
        "https://bids.example.org/a.md", "0x" + "11" * 32, "salt-salt-salt-salt-1",
    )
    assert got == expected
    assert got == "0x" + KNOWN_VECTOR


KNOWN_VECTOR = "2a94e8326517938b04057a731816750e0d86441a6b27013f38d7e3b4b4414653"
