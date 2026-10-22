"""Finalization timing, unresolved bids and accounting after settlement."""

import pytest

from tests.direct.support import (
    BOND, BUDGET, COMMIT_BY, NOW_TS, REVEAL_BY, REVIEW_BY, TENDER_ID, Spec, addr, at, bid_of,
    check_books, commit, credit, deploy, deposit, finalize, open_tender, reveal, run_to_screening,
    screen, serve, tender_of,
)

PRICE = 2 * 10**15


def test_finalize_before_the_reveal_deadline_reverts(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    for moment in (NOW_TS + 1, COMMIT_BY, REVEAL_BY - 1):
        direct_vm.warp(at(moment))
        with direct_vm.expect_revert():
            finalize(contract, direct_vm, actors[0], actors[0])
    assert tender_of(contract, actors[0])["status"] == "open"
    direct_vm.warp(at(REVEAL_BY))
    finalize(contract, direct_vm, actors[0], actors[0])  # control


def test_finalize_waits_for_unscreened_bids_until_the_review_deadline(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("slow", actors[1], PRICE)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    with direct_vm.expect_revert():
        finalize(contract, direct_vm, actors[3], actors[0])
    direct_vm.warp(at(REVIEW_BY - 1))
    with direct_vm.expect_revert():
        finalize(contract, direct_vm, actors[3], actors[0])
    direct_vm.warp(at(REVIEW_BY))
    finalize(contract, direct_vm, actors[3], actors[0])
    assert bid_of(contract, actors[0], spec)["outcome"] == "unscreened_bond_refunded"
    assert credit(contract, spec.who) == BOND
    assert credit(contract, actors[0]) == BUDGET
    check_books(contract, actors, [(actors[0], TENDER_ID)])


def test_one_unscreened_rival_cannot_stop_the_others_from_being_screened(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    good = Spec("good", actors[1], PRICE)
    lazy = Spec("lazy", actors[2], PRICE - 1)
    run_to_screening(contract, direct_vm, actors[0], [good, lazy])
    screen(contract, direct_vm, actors[0], good)
    direct_vm.warp(at(REVIEW_BY))
    finalize(contract, direct_vm, actors[0], actors[0])
    # The cheaper bid was never screened, so it is excluded rather than assumed fine.
    assert tender_of(contract, actors[0])["winner"].lower() == addr(good.who)
    assert bid_of(contract, actors[0], lazy)["outcome"] == "unscreened_bond_refunded"


def test_finalize_twice_and_actions_after_finalize_revert(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("only", actors[1], PRICE)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    screen(contract, direct_vm, actors[0], spec)
    finalize(contract, direct_vm, actors[0], actors[0])
    late = Spec("late", actors[4], 1)
    deposit(contract, direct_vm, late.who, BOND)  # a real bond, so only timing can reject it
    snapshot = (credit(contract, actors[0]), credit(contract, spec.who),
                contract.get_accounting()["total_credits"])
    with direct_vm.expect_revert():
        finalize(contract, direct_vm, actors[0], actors[0])
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    with direct_vm.expect_revert():
        direct_vm.sender = actors[0]
        contract.cancel_tender(TENDER_ID)
    direct_vm.warp(at(COMMIT_BY - 10))
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], late, topup=False)
    assert snapshot == (credit(contract, actors[0]), credit(contract, spec.who),
                        contract.get_accounting()["total_credits"])


def test_finalized_tender_cannot_be_cancelled_even_without_bids(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    direct_vm.warp(at(REVEAL_BY))
    finalize(contract, direct_vm, actors[0], actors[0])
    direct_vm.sender = actors[0]
    with direct_vm.expect_revert():
        contract.cancel_tender(TENDER_ID)
    assert credit(contract, actors[0]) == BUDGET


def test_cancel_is_blocked_by_any_bid_even_a_withdrawn_one(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    direct_vm.warp(at(NOW_TS + 60))
    spec = Spec("blocker", actors[1], PRICE)
    commit(contract, direct_vm, actors[0], spec)
    direct_vm.sender = actors[0]
    with direct_vm.expect_revert():
        contract.cancel_tender(TENDER_ID)
    direct_vm.sender = spec.who
    contract.withdraw_bid(addr(actors[0]), TENDER_ID)
    direct_vm.sender = actors[0]
    with direct_vm.expect_revert():
        contract.cancel_tender(TENDER_ID)
    assert tender_of(contract, actors[0])["status"] == "open"


def test_cancelled_tender_rejects_bids_and_finalization(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    open_tender(contract, direct_vm, actors[0])
    direct_vm.sender = actors[0]
    contract.cancel_tender(TENDER_ID)
    direct_vm.warp(at(NOW_TS + 60))
    with direct_vm.expect_revert():
        commit(contract, direct_vm, actors[0], Spec("x", actors[1], 10**15))
    direct_vm.warp(at(REVEAL_BY))
    with direct_vm.expect_revert():
        finalize(contract, direct_vm, actors[0], actors[0])
    assert credit(contract, actors[0]) == BUDGET


def test_every_settlement_leg_is_credit_and_withdrawable_exactly_once(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    winner = Spec("winner", actors[1], PRICE)
    loser = Spec("loser", actors[2], PRICE + 1)
    run_to_screening(contract, direct_vm, actors[0], [winner, loser])
    screen(contract, direct_vm, actors[0], winner)
    screen(contract, direct_vm, actors[0], loser)
    finalize(contract, direct_vm, actors[0], actors[0])
    expected = {
        winner.who: PRICE + BOND,
        loser.who: BOND,
        actors[0]: BUDGET - PRICE,
    }
    for who, amount in expected.items():
        assert credit(contract, who) == amount
    for who, amount in expected.items():
        direct_vm.sender = who
        contract.withdraw_credit()
        assert credit(contract, who) == 0
        with direct_vm.expect_revert():
            contract.withdraw_credit()
    assert contract.get_accounting()["total_credits"] == 0
    assert contract.get_accounting()["accounted_liabilities"] == 0


def test_books_balance_at_every_phase_of_a_busy_tender(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    funder = actors[0]
    specs = [
        Spec("a", actors[1], 2 * 10**15), Spec("b", actors[2], 15 * 10**14),
        Spec("c", actors[3], 10**15, verdict="noncompliant"),
        Spec("d", actors[4], 5 * 10**14, verdict="injection"),
        Spec("e", actors[5], 4 * 10**14),  # never revealed
    ]
    tenders = [(funder, TENDER_ID)]
    open_tender(contract, direct_vm, funder)
    check_books(contract, actors, tenders)
    direct_vm.warp(at(NOW_TS + 60))
    for spec in specs:
        commit(contract, direct_vm, funder, spec)
        check_books(contract, actors, tenders)
    direct_vm.warp(at(COMMIT_BY))
    for spec in specs[:4]:
        reveal(contract, direct_vm, funder, spec)
        check_books(contract, actors, tenders)
    serve(direct_vm, specs)
    direct_vm.warp(at(REVEAL_BY))
    for spec in specs[:4]:
        screen(contract, direct_vm, funder, spec)
        check_books(contract, actors, tenders)
    finalize(contract, direct_vm, actors[9], funder)
    accounting = check_books(contract, actors, tenders)
    assert accounting["total_locked_budgets"] == 0 and accounting["total_locked_bonds"] == 0
    assert tender_of(contract, funder)["winner"].lower() == addr(specs[1].who)
    # 5 bonds + budget in, all of it now sits in credits.
    assert accounting["total_credits"] == BUDGET + 5 * BOND
    assert tender_of(contract, funder)["forfeited_wei"] == BOND


def test_two_tenders_settle_independently(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    funder_a, funder_b = actors[0], actors[1]
    first = Spec("first", actors[2], PRICE)
    second = Spec("second", actors[2], PRICE // 2)
    tenders = [(funder_a, "A"), (funder_b, "B")]
    open_tender(contract, direct_vm, funder_a, "A")
    open_tender(contract, direct_vm, funder_b, "B")
    direct_vm.warp(at(NOW_TS + 60))
    commit(contract, direct_vm, funder_a, first, "A")
    commit(contract, direct_vm, funder_b, second, "B")
    check_books(contract, actors, tenders)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, funder_a, first, "A")
    reveal(contract, direct_vm, funder_b, second, "B")
    first.url = first.url  # distinct URLs already per spec name
    serve(direct_vm, [first, second])
    direct_vm.warp(at(REVEAL_BY))
    screen(contract, direct_vm, funder_a, first, tender_id="A")
    finalize(contract, direct_vm, funder_a, funder_a, "A")
    assert tender_of(contract, funder_b, "B")["status"] == "open"
    check_books(contract, actors, tenders)
    screen(contract, direct_vm, funder_b, second, tender_id="B")
    finalize(contract, direct_vm, funder_b, funder_b, "B")
    check_books(contract, actors, tenders)
    assert credit(contract, actors[2]) == PRICE + BOND + PRICE // 2 + BOND


def test_ranking_view_orders_by_price_then_commit_index(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    specs = [Spec("x", actors[1], 3 * 10**15), Spec("y", actors[2], 10**15),
             Spec("z", actors[3], 10**15), Spec("w", actors[4], 2 * 10**15, verdict="noncompliant")]
    run_to_screening(contract, direct_vm, actors[0], specs)
    assert contract.get_ranking(addr(actors[0]), TENDER_ID)["entries"] == []
    for spec in specs:
        screen(contract, direct_vm, actors[0], spec)
    ranking = contract.get_ranking(addr(actors[0]), TENDER_ID)["entries"]
    assert [(entry["bidder"].lower(), entry["index"]) for entry in ranking] == [
        (addr(actors[2]), 1), (addr(actors[3]), 2), (addr(actors[1]), 0),
    ]
    finalize(contract, direct_vm, actors[0], actors[0])
    assert tender_of(contract, actors[0])["winner"].lower() == addr(actors[2])


def test_sixteen_bids_settle_in_one_transaction(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    specs = [Spec(f"s{n}", actors[1 + n], 2 * 10**15 + (n * 7) % 11) for n in range(16)]
    run_to_screening(contract, direct_vm, actors[0], specs, max_bids=16)
    for spec in specs:
        screen(contract, direct_vm, actors[0], spec)
    finalize(contract, direct_vm, actors[0], actors[0])
    lowest = min(specs, key=lambda s: (s.price, specs.index(s)))
    assert tender_of(contract, actors[0])["winner"].lower() == addr(lowest.who)
    accounting = check_books(contract, actors + [], [(actors[0], TENDER_ID)])
    assert accounting["total_credits"] == BUDGET + 16 * BOND


@pytest.mark.parametrize("name", ["bond_equals_budget"])
def test_bond_may_equal_the_budget(direct_vm, direct_deploy, actors, name):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("big", actors[1], PRICE)
    open_tender(contract, direct_vm, actors[0], bond=BUDGET)
    direct_vm.warp(at(NOW_TS + 60))
    commit(contract, direct_vm, actors[0], spec, bond=BUDGET)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, actors[0], spec)
    serve(direct_vm, [spec])
    direct_vm.warp(at(REVEAL_BY))
    screen(contract, direct_vm, actors[0], spec)
    finalize(contract, direct_vm, actors[0], actors[0])
    assert credit(contract, spec.who) == BUDGET + PRICE
