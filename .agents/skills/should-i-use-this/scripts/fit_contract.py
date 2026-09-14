#!/usr/bin/env python3
"""Portable packet builder and result validator for Should I Use This contract v4."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import uuid
from typing import Any


class ContractError(ValueError):
    pass


FACT_ID = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")
SPAN_ID = re.compile(r"^S[1-9]\d*$")
UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")


def utf16_len(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def require_object(value: Any, keys: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractError(f"invalid {name}")
    return value


def require_array(value: Any, name: str, minimum: int = 0, maximum: int | None = None) -> list[Any]:
    if not isinstance(value, list) or len(value) < minimum or (maximum is not None and len(value) > maximum):
        raise ContractError(f"invalid {name}")
    return value


def require_text(value: Any, name: str, minimum: int = 0, maximum: int | None = None, trim: bool = False) -> str:
    if not isinstance(value, str):
        raise ContractError(f"invalid {name}")
    normalized = value.strip() if trim else value
    length = utf16_len(normalized)
    if length < minimum or (maximum is not None and length > maximum):
        raise ContractError(f"invalid {name}")
    return normalized


def require_fact_id(value: Any, name: str) -> str:
    text = require_text(value, name, 1, 32)
    if not FACT_ID.fullmatch(text):
        raise ContractError(f"invalid {name}")
    return text


def require_refs(value: Any, name: str, maximum: int = 6) -> list[str]:
    refs = [require_fact_id(item, name) for item in require_array(value, name, maximum=maximum)]
    return refs


def validate_input(value: Any, allow_missing_id: bool = False) -> dict[str, str]:
    keys = {"tool", "source", "situation"} if allow_missing_id and isinstance(value, dict) and "id" not in value else {"id", "tool", "source", "situation"}
    raw = require_object(value, keys, "input")
    identifier = str(uuid.uuid4()) if "id" not in raw else require_text(raw["id"], "input id", 1, 128)
    if not UUID.fullmatch(identifier):
        raise ContractError("invalid input id")
    tool = require_text(raw["tool"], "tool", 1, 200, trim=True)
    source = require_text(raw["source"], "source", 1, 32000)
    if not source.strip():
        raise ContractError("invalid source")
    situation = require_text(raw["situation"], "situation", 0, 4000)
    return {"id": identifier, "tool": tool, "source": source, "situation": situation}


def section_spans(source: str) -> list[dict[str, Any]]:
    if not source.strip():
        return []
    cuts: list[dict[str, int]] = [{"point": 0, "offset": 0, "level": 0}]
    point = 0
    offset = 0
    fence: tuple[str, int] | None = None
    for match in re.finditer(r"[^\n]*\n|[^\n]+$", source):
        line = match.group(0)
        syntax = re.sub(r"\r?\n$", "", line)
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", syntax)
        if marker:
            token, suffix = marker.groups()
            if fence is None:
                fence = (token[0], len(token))
            elif token[0] == fence[0] and len(token) >= fence[1] and not suffix.strip():
                fence = None
        elif fence is None:
            heading = re.match(r"^ {0,3}(#{1,6})(?:[ \t]+|$)", syntax)
            if heading:
                level = len(heading.group(1))
                if offset == 0:
                    cuts[0]["level"] = level
                else:
                    cuts.append({"point": point, "offset": offset, "level": level})
        point += len(line)
        offset += utf16_len(line)
    if len(cuts) > 64:
        raise ContractError("too many source sections")

    parents: list[dict[str, Any]] = []
    spans: list[dict[str, Any]] = []
    for index, cut in enumerate(cuts):
        while parents and parents[-1]["level"] >= cut["level"]:
            parents.pop()
        end_point = cuts[index + 1]["point"] if index + 1 < len(cuts) else len(source)
        end_offset = cuts[index + 1]["offset"] if index + 1 < len(cuts) else utf16_len(source)
        span_id = f"S{index + 1}"
        spans.append({
            "id": span_id,
            "start": cut["offset"],
            "end": end_offset,
            "text": source[cut["point"]:end_point],
            "contextIds": [parent["id"] for parent in parents],
        })
        parents.append({"id": span_id, "level": cut["level"]})
    return spans


def build_packet(input_value: dict[str, str]) -> dict[str, Any]:
    bound = {
        "id": input_value["id"],
        "source": input_value["source"],
        "situation": input_value["situation"],
        "tool": input_value["tool"],
        "answeredQuestions": [],
    }
    encoded = json.dumps(bound, ensure_ascii=False, separators=(",", ":"))
    situation = input_value["situation"]
    return {
        "id": input_value["id"],
        "tool": input_value["tool"],
        "offsetUnit": "utf16",
        "inputHash": hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
        "sourceSpans": section_spans(input_value["source"]),
        "userSpans": ([{
            "id": "U1",
            "start": 0,
            "end": utf16_len(situation),
            "text": situation,
            "contextIds": [],
        }] if situation.strip() else []),
        "answeredQuestions": [],
    }


def parse_fact(value: Any, user: bool = False) -> dict[str, Any]:
    raw = require_object(value, {"id", "statement", "spanIds"} if user else {"id", "category", "statement", "spanIds"}, "fact")
    result: dict[str, Any] = {"id": require_fact_id(raw["id"], "fact id")}
    if not user:
        if raw["category"] not in {"feature", "requirement"}:
            raise ContractError("invalid fact category")
        result["category"] = raw["category"]
    result["statement"] = require_text(raw["statement"], "fact statement", 1, 400, trim=True)
    span_ids = require_array(raw["spanIds"], "span ids", 1, 1 if user else 4)
    if user:
        if span_ids != ["U1"]:
            raise ContractError("invalid user span")
        result["spanIds"] = ["U1"]
    else:
        parsed = [require_text(item, "span id", 1) for item in span_ids]
        if any(not SPAN_ID.fullmatch(item) for item in parsed):
            raise ContractError("invalid source span")
        result["spanIds"] = parsed
    return result


def parse_judgment(value: Any) -> dict[str, Any]:
    raw = require_object(value, {"statement", "factIds", "userFactIds"}, "judgment")
    return {
        "statement": require_text(raw["statement"], "judgment statement", 1, 400, trim=True),
        "factIds": require_refs(raw["factIds"], "fact reference"),
        "userFactIds": require_refs(raw["userFactIds"], "user reference"),
    }


def parse_answer(value: Any) -> tuple[dict[str, Any], bool]:
    base = {"id", "inputHash", "decision", "facts", "userFacts", "judgments", "burdenFactIds", "unknowns", "questionCode"}
    current = isinstance(value, dict) and "adoptionBasis" in value
    raw = require_object(value, base | ({"adoptionBasis"} if current else set()), "answer")
    if raw["decision"] not in {"consider", "hold", "skip"}:
        raise ContractError("invalid decision")
    input_hash = require_text(raw["inputHash"], "input hash", 64, 64)
    if not re.fullmatch(r"[a-f0-9]{64}", input_hash):
        raise ContractError("invalid input hash")
    facts = [parse_fact(item) for item in require_array(raw["facts"], "facts", maximum=6)]
    user_facts = [parse_fact(item, user=True) for item in require_array(raw["userFacts"], "user facts", maximum=4)]
    judgments = [parse_judgment(item) for item in require_array(raw["judgments"], "judgments", 1, 3)]
    unknowns = [require_text(item, "unknown", 1, 400, trim=True) for item in require_array(raw["unknowns"], "unknowns", maximum=3)]
    if raw["questionCode"] not in {None, "goal", "constraint"}:
        raise ContractError("invalid question code")
    adoption = None
    if current and raw["adoptionBasis"] is not None:
        basis = require_object(raw["adoptionBasis"], {"needUserFactId", "gapUserFactId", "benefitFactId"}, "adoption basis")
        adoption = {key: require_fact_id(basis[key], key) for key in ("needUserFactId", "gapUserFactId", "benefitFactId")}
    return ({
        "id": require_text(raw["id"], "answer id", 1),
        "inputHash": input_hash,
        "decision": raw["decision"],
        "facts": facts,
        "userFacts": user_facts,
        "judgments": judgments,
        "burdenFactIds": require_refs(raw["burdenFactIds"], "burden reference"),
        "unknowns": unknowns,
        "questionCode": raw["questionCode"],
        "adoptionBasis": adoption,
    }, current)


def unique_valid(refs: list[str], allowed: set[str]) -> bool:
    return len(set(refs)) == len(refs) and all(ref in allowed for ref in refs)


def cite(ids: list[str], spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {span["id"]: span for span in spans}
    return [{**by_id[item], "context": [{**by_id[parent]} for parent in by_id[item]["contextIds"]]} for item in ids]


def validate_and_render(input_value: dict[str, str], raw_answer: Any) -> dict[str, Any]:
    answer, current = parse_answer(raw_answer)
    packet = build_packet(input_value)
    if answer["id"] != packet["id"] or answer["inputHash"] != packet["inputHash"]:
        raise ContractError("input binding mismatch")
    all_ids = [fact["id"] for fact in answer["facts"] + answer["userFacts"]]
    if len(set(all_ids)) != len(all_ids):
        raise ContractError("duplicate fact id")
    source_ids = {span["id"] for span in packet["sourceSpans"]}
    user_span_ids = {span["id"] for span in packet["userSpans"]}
    if any(not unique_valid(fact["spanIds"], source_ids) for fact in answer["facts"]):
        raise ContractError("invalid source span")
    if any(not unique_valid(fact["spanIds"], user_span_ids) for fact in answer["userFacts"]):
        raise ContractError("invalid user span")
    fact_ids = {fact["id"] for fact in answer["facts"]}
    user_ids = {fact["id"] for fact in answer["userFacts"]}
    for judgment in answer["judgments"]:
        if not unique_valid(judgment["factIds"], fact_ids) or not unique_valid(judgment["userFactIds"], user_ids):
            raise ContractError("invalid premise reference")
        if answer["decision"] != "hold" and (not judgment["factIds"] or not judgment["userFactIds"]):
            raise ContractError("missing recommendation premises")
    requirements = {fact["id"] for fact in answer["facts"] if fact["category"] == "requirement"}
    if not unique_valid(answer["burdenFactIds"], requirements):
        raise ContractError("invalid burden reference")

    adoption = answer["adoptionBasis"]
    if answer["decision"] != "consider" and adoption is not None:
        raise ContractError("unexpected adoption basis")
    if adoption is not None:
        need = next((item for item in answer["userFacts"] if item["id"] == adoption["needUserFactId"]), None)
        gap = next((item for item in answer["userFacts"] if item["id"] == adoption["gapUserFactId"]), None)
        benefit = next((item for item in answer["facts"] if item["id"] == adoption["benefitFactId"] and item["category"] == "feature"), None)
        connected = any(
            adoption["needUserFactId"] in item["userFactIds"]
            and adoption["gapUserFactId"] in item["userFactIds"]
            and adoption["benefitFactId"] in item["factIds"]
            for item in answer["judgments"]
        )
        if not need or not gap or not benefit or not connected:
            raise ContractError("invalid adoption basis")

    deferred = answer["decision"] == "consider" and adoption is None
    question = None
    if answer["questionCode"] == "goal" and not input_value["situation"].strip():
        question = "어떤 일에 이 도구를 쓰고 싶으세요?"
    elif answer["questionCode"] == "constraint":
        question = "도구를 바꿔도 꼭 지키고 싶은 조건 하나가 있나요?"
    displayed = "hold" if deferred else answer["decision"]
    source_spans = packet["sourceSpans"]
    user_spans = packet["userSpans"]
    facts = [{**item, "label": "문서의 설명", "citations": cite(item["spanIds"], source_spans)} for item in answer["facts"]]
    user_facts = [{**item, "label": "사용자가 알려준 상황", "citations": cite(item["spanIds"], user_spans)} for item in answer["userFacts"]]
    return {
        "decision": displayed,
        "inputHash": packet["inputHash"],
        "offsetUnit": "utf16",
        "facts": facts,
        "userFacts": user_facts,
        "judgments": [{"text": f"예상 판단: {item['statement']}", "factIds": list(item["factIds"]), "userFactIds": list(item["userFactIds"])} for item in answer["judgments"]],
        "burdens": [{"text": f"문서에 명시: {next(fact['statement'] for fact in answer['facts'] if fact['id'] == item)}", "factId": item} for item in answer["burdenFactIds"]],
        "unknowns": [f"제공 자료에서 미확인: {item}" for item in answer["unknowns"]],
        "question": question,
        "modelDecision": answer["decision"],
        "adoptionBasis": adoption,
        "adoptionNotice": ("내 상황에서 해결할 문제와 현재 방식보다 나은 점의 근거가 연결되지 않아 도입 판단을 보류합니다. AI의 원래 설명은 아래에서 확인할 수 있습니다." if deferred else None),
    }


def load_stdin() -> Any:
    try:
        return json.load(sys.stdin)
    except Exception as error:
        raise ContractError("invalid JSON input") from error


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] in {"-h", "--help"}:
        print("usage: fit_contract.py prepare|validate")
        return 0
    try:
        if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "validate"}:
            raise ContractError("usage: fit_contract.py prepare|validate")
        payload = load_stdin()
        if sys.argv[1] == "prepare":
            input_value = validate_input(payload, allow_missing_id=True)
            output = {"input": input_value, "packet": build_packet(input_value)}
        else:
            if not isinstance(payload, dict) or set(payload) not in ({"input", "reply"}, {"input", "answer"}):
                raise ContractError("invalid validation exchange")
            input_value = validate_input(payload["input"])
            if "reply" in payload:
                reply = require_text(payload["reply"], "reply", 1, 64000)
                fence = re.fullmatch(r"```(?:json)?\s*\n([\s\S]*?)\n```", reply.strip(), re.IGNORECASE)
                try:
                    answer = json.loads(fence.group(1) if fence else reply.strip())
                except Exception as error:
                    raise ContractError("invalid answer JSON") from error
            else:
                answer = payload["answer"]
            output = {"view": validate_and_render(input_value, answer)}
        json.dump(output, sys.stdout, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.write("\n")
        return 0
    except ContractError as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 2
    except Exception:
        print("INVALID: contract validation failed", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
