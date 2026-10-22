"""Equivalence rules: what a validator must reproduce to agree with the leader."""

import json

import pytest

from tests.direct.support import (
    PROMPT_HEAD, REQ_URL, REQUIREMENTS, Spec, analysis, run_to_screening, screen, deploy,
)

PRICE = 2 * 10**15


def _leader(direct_vm, direct_deploy, actors, leader_verdict):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("subject", actors[1], PRICE, verdict=leader_verdict)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    screen(contract, direct_vm, actors[0], spec)
    return contract, spec


def _validator_sees(direct_vm, spec, verdict, web=None):
    direct_vm.clear_mocks()
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    for url, response in (web or {}).items():
        direct_vm.mock_web(url, response)
    if verdict is not None:
        direct_vm.mock_llm(PROMPT_HEAD, json.dumps(verdict))


def test_same_compliant_verdict_with_different_prose_and_confidence_agrees(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "compliant")
    _validator_sees(direct_vm, spec, analysis(confidence=81, rationale="All three satisfied."))
    assert direct_vm.run_validator() is True


@pytest.mark.parametrize("name,verdict", [
    ("noncompliant", analysis(("met", "not_met", "met"))),
    ("injection", analysis(attempt="yes")),
    ("inconclusive_unclear", analysis(("met", "unclear", "met"))),
    ("inconclusive_low_confidence", analysis(confidence=60)),
])
def test_compliant_leader_is_not_confirmed_by_any_other_outcome(
    direct_vm, direct_deploy, actors, name, verdict
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "compliant")
    _validator_sees(direct_vm, spec, verdict)
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize("name,verdict", [
    ("compliant", analysis()),
    ("inconclusive", analysis(("met", "unclear", "met"))),
    ("different_failed_requirement", analysis(("not_met", "met", "met"))),
    ("extra_failed_requirement", analysis(("met", "not_met", "not_met"))),
    ("injection_instead", analysis(attempt="yes")),
])
def test_noncompliant_leader_needs_the_same_definitive_findings(
    direct_vm, direct_deploy, actors, name, verdict
):
    _, spec = _leader(direct_vm, direct_deploy, actors, analysis(("met", "not_met", "met")))
    _validator_sees(direct_vm, spec, verdict)
    assert direct_vm.run_validator() is False


def test_noncompliant_leader_is_confirmed_by_the_same_findings_even_if_unclear_items_differ(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, analysis(("met", "not_met", "met")))
    _validator_sees(direct_vm, spec, analysis(("unclear", "not_met", "met"), confidence=99,
                                              rationale="R2 is contradicted."))
    assert direct_vm.run_validator() is True


def test_instruction_attempt_leader_is_confirmed_by_the_same_flag(direct_vm, direct_deploy, actors):
    _, spec = _leader(direct_vm, direct_deploy, actors, "injection")
    _validator_sees(direct_vm, spec, analysis(attempt="yes", rationale="Tries to steer the reviewer."))
    assert direct_vm.run_validator() is True


def test_inconclusive_leader_agrees_with_any_inconclusive_validator(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "unclear")
    _validator_sees(direct_vm, spec, analysis(confidence=50))
    assert direct_vm.run_validator() is True


def test_inconclusive_leader_never_agrees_with_a_decisive_validator(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "unclear")
    _validator_sees(direct_vm, spec, analysis())
    assert direct_vm.run_validator() is False


def test_validator_rejects_a_valid_analysis_when_it_cannot_reach_the_proposal(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "compliant")
    _validator_sees(direct_vm, spec, analysis(), web={spec.url: {"status": 503, "body": b""}})
    assert direct_vm.run_validator() is False


def test_validator_rejects_a_valid_analysis_when_the_proposal_hash_differs(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "compliant")
    _validator_sees(direct_vm, spec, analysis(), web={spec.url: {"status": 200, "body": b"other"}})
    assert direct_vm.run_validator() is False


def test_validator_rejects_a_leader_analysis_when_the_model_returns_garbage(
    direct_vm, direct_deploy, actors
):
    _, spec = _leader(direct_vm, direct_deploy, actors, "compliant")
    direct_vm.clear_mocks()
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": REQUIREMENTS})
    direct_vm.mock_web(spec.url, {"status": 200, "body": spec.content})
    direct_vm.mock_llm(PROMPT_HEAD, "not json at all")
    assert direct_vm.run_validator() is False


def test_leader_unavailability_failure_is_only_confirmed_by_another_failure(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("subject", actors[1], PRICE)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    direct_vm.mock_web(spec.url, {"status": 503, "body": b"down"})
    screen(contract, direct_vm, actors[0], spec)
    # A validator that can read the proposal and gets an analysis disagrees.
    _validator_sees(direct_vm, spec, analysis())
    assert direct_vm.run_validator() is False
    # A validator that is also blocked agrees that nothing can be decided.
    _validator_sees(direct_vm, spec, analysis(), web={spec.url: {"status": 503, "body": b""}})
    assert direct_vm.run_validator() is True


def test_leader_disqualification_needs_the_same_evidence_reason(direct_vm, direct_deploy, actors):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("subject", actors[1], PRICE)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    direct_vm.mock_web(spec.url, {"status": 200, "body": b"mismatching bytes"})
    screen(contract, direct_vm, actors[0], spec)
    assert contract.get_bid(
        "0x" + actors[0].hex(), "T-001", "0x" + actors[1].hex())["status"] == "disqualified"
    _validator_sees(direct_vm, spec, analysis(), web={spec.url: {"status": 200, "body": b"mismatching bytes"}})
    assert direct_vm.run_validator() is True
    _validator_sees(direct_vm, spec, analysis(), web={spec.url: {"status": 200, "body": b""}})
    assert direct_vm.run_validator() is False  # empty body is a different fault
    _validator_sees(direct_vm, spec, analysis())  # validator sees the genuine proposal
    assert direct_vm.run_validator() is False


def test_a_funder_side_failure_cannot_be_confirmed_as_a_bidder_fault(
    direct_vm, direct_deploy, actors
):
    contract = deploy(direct_vm, direct_deploy)
    spec = Spec("subject", actors[1], PRICE)
    run_to_screening(contract, direct_vm, actors[0], [spec])
    direct_vm.mock_web(REQ_URL, {"status": 200, "body": b"swapped requirements"})
    screen(contract, direct_vm, actors[0], spec)
    assert contract.get_bid(
        "0x" + actors[0].hex(), "T-001", "0x" + actors[1].hex())["status"] == "revealed"
    # A validator that independently sees a disqualifying proposal fault must not agree
    # with a leader that saw only a requirements fault.
    _validator_sees(direct_vm, spec, analysis(),
                    web={spec.url: {"status": 200, "body": b"mismatching bytes"}})
    assert direct_vm.run_validator() is False
