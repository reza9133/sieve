"""Seeded stateful fuzzing: random hostile call sequences must never break the books."""

import random

import pytest

from tests.direct.support import (
    BOND, BUDGET, COMMIT_BY, NOW_TS, REVEAL_BY, REVIEW_BY, Spec, addr, at, check_books,
    credit, deploy, deposit, open_tender, serve,
)

SEEDS = list(range(12))
STEPS = 70


def _try(direct_vm, call):
    """Run a call that may legitimately revert; return True when it succeeded.

    Reverts are absorbed by expect_revert. Any other exception escaping the call
    is a genuine bug and is re-raised instead of being swallowed.
    """
    succeeded = False

    def wrapped():
        nonlocal succeeded
        call()
        succeeded = True

    try:
        with direct_vm.expect_revert():
            wrapped()
    except Exception:
        if not succeeded:
            raise
    return succeeded


@pytest.mark.parametrize("seed", SEEDS)
def test_random_call_sequences_conserve_value_and_keep_books_consistent(
    direct_vm, direct_deploy, actors, seed
):
    rng = random.Random(seed)
    contract = deploy(direct_vm, direct_deploy)
    funders = actors[:2]
    bidders = actors[2:8]
    everyone = actors[:10]
    tenders = [(funders[0], "F0"), (funders[1], "F1")]
    for funder, tid in tenders:
        open_tender(contract, direct_vm, funder, tid, max_bids=4)
    deposited = 2 * BUDGET
    withdrawn = 0
    specs = {}
    for who in bidders:
        for _, tid in tenders:
            specs[(who, tid)] = Spec(
                f"s{bidders.index(who)}{tid.lower()}", who,
                rng.choice([10**15, 2 * 10**15, 3 * 10**15, 1, BUDGET]),
                verdict=rng.choice(["compliant", "compliant", "noncompliant", "injection", "unclear"]),
            )
    clock = NOW_TS + 1
    now_marks = [COMMIT_BY - 1, COMMIT_BY, REVEAL_BY - 1, REVEAL_BY, REVEAL_BY + 600, REVIEW_BY - 1, REVIEW_BY]

    for _ in range(STEPS):
        if rng.random() < 0.18:
            candidates = [m for m in now_marks if m >= clock]
            if candidates:
                clock = rng.choice(candidates[:3])
        direct_vm.warp(at(clock))
        funder, tid = rng.choice(tenders)
        who = rng.choice(bidders)
        spec = specs[(who, tid)]
        action = rng.choice(["deposit", "commit", "reveal", "withdraw_bid", "review", "finalize",
                             "withdraw_credit", "cancel", "serve"])
        direct_vm.sender = who
        if action == "deposit":
            amount = rng.choice([BOND, 2 * BOND, 5])
            deposit(contract, direct_vm, who, amount)
            deposited += amount
        elif action == "commit":
            direct_vm.sender = who
            _try(direct_vm, lambda: contract.commit_bid(addr(funder), tid, spec.seal(funder, tid)))
        elif action == "reveal":
            direct_vm.sender = who
            _try(direct_vm, lambda: contract.reveal_bid(
                addr(funder), tid, spec.price, spec.url, spec.committed_hash, spec.salt))
        elif action == "withdraw_bid":
            direct_vm.sender = who
            _try(direct_vm, lambda: contract.withdraw_bid(addr(funder), tid))
        elif action == "review":
            direct_vm.sender = rng.choice([funder, who])
            _try(direct_vm, lambda: contract.review_bid(addr(funder), tid, addr(who)))
        elif action == "finalize":
            direct_vm.sender = rng.choice(everyone)
            _try(direct_vm, lambda: contract.finalize_tender(addr(funder), tid))
        elif action == "withdraw_credit":
            owner = rng.choice(everyone)
            before = credit(contract, owner)
            direct_vm.sender = owner
            if _try(direct_vm, lambda: contract.withdraw_credit()):
                withdrawn += before
        elif action == "cancel":
            direct_vm.sender = funder
            _try(direct_vm, lambda: contract.cancel_tender(tid))
        elif action == "serve":
            serve(direct_vm, list(specs.values()))
        accounting = check_books(contract, everyone, tenders)
        assert accounting["accounted_liabilities"] == deposited - withdrawn, (
            f"value must be conserved (seed {seed}, action {action})"
        )
