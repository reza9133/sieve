"""Validator screening: verdicts, malformed output, evidence faults and budgets."""

import json

import pytest

from tests.direct.support import (
    BOND, COMMIT_BY, NOW_TS, PROMPT_HEAD, REQ_URL, REQUIREMENTS, REVEAL_BY, REVIEW_BY, TENDER_ID,
    Spec, addr, analysis, at, bid_of, check_books, credit, deploy, digest, finalize,
    open_tender, run_to_screening, screen, serve, tender_of,
)

PRICE = 2 * 10**15


def _setup(direct_vm, direct_deploy, actors, **spec_kwargs):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("solo", actors[1], PRICE, **spec_kwargs)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    return contract, spec


def test_compliant_verdict_is_recorded_with_its_evidence(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "compliant"
    assert bid["confidence"] == 92
    assert bid["failed_mask"] == 0
    assert bid["instruction_attempt"] == "no"
    assert bid["attempts"] == 1
    assert bid["review_calls"] == 1
    assert bid["rationale"].startswith("Each mandatory requirement")


def test_noncompliant_records_exactly_the_failed_requirements(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict="noncompliant_r1_r3")
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "noncompliant"
    assert bid["failed_mask"] == 0b101


def test_a_bidder_may_request_screening_of_their_own_bid(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    screen(contract, direct_vm, actors[0], spec, caller=spec.who)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_a_rival_bidder_cannot_request_screening_of_another_bid(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    mine = Spec("mine", actors[1], PRICE)
    rival = Spec("rival", actors[2], PRICE + 1)
    run_to_screening(contract, direct_vm, actors[0], [mine, rival])
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], mine, caller=rival.who)
    assert bid_of(contract, actors[0], mine)["status"] == "revealed"
    assert bid_of(contract, actors[0], mine)["review_calls"] == 0


def test_strangers_and_unrevealed_bidders_cannot_request_screening(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    shown = Spec("shown", actors[1], PRICE)
    hidden = Spec("hidden", actors[2], PRICE)
    open_tender(contract, direct_vm, actors[0])
    direct_vm.warp(at(NOW_TS + 60))
    from tests.direct.support import commit, reveal
    commit(contract, direct_vm, actors[0], shown)
    commit(contract, direct_vm, actors[0], hidden)
    direct_vm.warp(at(COMMIT_BY))
    reveal(contract, direct_vm, actors[0], shown)
    serve(direct_vm, [shown, hidden])
    direct_vm.warp(at(REVEAL_BY))
    for outsider in (actors[7], hidden.who):
        with direct_vm.expect_revert():
            screen(contract, direct_vm, actors[0], shown, caller=outsider)
    assert bid_of(contract, actors[0], shown)["review_calls"] == 0
    screen(contract, direct_vm, actors[0], shown, caller=shown.who)  # control


def test_screening_needs_a_revealed_bid(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    hidden = Spec("hidden", actors[2], PRICE)
    open_tender(contract, direct_vm, actors[0])
    direct_vm.warp(at(NOW_TS + 60))
    from tests.direct.support import commit
    commit(contract, direct_vm, actors[0], hidden)
    serve(direct_vm, [hidden])
    direct_vm.warp(at(REVEAL_BY))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], hidden)
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], Spec("nobody", actors[8], 1))


def test_screening_window_boundaries(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.warp(at(REVEAL_BY - 1))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    direct_vm.warp(at(REVIEW_BY))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    direct_vm.warp(at(REVIEW_BY - 1))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_decisive_verdict_is_final(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    screen(contract, direct_vm, actors[0], spec)
    direct_vm.clear_mocks()
    spec.verdict = "noncompliant"
    serve(direct_vm, [spec])
    direct_vm.warp(at(REVEAL_BY + 7200))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"
    assert bid_of(contract, actors[0], spec)["review_calls"] == 1


@pytest.mark.parametrize("name", ["unclear", "low_confidence"])
def test_inconclusive_output_is_not_decisive_and_enforces_a_cooldown(
    direct_vm, direct_deploy, actors, name
):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict=name)
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "revealed"
    assert bid["attempts"] == 1
    assert bid["retry_at"] == REVEAL_BY + 60
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)  # cooldown still active
    direct_vm.warp(at(REVEAL_BY + 60))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["attempts"] == 2


def test_a_later_decisive_verdict_can_follow_an_inconclusive_one(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict="unclear")
    screen(contract, direct_vm, actors[0], spec)
    direct_vm.clear_mocks()
    spec.verdict = "compliant"
    serve(direct_vm, [spec])
    direct_vm.warp(at(REVEAL_BY + 60))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_three_inconclusive_assessments_exhaust_the_semantic_budget(
    direct_vm, direct_deploy, actors
):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict="unclear")
    moment = REVEAL_BY
    for expected in (1, 2, 3):
        direct_vm.warp(at(moment))
        screen(contract, direct_vm, actors[0], spec)
        assert bid_of(contract, actors[0], spec)["attempts"] == expected
        moment = bid_of(contract, actors[0], spec)["retry_at"]
    direct_vm.warp(at(moment + 100_000))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["review_calls"] == 3
    # An exhausted bid no longer blocks finalization, and its bond is refunded.
    finalize(contract, direct_vm, actors[5], actors[0])
    assert bid_of(contract, actors[0], spec)["outcome"] == "unscreened_bond_refunded"
    assert credit(contract, spec.who) == BOND
    assert tender_of(contract, actors[0])["winner"] == ""


def test_cooldown_doubles_up_to_its_cap_and_call_budget_is_eight(
    direct_vm, direct_deploy, actors
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(spec.url, {"status": 503, "body": b"down"})
    moment = REVEAL_BY
    delays = []
    for _ in range(8):
        direct_vm.warp(at(moment))
        screen(contract, direct_vm, actors[0], spec)
        retry_at = bid_of(contract, actors[0], spec)["retry_at"]
        delays.append(retry_at - moment)
        moment = retry_at
    assert delays == [60, 120, 240, 480, 960, 1920, 3600, 3600]
    direct_vm.warp(at(moment))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["review_calls"] == 8
    assert bid_of(contract, actors[0], spec)["attempts"] == 0


@pytest.mark.parametrize("name,payload", [
    ("missing_key", {k: v for k, v in analysis().items() if k != "rationale"}),
    ("extra_key", {**analysis(), "approve": True}),
    ("short_list", analysis(("met", "met"))),
    ("long_list", analysis(("met", "met", "met", "met"))),
    ("bad_item", analysis(("met", "yes", "met"))),
    ("nonstring_item", {**analysis(), "requirements": ["met", 1, "met"]}),
    ("list_is_string", {**analysis(), "requirements": "met,met,met"}),
    ("bad_attempt", analysis(attempt="maybe")),
    ("bool_confidence", {**analysis(), "confidence": True}),
    ("float_confidence", {**analysis(), "confidence": 90.5}),
    ("string_confidence", {**analysis(), "confidence": "95"}),
    ("confidence_over_100", analysis(confidence=101)),
    ("negative_confidence", analysis(confidence=-1)),
    ("rationale_not_text", {**analysis(), "rationale": 7}),
    ("not_an_object", ["met", "met", "met"]),
])
def test_malformed_model_output_never_decides_anything(
    direct_vm, direct_deploy, actors, name, payload
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.clear_mocks()
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    direct_vm.mock_llm(PROMPT_HEAD, json.dumps(payload))
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "revealed"
    assert bid["attempts"] == 0
    assert bid["reason"] == "malformed_or_unavailable_model_output"
    assert bid["review_calls"] == 1


def test_non_json_model_output_is_a_retryable_failure(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.clear_mocks()
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    direct_vm.mock_llm(PROMPT_HEAD, "I approve this bid.")
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"
    assert bid_of(contract, actors[0], spec)["attempts"] == 0


def test_model_outage_is_a_retryable_failure(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.clear_mocks()
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})  # no llm mock at all
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"
    assert bid_of(contract, actors[0], spec)["reason"] == "malformed_or_unavailable_model_output"


def test_confidence_threshold_is_inclusive_at_eighty(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict=analysis(confidence=80))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_low_confidence_noncompliance_is_not_decisive(direct_vm, direct_deploy, actors):
    contract, spec = _setup(
        direct_vm, direct_deploy, actors,
        verdict=analysis(("met", "not_met", "met"), confidence=79),
    )
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"


def test_instruction_attempt_excludes_the_bid_even_if_every_requirement_is_met(
    direct_vm, direct_deploy, actors
):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict="injection")
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "noncompliant"
    assert bid["instruction_attempt"] == "yes"
    assert bid["failed_mask"] == 0


def test_unclear_instruction_attempt_never_counts_as_compliant(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors, verdict=analysis(attempt="unclear"))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"


def test_model_labels_are_case_and_whitespace_normalised(direct_vm, direct_deploy, actors):
    contract, spec = _setup(
        direct_vm, direct_deploy, actors,
        verdict={**analysis(), "requirements": [" MET", "Met ", "met"],
                 "reviewer_instruction_attempt": " No "},
    )
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_overlong_rationale_is_truncated_not_rejected(direct_vm, direct_deploy, actors):
    contract, spec = _setup(
        direct_vm, direct_deploy, actors, verdict=analysis(rationale="word " * 200),
    )
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "compliant"
    assert len(bid["rationale"]) <= 300


# --------------------------------------------------------------------------- evidence


@pytest.mark.parametrize("status", [403, 404, 408, 410, 418, 425, 429, 451, 500, 503, 301, 302, 308])
def test_requirements_availability_problems_never_penalise_the_bidder(
    direct_vm, direct_deploy, actors, status
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(REQ_URL, {"status": status, "body": b"nope"})
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "revealed"
    assert bid["reason"] == "requirements_source_unavailable"


@pytest.mark.parametrize("name,response,reason", [
    ("hash_mismatch", {"status": 200, "body": REQUIREMENTS + b" edited"}, "requirements_hash_mismatch"),
    ("empty", {"status": 200, "body": b""}, "requirements_empty_artifact"),
    ("forbidden", {"status": 403, "body": b"no"}, "requirements_source_unavailable"),
    ("too_large", {"status": 200, "body": b"x" * 30_001}, "requirements_artifact_too_large"),
])
def test_funder_side_evidence_faults_are_retryable_and_not_the_bidders_fault(
    direct_vm, direct_deploy, actors, name, response, reason
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(REQ_URL, response)
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "revealed"
    assert bid["reason"] == reason


def test_requirements_that_are_not_utf8_are_not_the_bidders_fault(direct_vm, direct_deploy, actors):
    bad = b"\xff\xfe\x00R1 broken"
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("solo", actors[1], PRICE)
    run_to_screening(contract, direct_vm, actors[0], [spec], req_hash=digest(bad))
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": bad})
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"
    assert bid_of(contract, actors[0], spec)["reason"] == "requirements_invalid_utf8"


def test_a_funder_who_swaps_the_requirements_cannot_disqualify_or_forfeit_anyone(
    direct_vm, direct_deploy, actors
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": b"R1: new secret rule. R2: x. R3: y."})
    moment = REVEAL_BY
    for _ in range(8):
        direct_vm.warp(at(moment))
        screen(contract, direct_vm, actors[0], spec)
        moment = bid_of(contract, actors[0], spec)["retry_at"]
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"
    direct_vm.warp(at(REVIEW_BY))
    finalize(contract, direct_vm, actors[0], actors[0])
    assert credit(contract, spec.who) == BOND
    assert tender_of(contract, actors[0])["forfeited_wei"] == 0
    assert credit(contract, actors[0]) == 3 * 10**15


@pytest.mark.parametrize("status", [404, 408, 410, 425, 429, 502, 307])
def test_proposal_availability_problems_are_retryable_not_final(
    direct_vm, direct_deploy, actors, status
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(spec.url, {"status": status, "body": b"later"})
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "revealed"
    assert bid["reason"] == "proposal_unavailable"
    # Once the host recovers the same bid can still be screened.
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    direct_vm.warp(at(REVEAL_BY + 60))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


@pytest.mark.parametrize("name,response,reason", [
    ("hash_mismatch", {"status": 200, "body": b"PROPOSAL-SOLO: swapped bytes"}, "hash_mismatch"),
    ("empty", {"status": 200, "body": b""}, "empty_artifact"),
    ("too_large", {"status": 200, "body": b"x" * 30_001}, "artifact_too_large"),
])
def test_a_proposal_that_cannot_match_its_commitment_is_disqualified_for_good(
    direct_vm, direct_deploy, actors, name, response, reason
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(spec.url, response)
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "disqualified"
    assert bid["reason"] == "proposal:" + reason
    # Final: fixing the host afterwards does not resurrect it.
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    direct_vm.warp(at(REVEAL_BY + 60))
    with direct_vm.expect_revert():
        screen(contract, direct_vm, actors[0], spec)
    finalize(contract, direct_vm, actors[5], actors[0])
    assert bid_of(contract, actors[0], spec)["outcome"] == "disqualified_bond_forfeited"
    assert credit(contract, spec.who) == 0
    assert credit(contract, actors[0]) == 3 * 10**15 + BOND


def test_proposal_that_is_not_utf8_is_disqualified(direct_vm, direct_deploy, actors):
    bad = b"\xff\xfe\xfdPROPOSAL-BINARY"
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("binary", actors[1], PRICE, content=bad)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["reason"] == "proposal:invalid_utf8"
    assert bid_of(contract, actors[0], spec)["status"] == "disqualified"


def test_whitespace_only_proposal_is_disqualified_as_empty(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("blank", actors[1], PRICE, content=b" \n\t \n")
    run_to_screening(contract, direct_vm, actors[0], [spec])
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["reason"] == "proposal:empty_artifact"


def test_oversized_proposal_is_disqualified(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("huge", actors[1], PRICE, content=b"PROPOSAL-HUGE " + b"x" * 30_000)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["reason"] == "proposal:artifact_too_large"


def test_proposal_at_exactly_the_size_limit_is_accepted(direct_vm, direct_deploy, actors):
    body = b"PROPOSAL-EDGE " + b"x" * (30_000 - len(b"PROPOSAL-EDGE "))
    assert len(body) == 30_000
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("edge", actors[1], PRICE, content=body)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_requirements_problem_is_reported_before_a_proposal_problem(
    direct_vm, direct_deploy, actors
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(REQ_URL, {"status": 503, "body": b"down"})
    direct_vm.mock_web(spec.url, {"status": 200, "body": b"tampered"})
    screen(contract, direct_vm, actors[0], spec)
    # Not disqualified: the funder's evidence is judged first.
    assert bid_of(contract, actors[0], spec)["status"] == "revealed"
    assert bid_of(contract, actors[0], spec)["reason"] == "requirements_source_unavailable"


def test_missing_web_mock_is_an_unavailable_source(direct_vm, direct_deploy, actors):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.clear_mocks()
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["reason"] == "proposal_unavailable"


def test_each_bid_has_its_own_budget_and_cooldown(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    slow = Spec("slow", actors[1], PRICE, verdict="unclear")
    fast = Spec("fast", actors[2], PRICE + 5)
    run_to_screening(contract, direct_vm, actors[0], [slow, fast])
    screen(contract, direct_vm, actors[0], slow)
    screen(contract, direct_vm, actors[0], fast)  # slow's cooldown does not apply here
    assert bid_of(contract, actors[0], slow)["status"] == "revealed"
    assert bid_of(contract, actors[0], fast)["status"] == "compliant"
    check_books(contract, actors, [(actors[0], TENDER_ID)])


@pytest.mark.parametrize("status", [401, 403, 418, 451])
def test_a_refusing_proposal_host_is_retryable_not_a_forfeiture(
    direct_vm, direct_deploy, actors, status
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(spec.url, {"status": status, "body": b"no"})
    screen(contract, direct_vm, actors[0], spec)
    bid = bid_of(contract, actors[0], spec)
    assert bid["status"] == "revealed"
    assert bid["reason"] == "proposal_unavailable"
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    direct_vm.warp(at(REVEAL_BY + 60))
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"


def test_funder_document_faults_never_consume_a_bids_review_budget(
    direct_vm, direct_deploy, actors
):
    contract, spec = _setup(direct_vm, direct_deploy, actors)
    direct_vm.mock_web(REQ_URL, {"status": 503, "body": b"down"})
    when = REVEAL_BY
    for _ in range(12):
        screen(contract, direct_vm, actors[0], spec)
        when += 61
        direct_vm.warp(at(when))
    bid = bid_of(contract, actors[0], spec)
    assert bid["review_calls"] == 0
    assert bid["status"] == "revealed"
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    screen(contract, direct_vm, actors[0], spec)
    assert bid_of(contract, actors[0], spec)["status"] == "compliant"
