#!/usr/bin/env python3
"""End-to-end live test of Sieve on GenLayer Studionet, with a written report.

Run it from a GitHub Codespace (or any machine with internet access):

    python scripts/live_e2e.py --address 0xCDb477B28fA35CcBf96129270af88305c8d2C8e1

It drives one complete tender through the real network with real validators and a real
LLM: sealed commitments, reveals, validator screening of five bids (one compliant and
cheapest, one non-compliant, one prompt-injection attempt, one whose hosted bytes do not
match its commitment), a bidder who never reveals, finalization, and native-GEN
withdrawals. Everything it asserts is read back from the contract, not inferred from
transaction receipts. A Markdown and JSON report is written to ./reports/.

The fixture documents under fixtures/live/ must be reachable over public HTTPS because
the validators fetch them. The script derives commit-pinned raw.githubusercontent.com
URLs from the current git checkout, verifies that each one serves exactly the local
bytes, and refuses to start otherwise.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.sieve_tools import commitment as make_commitment  # noqa: E402
from scripts.sieve_tools import new_salt, sha256_hex  # noqa: E402

CONTRACT_PATH = ROOT / "contracts" / "sieve.py"
FIXTURE_DIR = ROOT / "fixtures" / "live"
REPORT_DIR = ROOT / "reports"
STATE_DIR = ROOT / ".live"
EXPLORER_TX = "https://explorer-studio.genlayer.com/tx/"
EXPLORER_ADDRESS = "https://explorer-studio.genlayer.com/address/"
DEFAULT_RPC = "https://studio.genlayer.com/api"
GEN = 10**18

BUDGET = 3_000_000_000_000_000          # 0.003 GEN
BOND = 300_000_000_000_000              # 0.0003 GEN
PRICES = {
    "alpha": 2_000_000_000_000_000,
    "bravo": 1_500_000_000_000_000,
    "charlie": 800_000_000_000_000,
    "delta": 100_000_000_000_000,
    "echo": 1_000_000_000_000_000,
    "foxtrot": 700_000_000_000_000,
}
BIDDERS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]
REVEALERS = ["alpha", "bravo", "charlie", "delta", "foxtrot"]  # echo never reveals
EXPECTED_STATUS = {
    "alpha": "compliant",
    "bravo": "compliant",
    "charlie": "noncompliant",
    "delta": "noncompliant",
    "foxtrot": "disqualified",
}
MIN_RPC_GAP_SECONDS = 1.2  # Studionet allows 60 requests per minute per IP


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(message: str) -> None:
    print(f"[{dt.datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)


# ---------------------------------------------------------------------------- results


@dataclass
class TxRecord:
    label: str
    account: str
    function: str
    tx_hash: str = ""
    status: str = ""
    result: str = ""
    seconds: float = 0.0
    expected: str = "success"
    note: str = ""

    @property
    def link(self) -> str:
        return EXPLORER_TX + self.tx_hash if self.tx_hash else ""

    @property
    def succeeded(self) -> bool | None:
        text = self.result.upper()
        if "FINISHED_WITH_RETURN" in text:
            return True
        if "FINISHED_WITH_ERROR" in text or "ERROR" in text:
            return False
        return None


@dataclass
class Check:
    name: str
    passed: bool
    expected: str
    observed: str
    section: str = ""


@dataclass
class Report:
    started: str = field(default_factory=utc_now)
    finished: str = ""
    environment: dict = field(default_factory=dict)
    checks: list = field(default_factory=list)
    txs: list = field(default_factory=list)
    sections: dict = field(default_factory=dict)
    fatal: str = ""

    def check(self, section: str, name: str, passed: bool, expected: Any, observed: Any) -> bool:
        record = Check(name, bool(passed), str(expected), str(observed), section)
        self.checks.append(record)
        log(("PASS " if passed else "FAIL ") + f"{section}: {name} (expected {expected}, saw {observed})")
        return bool(passed)

    @property
    def all_passed(self) -> bool:
        return not self.fatal and bool(self.checks) and all(c.passed for c in self.checks)


# -------------------------------------------------------------------------- chain access


class ChainError(RuntimeError):
    pass


class Chain:
    """What the scenario needs from a network. Real and simulated chains implement it."""

    def now(self) -> int: ...
    def sleep_until(self, timestamp: int, reason: str) -> None: ...
    def address(self, name: str) -> str: ...
    def write(self, name: str, function: str, args: list, value: int = 0,
              label: str = "", expect: str = "success") -> TxRecord: ...
    def read(self, function: str, args: list) -> Any: ...
    def balance(self, name_or_address: str) -> int: ...
    def fund(self, name: str, wei: int) -> bool: ...


class GenLayerChain(Chain):
    """Studionet through genlayer-py. Only thin, defensive wrappers live here."""

    def __init__(self, contract_address: str, state: dict, rpc_url: str | None, wait_seconds: int):
        try:
            from eth_account import Account
            from genlayer_py import create_account, create_client
            from genlayer_py.chains import studionet
        except ImportError as error:  # pragma: no cover - environment dependent
            raise ChainError(
                "genlayer-py is not installed. Run: python -m pip install -r requirements.txt"
            ) from error
        self._Account = Account
        self._create_account = create_account
        self.contract = contract_address
        self.state = state
        self.rpc_url = rpc_url or self._chain_rpc(studionet)
        self.wait_seconds = wait_seconds
        self._last_rpc = 0.0
        self.accounts: dict[str, Any] = {}
        for name in ["funder"] + BIDDERS + ["stranger"]:
            key = state["keys"].get(name)
            if key is None:
                account = create_account()
                state["keys"][name] = self._key_hex(account)
            else:
                account = Account.from_key(key)
            self.accounts[name] = account
        self.client = create_client(chain=studionet, account=self.accounts["funder"])

    @staticmethod
    def _chain_rpc(chain) -> str:
        try:
            return chain.rpc_urls["default"]["http"][0]
        except Exception:  # noqa: BLE001
            return DEFAULT_RPC

    @staticmethod
    def _key_hex(account) -> str:
        key = getattr(account, "key", None) or getattr(account, "_private_key")
        text = key.hex() if hasattr(key, "hex") else str(key)
        return text if text.startswith("0x") else "0x" + text

    def _throttle(self) -> None:
        gap = time.monotonic() - self._last_rpc
        if gap < MIN_RPC_GAP_SECONDS:
            time.sleep(MIN_RPC_GAP_SECONDS - gap)
        self._last_rpc = time.monotonic()

    def _rpc(self, method: str, params: list) -> Any:
        self._throttle()
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        request = urllib.request.Request(
            self.rpc_url, data=body, headers={"content-type": "application/json"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode())
        if "error" in payload:
            raise ChainError(f"{method}: {payload['error']}")
        return payload.get("result")

    def now(self) -> int:
        return int(time.time())

    def sleep_until(self, timestamp: int, reason: str) -> None:
        remaining = timestamp - self.now()
        if remaining > 0:
            log(f"waiting {remaining}s for {reason}")
        while True:
            remaining = timestamp - self.now()
            if remaining <= 0:
                return
            time.sleep(min(remaining, 30))

    def address(self, name: str) -> str:
        return self.accounts[name].address

    def balance(self, name_or_address: str) -> int:
        address = self.address(name_or_address) if name_or_address in self.accounts else name_or_address
        return int(self._rpc("eth_getBalance", [address, "latest"]), 16)

    def fund(self, name: str, wei: int) -> bool:
        address = self.address(name)
        for params in ([address, wei], [address, hex(wei)]):
            try:
                self._rpc("sim_fundAccount", params)
                return True
            except Exception:  # noqa: BLE001
                continue
        return False

    # ---- contract calls
    def _wait(self, tx_hash: str):
        interval_ms = 4000
        retries = max(10, int(self.wait_seconds * 1000 / interval_ms))
        try:
            return self.client.wait_for_transaction_receipt(
                transaction_hash=tx_hash, wait_until="finalized", interval=interval_ms,
                retries=retries,
            )
        except TypeError:
            from genlayer_py.types import TransactionStatus
            return self.client.wait_for_transaction_receipt(
                transaction_hash=tx_hash, status=TransactionStatus.FINALIZED,
                interval=interval_ms, retries=retries,
            )

    @staticmethod
    def _field(receipt: Any, *names: str) -> str:
        for name in names:
            value = receipt.get(name) if isinstance(receipt, dict) else getattr(receipt, name, None)
            if value not in (None, ""):
                return str(getattr(value, "name", value))
        return ""

    def write(self, name: str, function: str, args: list, value: int = 0,
              label: str = "", expect: str = "success") -> TxRecord:
        record = TxRecord(label or function, self.address(name), function, expected=expect)
        started = time.monotonic()
        self._throttle()
        try:
            tx_hash = self.client.write_contract(
                address=self.contract, function_name=function, account=self.accounts[name],
                args=args, value=value,
            )
            record.tx_hash = str(tx_hash)
            receipt = self._wait(record.tx_hash)
            record.status = self._field(receipt, "status_name", "statusName", "status")
            record.result = self._field(
                receipt, "tx_execution_result_name", "txExecutionResultName",
                "result_name", "resultName",
            )
        except Exception as error:  # noqa: BLE001
            record.note = f"{type(error).__name__}: {error}"
            if expect == "success":
                record.result = record.result or "SUBMISSION_ERROR"
        record.seconds = round(time.monotonic() - started, 1)
        return record

    def read(self, function: str, args: list) -> Any:
        self._throttle()
        return self.client.read_contract(address=self.contract, function_name=function, args=args)

    # ---- deployment (best effort convenience)
    def deploy(self, code: str) -> str:
        self._throttle()
        tx_hash = str(self.client.deploy_contract(code=code, args=[], account=self.accounts["funder"]))
        receipt = self._wait(tx_hash)
        found = _find_address(receipt)
        if not found:
            raise ChainError(
                f"Deployment {tx_hash} finalized but the contract address could not be read "
                "from the receipt. Copy it from the Studionet explorer and pass --address."
            )
        return found


def _find_address(node: Any, depth: int = 0) -> str:
    if depth > 6:
        return ""
    keys = ("contract_address", "contractAddress", "created_address", "recipient", "to_address")
    if isinstance(node, dict):
        for key in keys:
            value = node.get(key)
            if isinstance(value, str) and value.startswith("0x") and len(value) == 42 \
                    and int(value, 16) != 0:
                return value
        for value in node.values():
            found = _find_address(value, depth + 1)
            if found:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_address(value, depth + 1)
            if found:
                return found
    return ""


# --------------------------------------------------------------------------- fixtures


def git_output(*args: str) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True,
                                       stderr=subprocess.DEVNULL).strip()
    except Exception:  # noqa: BLE001
        return ""


def fixture_base_url(override: str | None) -> str:
    if override:
        return override.rstrip("/") + "/"
    repository = os.environ.get("GITHUB_REPOSITORY") or _repo_from_remote()
    commit = git_output("rev-parse", "HEAD")
    if not repository or not commit:
        raise ChainError(
            "Cannot derive the fixture URL. Set --fixture-base-url to a public, commit-pinned "
            "directory URL that serves the files in fixtures/live/."
        )
    return f"https://raw.githubusercontent.com/{repository}/{commit}/fixtures/live/"


def _repo_from_remote() -> str:
    remote = git_output("config", "--get", "remote.origin.url")
    for prefix in ("https://github.com/", "git@github.com:"):
        if remote.startswith(prefix):
            return remote[len(prefix):].removesuffix(".git")
    return ""


def load_fixtures(base_url: str, verify: bool) -> dict[str, dict]:
    names = {
        "requirements": "requirements.md",
        "alpha": "alpha.md", "bravo": "bravo.md", "charlie": "charlie.md", "delta": "delta.md",
        "echo": "echo.md", "foxtrot": "foxtrot.md", "foxtrot_promised": "foxtrot_promised.md",
    }
    fixtures = {}
    for key, filename in names.items():
        raw = (FIXTURE_DIR / filename).read_bytes()
        fixtures[key] = {"file": filename, "url": base_url + filename, "bytes": raw,
                         "hash": sha256_hex(raw)}
    if verify:
        problems = []
        for key, item in fixtures.items():
            try:
                with urllib.request.urlopen(item["url"], timeout=30) as response:
                    served = response.read()
            except (urllib.error.URLError, TimeoutError) as error:
                problems.append(f"{item['url']} -> {error}")
                continue
            if served != item["bytes"]:
                problems.append(f"{item['url']} serves different bytes than the local file")
        if problems:
            raise ChainError(
                "Fixture check failed. Commit and push fixtures/live/ to a PUBLIC repository "
                "first (validators must be able to fetch them):\n  " + "\n  ".join(problems)
            )
    return fixtures


# ---------------------------------------------------------------------------- scenario


class Scenario:
    def __init__(self, chain: Chain, report: Report, fixtures: dict, state: dict,
                 commit_seconds: int, reveal_seconds: int, state_path: Path | None):
        self.chain = chain
        self.report = report
        self.fixtures = fixtures
        self.state = state
        self.commit_seconds = commit_seconds
        self.reveal_seconds = reveal_seconds
        self.state_path = state_path
        self.funder = chain.address("funder")
        self.tender_id = state["tender_id"]
        self.salts = state["salts"]

    # ---- helpers
    def save(self) -> None:
        if self.state_path:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            self.state_path.write_text(json.dumps(self.state, indent=2))

    def tx(self, name: str, function: str, args: list, *, value: int = 0, label: str = "",
           expect: str = "success", section: str = "") -> TxRecord:
        record = self.chain.write(name, function, args, value=value, label=label or function,
                                  expect=expect)
        self.report.txs.append(record)
        outcome = record.succeeded
        if expect == "success":
            log(f"tx {record.label}: {record.result or record.note or 'no result'} "
                f"({record.seconds}s)")
            if outcome is False or record.result == "SUBMISSION_ERROR":
                self.report.check(section or "transactions", f"{record.label} executed", False,
                                  "FINISHED_WITH_RETURN", record.result or record.note)
        else:
            log(f"tx {record.label}: expected revert, saw {record.result or record.note}")
        return record

    def view(self, function: str, args: list | None = None):
        return self.chain.read(function, args or [])

    def tender(self) -> dict:
        return self.view("get_tender", [self.funder, self.tender_id])

    def bid(self, bidder: str) -> dict:
        return self.view("get_bid", [self.funder, self.tender_id, self.chain.address(bidder)])

    def credit(self, name: str) -> int:
        return int(self.view("get_available_credit", [self.chain.address(name)]))

    def commitment_for(self, bidder: str) -> str:
        item = self.fixtures["foxtrot_promised" if bidder == "foxtrot" else bidder]
        url = self.fixtures[bidder]["url"]
        return make_commitment(self.funder, self.tender_id, self.chain.address(bidder),
                               PRICES[bidder], url, item["hash"], self.salts[bidder])

    def revert_check(self, section: str, name: str, who: str, function: str, args: list,
                     value: int = 0) -> None:
        """A call that must not change anything. State is compared before and after."""
        before = json.dumps(self.view("get_accounting"), sort_keys=True)
        record = self.tx(who, function, args, value=value, label=name, expect="revert",
                         section=section)
        after = json.dumps(self.view("get_accounting"), sort_keys=True)
        self.report.check(section, f"{name}: rejected", record.succeeded is not True,
                          "FINISHED_WITH_ERROR", record.result or record.note or "no result")
        self.report.check(section, f"{name}: books unchanged", before == after, "unchanged",
                          "unchanged" if before == after else "CHANGED")

    # ---- phases
    def funding_needs(self) -> dict:
        needs = {"funder": BUDGET + 2 * BOND}
        for name in BIDDERS:
            needs[name] = BOND + 10**14
        return needs

    def print_funding_plan(self) -> None:
        log("test accounts (kept in .live/accounts.json, which is git-ignored):")
        for name, wei in self.funding_needs().items():
            log(f"  {name:8s} {self.chain.address(name)}  needs {wei / GEN:.5f} GEN")

    def phase_funding(self) -> None:
        section = "1. Funding"
        self.print_funding_plan()
        needs = self.funding_needs()
        for name, wei in needs.items():
            if self.chain.balance(name) >= wei:
                continue
            self.chain.fund(name, wei * 2)
        shortfalls = {n: w for n, w in needs.items() if self.chain.balance(n) < w}
        for name, wei in needs.items():
            have = self.chain.balance(name)
            self.report.check(section, f"{name} holds enough GEN ({wei / GEN:.5f})",
                              have >= wei, f">= {wei}", have)
        if shortfalls:
            lines = "\n".join(f"  {self.chain.address(n)}  needs {w / GEN:.5f} GEN"
                              for n, w in shortfalls.items())
            raise ChainError(
                "Automatic funding is not available on this network or was refused. Send GEN to:\n"
                f"{lines}\nthen re-run with --resume {self.state['run_id']}"
            )

    def phase_open(self) -> None:
        section = "2. Open tender"
        if self.state.get("opened"):
            return
        self.tx("funder", "deposit_credit", [], value=BUDGET, label="funder deposits budget",
                section=section)
        now = self.chain.now()
        self.state["commit_by"] = now + self.commit_seconds
        self.state["reveal_by"] = now + self.commit_seconds + self.reveal_seconds
        req = self.fixtures["requirements"]
        self.tx("funder", "open_tender", [
            self.tender_id, "Community pool roof renovation",
            "Sealed-bid reverse auction. Lowest compliant bid wins; compliance with three "
            "mandatory requirements is screened by validators.",
            req["url"], req["hash"], 3, BUDGET, BOND, 8,
            self.state["commit_by"], self.state["reveal_by"],
        ], label="open tender", section=section)
        self.state["opened"] = True
        self.save()
        tender = self.tender()
        self.report.check(section, "tender is open", tender["status"] == "open", "open", tender["status"])
        self.report.check(section, "budget escrowed", tender["budget_wei"] == BUDGET, BUDGET,
                          tender["budget_wei"])
        self.report.check(section, "funder credit fully allocated", self.credit("funder") == 0, 0,
                          self.credit("funder"))
        self.report.sections[section] = {"tender": tender}

    def phase_commit(self) -> None:
        section = "3. Sealed commitments"
        if self.state.get("committed"):
            return
        for name in BIDDERS:
            self.tx(name, "deposit_credit", [], value=BOND, label=f"{name} deposits bond",
                    section=section)
            self.tx(name, "commit_bid", [self.funder, self.tender_id, self.commitment_for(name)],
                    label=f"{name} commits sealed bid", section=section)
        self.state["committed"] = True
        self.save()
        tender = self.tender()
        self.report.check(section, "six sealed bids recorded", tender["bid_count"] == 6, 6,
                          tender["bid_count"])
        sealed = self.bid("bravo")
        self.report.check(section, "price stays hidden while sealed", sealed["price"] == 0, 0,
                          sealed["price"])
        self.report.check(section, "bonds locked",
                          self.view("get_accounting")["total_locked_bonds"] == 6 * BOND,
                          6 * BOND, self.view("get_accounting")["total_locked_bonds"])
        # Adversarial checks that must be rejected on-chain.
        self.revert_check(section, "funder cannot bid on own tender", "funder", "commit_bid",
                          [self.funder, self.tender_id, self.commitment_for("alpha")])
        self.revert_check(section, "second commitment from the same bidder", "alpha", "commit_bid",
                          [self.funder, self.tender_id, self.commitment_for("alpha")])
        self.revert_check(section, "early reveal before the commit deadline", "alpha", "reveal_bid",
                          [self.funder, self.tender_id, PRICES["alpha"],
                           self.fixtures["alpha"]["url"], self.fixtures["alpha"]["hash"],
                           self.salts["alpha"]])
        self.revert_check(section, "stranger cannot screen", "stranger", "review_bid",
                          [self.funder, self.tender_id, self.chain.address("alpha")])

    def phase_reveal(self) -> None:
        section = "4. Reveal"
        if self.state.get("revealed"):
            return
        self.chain.sleep_until(self.state["commit_by"] + 5, "the commit window to close")
        self.revert_check(section, "late commitment after the deadline", "stranger", "commit_bid",
                          [self.funder, self.tender_id, self.commitment_for("alpha")])
        wrong = self.salts["bravo"][::-1]
        self.revert_check(section, "reveal with a wrong salt", "bravo", "reveal_bid",
                          [self.funder, self.tender_id, PRICES["bravo"],
                           self.fixtures["bravo"]["url"], self.fixtures["bravo"]["hash"], wrong])
        self.revert_check(section, "reveal with a lowered price", "bravo", "reveal_bid",
                          [self.funder, self.tender_id, PRICES["bravo"] - 1,
                           self.fixtures["bravo"]["url"], self.fixtures["bravo"]["hash"],
                           self.salts["bravo"]])
        for name in REVEALERS:
            promised = self.fixtures["foxtrot_promised" if name == "foxtrot" else name]
            self.tx(name, "reveal_bid", [
                self.funder, self.tender_id, PRICES[name], self.fixtures[name]["url"],
                promised["hash"], self.salts[name],
            ], label=f"{name} reveals", section=section)
        self.state["revealed"] = True
        self.save()
        for name in REVEALERS:
            bid = self.bid(name)
            self.report.check(section, f"{name} revealed at the sealed price",
                              bid["status"] == "revealed" and bid["price"] == PRICES[name],
                              f"revealed @ {PRICES[name]}", f"{bid['status']} @ {bid['price']}")
        echo = self.bid("echo")
        self.report.check(section, "echo (never reveals) stays sealed", echo["status"] == "committed",
                          "committed", echo["status"])

    def phase_screening(self) -> None:
        section = "5. Validator screening"
        if self.state.get("screened"):
            return
        self.chain.sleep_until(self.state["reveal_by"] + 5, "the reveal window to close")
        details = {}
        for name in REVEALERS:
            attempts = 0
            while attempts < 4:
                caller = "funder" if attempts % 2 == 0 else name
                self.tx(caller, "review_bid", [self.funder, self.tender_id, self.chain.address(name)],
                        label=f"screen {name} (try {attempts + 1})", section=section)
                bid = self.bid(name)
                attempts += 1
                if bid["status"] != "revealed":
                    break
                wait_to = bid["retry_at"] + 2
                self.chain.sleep_until(wait_to, f"{name} screening cooldown")
            details[name] = bid
            expected = EXPECTED_STATUS[name]
            self.report.check(
                section, f"{name} screened as {expected}", bid["status"] == expected, expected,
                f"{bid['status']} (confidence {bid['confidence']}, failed_mask {bid['failed_mask']}, "
                f"instruction_attempt={bid['instruction_attempt'] or '-'}, reason={bid['reason'] or '-'})",
            )
        charlie = details["charlie"]
        self.report.check(section, "charlie fails exactly R3 (warranty)",
                          charlie["failed_mask"] == 0b100, 0b100, charlie["failed_mask"])
        self.report.check(section, "delta flagged for instructing the reviewer",
                          details["delta"]["instruction_attempt"] == "yes", "yes",
                          details["delta"]["instruction_attempt"])
        self.report.check(section, "foxtrot disqualified for a hash mismatch",
                          details["foxtrot"]["reason"] == "proposal:hash_mismatch",
                          "proposal:hash_mismatch", details["foxtrot"]["reason"])
        self.revert_check(section, "a decisive verdict cannot be re-rolled", "funder", "review_bid",
                          [self.funder, self.tender_id, self.chain.address("bravo")])
        ranking = self.view("get_ranking", [self.funder, self.tender_id])["entries"]
        order = [entry["bidder"].lower() for entry in ranking]
        want = [self.chain.address("bravo").lower(), self.chain.address("alpha").lower()]
        self.report.check(section, "ranking lists bravo then alpha", order == want, want, order)
        self.report.sections[section] = {"bids": details}
        self.state["screened"] = True
        self.save()

    def phase_finalize(self) -> None:
        section = "6. Finalization"
        if not self.state.get("finalized"):
            self.revert_check(section, "a stranger cannot cancel a tender that has bids",
                              "stranger", "cancel_tender", [self.tender_id])
            self.tx("stranger", "finalize_tender", [self.funder, self.tender_id],
                    label="stranger finalizes (permissionless)", section=section)
            self.state["finalized"] = True
            self.save()
            self.revert_check(section, "finalizing a second time", "funder", "finalize_tender",
                              [self.funder, self.tender_id])
        tender = self.tender()
        bravo_address = self.chain.address("bravo")
        self.report.check(section, "tender finalized", tender["status"] == "finalized", "finalized",
                          tender["status"])
        self.report.check(section, "bravo (lowest compliant) wins",
                          tender["winner"].lower() == bravo_address.lower(), bravo_address,
                          tender["winner"])
        self.report.check(section, "award price is bravo's sealed price",
                          tender["award_price"] == PRICES["bravo"], PRICES["bravo"],
                          tender["award_price"])
        self.report.check(section, "two bonds forfeited (echo, foxtrot)",
                          tender["forfeited_wei"] == 2 * BOND, 2 * BOND, tender["forfeited_wei"])
        expected_credit = {
            "bravo": PRICES["bravo"] + BOND, "alpha": BOND, "charlie": BOND, "delta": BOND,
            "echo": 0, "foxtrot": 0,
            "funder": BUDGET - PRICES["bravo"] + 2 * BOND,
        }
        for name, wei in expected_credit.items():
            got = self.credit(name)
            self.report.check(section, f"{name} credit", got == wei, wei, got)
        accounting = self.view("get_accounting")
        total = sum(expected_credit.values())
        self.report.check(section, "ledger conserves all deposited value",
                          accounting["total_credits"] == total and accounting["total_locked_budgets"] == 0
                          and accounting["total_locked_bonds"] == 0, total,
                          accounting["total_credits"])
        self.report.check(section, "contract balance covers every liability",
                          accounting["solvent"], True, accounting["solvent"])
        self.state["expected_credit"] = expected_credit
        self.report.sections[section] = {"tender": tender, "accounting": accounting,
                                         "expected_credit": expected_credit}

    def phase_withdraw(self) -> None:
        section = "7. Native GEN withdrawals"
        expected = self.state["expected_credit"]
        for name, wei in expected.items():
            if wei == 0 or self.state.setdefault("withdrawn", {}).get(name):
                continue
            before = self.chain.balance(name)
            self.tx(name, "withdraw_credit", [], label=f"{name} withdraws credit", section=section)
            deadline = time.time() + 240
            after = before
            while time.time() < deadline:
                after = self.chain.balance(name)
                if after - before >= wei:
                    break
                time.sleep(8)
            gained = after - before
            self.report.check(section, f"{name} received {wei} wei", gained == wei, wei, gained)
            self.report.check(section, f"{name} ledger credit cleared", self.credit(name) == 0, 0,
                              self.credit(name))
            self.state["withdrawn"][name] = True
            self.save()
        for name in ("echo", "foxtrot"):
            self.revert_check(section, f"{name} has nothing to withdraw", name, "withdraw_credit", [])
        accounting = self.view("get_accounting")
        self.report.check(section, "no liabilities remain", accounting["accounted_liabilities"] == 0, 0,
                          accounting["accounted_liabilities"])
        self.report.sections[section] = {"accounting": accounting}

    def run(self) -> None:
        for phase in (self.phase_funding, self.phase_open, self.phase_commit, self.phase_reveal,
                      self.phase_screening, self.phase_finalize, self.phase_withdraw):
            phase()


# -------------------------------------------------------------------------------- report


def write_report(report: Report, directory: Path, contract: str, base_url: str) -> tuple[Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = directory / f"live-e2e-{stamp}.json"
    md_path = directory / f"live-e2e-{stamp}.md"
    passed = sum(1 for c in report.checks if c.passed)
    failed = len(report.checks) - passed
    payload = {
        "started": report.started, "finished": report.finished, "contract": contract,
        "fixture_base_url": base_url, "environment": report.environment,
        "passed": passed, "failed": failed, "fatal": report.fatal,
        "checks": [c.__dict__ for c in report.checks],
        "transactions": [dict(t.__dict__, link=t.link) for t in report.txs],
        "sections": report.sections,
    }
    json_path.write_text(json.dumps(payload, indent=2, default=str))

    verdict = "PASS" if report.all_passed else "FAIL"
    lines = [
        f"# Sieve live end-to-end report - {verdict}", "",
        f"- Network: GenLayer Studionet",
        f"- Contract: [{contract}]({EXPLORER_ADDRESS}{contract})",
        f"- Started / finished (UTC): {report.started} / {report.finished}",
        f"- Checks: **{passed} passed, {failed} failed**",
        f"- Fixture base URL: `{base_url}`",
    ]
    for key, value in report.environment.items():
        lines.append(f"- {key}: `{value}`")
    if report.fatal:
        lines += ["", "## Run aborted", "", "```", report.fatal, "```"]
    lines += ["", "## Checks", "", "| Result | Section | Check | Expected | Observed |",
              "| --- | --- | --- | --- | --- |"]
    for check in report.checks:
        mark = "PASS" if check.passed else "**FAIL**"
        row = [mark, check.section, check.name, check.expected, check.observed]
        lines.append("| " + " | ".join(str(c).replace("|", "\\|").replace("\n", " ") for c in row) + " |")
    lines += ["", "## Transactions", "", "| # | Step | Account | Function | Result | Status | Seconds | Tx |",
              "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for number, tx in enumerate(report.txs, 1):
        link = f"[{tx.tx_hash[:12]}...]({tx.link})" if tx.tx_hash else (tx.note or "-")
        expected = " (expected revert)" if tx.expected == "revert" else ""
        lines.append(f"| {number} | {tx.label}{expected} | `{tx.account[:10]}...` | `{tx.function}` | "
                     f"{tx.result or '-'} | {tx.status or '-'} | {tx.seconds} | {link} |")
    screening = report.sections.get("5. Validator screening", {}).get("bids", {})
    if screening:
        lines += ["", "## Validator findings", "",
                  "| Bidder | Status | Confidence | Failed mask | Instruction attempt | Rationale |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for name, bid in screening.items():
            lines.append(f"| {name} | {bid['status']} | {bid['confidence']} | {bid['failed_mask']:#05b} | "
                         f"{bid['instruction_attempt'] or '-'} | {str(bid['rationale']).replace('|', '/')} |")
    lines += ["", "## Notes", "",
              "- Pass/fail is decided from state read back from the contract, not from receipts.",
              "- `FINISHED_WITH_ERROR` on a step marked *expected revert* is the desired outcome.",
              "- Verdicts come from real validators and a real LLM; a failed screening check can mean "
              "the model disagreed with the fixture, so read the rationale before suspecting the contract."]
    md_path.write_text("\n".join(lines) + "\n")
    return md_path, json_path


# ---------------------------------------------------------------------------------- main


def environment_info(chain_name: str) -> dict:
    info = {"python": platform.python_version(), "platform": platform.platform(),
            "network": chain_name, "git_commit": git_output("rev-parse", "HEAD") or "unknown",
            "contract_sha256": hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest()}
    for package in ("genlayer-py", "genlayer-test"):
        try:
            from importlib.metadata import version
            info[package] = version(package)
        except Exception:  # noqa: BLE001
            info[package] = "not installed"
    return info


def load_state(path: Path, resume: str | None) -> tuple[dict, Path]:
    if resume:
        candidate = STATE_DIR / f"run-{resume}.json"
        if not candidate.exists():
            raise ChainError(f"No saved run {resume} in {STATE_DIR}")
        return json.loads(candidate.read_text()), candidate
    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    state = {"run_id": run_id, "tender_id": f"LIVE-{run_id}", "salts": {n: new_salt() for n in BIDDERS},
             "keys": {}}
    keys_file = STATE_DIR / "accounts.json"
    if keys_file.exists():
        state["keys"] = json.loads(keys_file.read_text())
    return state, STATE_DIR / f"run-{run_id}.json"


def main(argv: list[str] | None = None, chain_factory: Callable | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--address", default=os.environ.get("SIEVE_ADDRESS"),
                        help="deployed Sieve contract (or env SIEVE_ADDRESS)")
    parser.add_argument("--deploy", action="store_true", help="deploy contracts/sieve.py first")
    parser.add_argument("--fixture-base-url", default=os.environ.get("FIXTURE_BASE_URL"))
    parser.add_argument("--skip-fixture-check", action="store_true")
    parser.add_argument("--commit-seconds", type=int, default=600)
    parser.add_argument("--reveal-seconds", type=int, default=480)
    parser.add_argument("--wait-seconds", type=int, default=900, help="per-transaction wait budget")
    parser.add_argument("--rpc-url", default=os.environ.get("GENLAYER_RPC_URL"))
    parser.add_argument("--resume", help="run id from a previous (interrupted) run")
    parser.add_argument("--check-only", action="store_true",
                        help="verify tooling, fixtures and RPC reachability, then stop")
    args = parser.parse_args(argv)

    report = Report()
    report.environment = environment_info("studionet")
    contract = args.address or ""
    base_url = ""
    exit_code = 1
    try:
        state, state_path = load_state(STATE_DIR / "accounts.json", args.resume)
        base_url = fixture_base_url(args.fixture_base_url)
        fixtures = load_fixtures(base_url, verify=not args.skip_fixture_check)
        log(f"fixtures verified at {base_url}")
        if not contract and not args.deploy and not chain_factory:
            raise ChainError("Pass --address of your deployed Sieve contract, or use --deploy.")
        chain = (chain_factory(state) if chain_factory
                 else GenLayerChain(contract or "0x" + "0" * 40, state, args.rpc_url, args.wait_seconds))
        if args.deploy and not chain_factory:
            log("deploying contracts/sieve.py")
            contract = chain.deploy(CONTRACT_PATH.read_text())
            chain.contract = contract
            log(f"deployed at {contract}")
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        (STATE_DIR / "accounts.json").write_text(json.dumps(state["keys"], indent=2))
        info = chain.read("get_info", [])
        report.check("0. Preflight", "contract answers get_info as Sieve", info.get("name") == "Sieve",
                     "Sieve", info.get("name"))
        report.environment["contract_version"] = info.get("version")
        if args.check_only:
            Scenario(chain, report, fixtures, state, args.commit_seconds, args.reveal_seconds,
                     state_path).print_funding_plan()
            log("check-only run finished: tooling, fixtures and contract are reachable")
            return 0 if report.all_passed else 1
        scenario = Scenario(chain, report, fixtures, state, args.commit_seconds, args.reveal_seconds,
                            state_path)
        scenario.run()
        exit_code = 0 if report.all_passed else 1
    except ChainError as error:
        report.fatal = str(error)
        exit_code = 2
    except KeyboardInterrupt:
        report.fatal = "Interrupted. Resume with --resume " + (locals().get("state", {}) or {}).get("run_id", "")
        exit_code = 130
    except Exception:  # noqa: BLE001
        report.fatal = traceback.format_exc()
        exit_code = 2
    finally:
        report.finished = utc_now()
        if report.checks or report.fatal:
            md_path, json_path = write_report(report, REPORT_DIR, contract or "(none)", base_url)
            log(f"report written: {os.path.relpath(md_path)} and {json_path.name}")
        if report.fatal:
            log("ABORTED: " + report.fatal.splitlines()[0])
        passed = sum(1 for c in report.checks if c.passed)
        log(f"{passed}/{len(report.checks)} checks passed")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
