#!/usr/bin/env python3
"""Portable candidate discovery and purchase/contract review boundary v1."""

from __future__ import annotations

import datetime as dt
import hashlib
import ipaddress
import json
import re
import sys
import uuid
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

KINDS = {"mcp","skill","plugin","software","saas","open_source","service_vendor"}
ROLES = {"target","free_open_source","paid_alternative","vendor_alternative"}
CLAIM_CATEGORIES = {"identity","capability","price","trial","renewal","cancellation","requirement","permission","data_handling","maintenance","process","ownership","vendor_claim"}
UNKNOWN_CATEGORIES = {"price","permission","data_handling","maintenance","ownership","acceptance","payment_terms","termination","effect"}
ACTIONS = {"review_payment","trial_first","hold_payment","do_not_pay","request_proposal","hold_contract","research_hold"}
PRODUCT_ACTIONS = {"review_payment","trial_first","hold_payment","do_not_pay"}
VENDOR_ACTIONS = {"request_proposal","hold_contract"}
ACTIVE_ACTIONS = {"review_payment","trial_first","request_proposal"}
ID = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
SENSITIVE = re.compile(r"(?:token|secret|password|passwd|auth|api[_-]?key|signature|credential)", re.I)
QUANTIFIED = re.compile(r"(?:생산성|시간\s*절감|업무\s*효율|비용\s*절감).{0,20}(?:\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*퍼센트|몇\s*배)|(?:\d+(?:\.\d+)?\s*%).{0,20}(?:생산성|시간|효율|절감)")

class ContractError(ValueError):
    pass

def utf16_len(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2

def obj(value: Any, keys: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractError("invalid " + name)
    return value

def arr(value: Any, name: str, minimum: int = 0, maximum: int | None = None) -> list[Any]:
    if not isinstance(value, list) or len(value) < minimum or (maximum is not None and len(value) > maximum):
        raise ContractError("invalid " + name)
    return value

def text(value: Any, name: str, minimum: int = 0, maximum: int | None = None, trim: bool = False) -> str:
    if not isinstance(value, str):
        raise ContractError("invalid " + name)
    result = value.strip() if trim else value
    size = utf16_len(result)
    if size < minimum or (maximum is not None and size > maximum):
        raise ContractError("invalid " + name)
    return result

def enum(value: Any, values: set[str], name: str) -> str:
    if not isinstance(value, str) or value not in values:
        raise ContractError("invalid " + name)
    return value

def identifier(value: Any, name: str) -> str:
    result = text(value, name, 1, 64)
    if not ID.fullmatch(result):
        raise ContractError("invalid " + name)
    return result

def date(value: Any, name: str) -> str:
    result = text(value, name, 10, 10)
    if not DATE.fullmatch(result):
        raise ContractError("invalid " + name)
    try:
        dt.date.fromisoformat(result)
    except ValueError as exc:
        raise ContractError("invalid " + name) from exc
    return result

def public_url(value: Any, name: str, allow_fragment: bool, normalize: bool = False) -> str:
    raw = text(value, name, 1, 2048)
    try:
        parsed = urlsplit(raw)
        host = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ContractError("invalid " + name) from exc
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or (parsed.fragment and not allow_fragment):
        raise ContractError("invalid " + name)
    lowered = host.lower()
    if lowered.endswith(".") or lowered == "localhost" or lowered.endswith((".localhost",".local",".internal")):
        raise ContractError("invalid " + name)
    if ":" in lowered:
        raise ContractError("invalid " + name)
    try:
        address = ipaddress.ip_address(lowered)
        if not address.is_global:
            raise ContractError("invalid " + name)
    except ValueError:
        if "." not in lowered or re.fullmatch(r"[0-9.]+", lowered):
            raise ContractError("invalid " + name)
    for key, _ in parse_qsl(parsed.query, keep_blank_values=True):
        if SENSITIVE.search(key):
            raise ContractError("invalid " + name)
    ascii_host = lowered.encode("idna").decode("ascii")
    netloc = ascii_host + ((":" + str(port)) if port and port != 443 else "")
    path_segments: list[str] = []
    for segment in (parsed.path or "/").split("/"):
        marker = segment.lower()
        if marker in {".", "%2e"}:
            continue
        if marker in {"..", ".%2e", "%2e.", "%2e%2e"}:
            if len(path_segments) > 1 or (path_segments and path_segments[-1]):
                path_segments.pop()
            continue
        path_segments.append(segment)
    path = quote("/".join(path_segments) or "/", safe="/:@-._~!$&'()*+,;=%")
    fragment = "" if normalize else quote(parsed.fragment, safe="-._~!$&'()*+,;=:@/?%")
    return urlunsplit(("https", netloc, path, urlencode(parse_qsl(parsed.query, keep_blank_values=True)), fragment))

def refs(value: Any, name: str, maximum: int, minimum: int = 0) -> list[str]:
    result = [identifier(item, name) for item in arr(value, name, minimum, maximum)]
    if len(set(result)) != len(result):
        raise ContractError("duplicate " + name)
    return result

def sentence_spans(value: str) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for match in re.finditer(r"[^\n.!?。！？]+(?:[.!?。！？]+|(?=\n|$))", value):
        raw = match.group(0)
        stripped = raw.strip()
        if not stripped:
            continue
        leading = len(raw) - len(raw.lstrip())
        point = match.start() + leading
        start = utf16_len(value[:point])
        spans.append({"id": "u" + str(len(spans) + 1), "text": stripped, "start": start, "end": start + utf16_len(stripped)})
    return spans

def validate_input(value: Any, allow_missing_id: bool) -> dict[str, Any]:
    base = {"name","url","suppliedText","situation"}
    raw = obj(value, base, "fields")
    name = text(raw["name"], "name", 0, 200, True)
    supplied = text(raw["suppliedText"], "supplied text", 0, 16000)
    situation = text(raw["situation"], "situation", 0, 4000)
    url = text(raw["url"], "url", 0, 2048, True)
    if url:
        url = public_url(url, "url", True, True)
    if not (name or url or supplied.strip() or situation.strip()):
        raise ContractError("candidate or situation required")
    identifier_value = str(uuid.uuid4()) if allow_missing_id else ""
    source_kind = "candidate_list" if supplied.strip() else ("single_candidate" if name or url else "unknown")
    return {
        "id": identifier_value,
        "asOf": dt.date.today().isoformat(),
        "subject": {"name": name, "url": url, "suppliedText": supplied, "sourceKind": source_kind},
        "situation": situation,
        "requestedKinds": ["mcp","skill","plugin","software","saas","open_source","service_vendor"],
        "maxCandidates": 5,
    }

def parse_full_input(value: Any) -> dict[str, Any]:
    raw = obj(value, {"id","asOf","subject","situation","requestedKinds","maxCandidates"}, "input")
    input_id = text(raw["id"], "input id", 36, 36)
    if not UUID.fullmatch(input_id):
        raise ContractError("invalid input id")
    subject = obj(raw["subject"], {"name","url","suppliedText","sourceKind"}, "subject")
    result = {
        "id": input_id,
        "asOf": date(raw["asOf"], "as of"),
        "subject": {
            "name": text(subject["name"], "name", 0, 200),
            "url": "" if subject["url"] == "" else public_url(subject["url"], "url", False),
            "suppliedText": text(subject["suppliedText"], "supplied text", 0, 16000),
            "sourceKind": enum(subject["sourceKind"], {"single_candidate","candidate_list","unknown"}, "source kind"),
        },
        "situation": text(raw["situation"], "situation", 0, 4000),
        "requestedKinds": [enum(item, KINDS, "candidate kind") for item in arr(raw["requestedKinds"], "requested kinds", 1, 7)],
        "maxCandidates": raw["maxCandidates"],
    }
    if not isinstance(result["maxCandidates"], int) or not 1 <= result["maxCandidates"] <= 5 or len(set(result["requestedKinds"])) != len(result["requestedKinds"]):
        raise ContractError("invalid input options")
    return result

def build_packet(input_value: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(input_value, ensure_ascii=False, separators=(",", ":"))
    return {**input_value, "userSpans": sentence_spans(input_value["situation"]), "inputHash": hashlib.sha256(encoded.encode("utf-8")).hexdigest()}

def parse_answer(value: Any) -> dict[str, Any]:
    raw = obj(value, {"id","inputHash","asOf","status","userFacts","workstream","discoverySources","sources","candidates","currentMethods","excluded","commitment","limitations"}, "answer")
    answer: dict[str, Any] = {
        "id": text(raw["id"], "answer id", 36, 36),
        "inputHash": text(raw["inputHash"], "hash", 64, 64),
        "asOf": date(raw["asOf"], "answer date"),
        "status": enum(raw["status"], {"ready","hold"}, "status"),
    }
    if not UUID.fullmatch(answer["id"]) or not re.fullmatch(r"[a-f0-9]{64}", answer["inputHash"]):
        raise ContractError("invalid answer binding")
    answer["userFacts"] = []
    for item in arr(raw["userFacts"], "user facts", 0, 12):
        fact = obj(item, {"id","category","statement","userSpanIds"}, "user fact")
        answer["userFacts"].append({"id":identifier(fact["id"],"user fact id"),"category":enum(fact["category"],{"job","need","gap","current_method","constraint"},"user fact category"),"statement":text(fact["statement"],"user fact statement",1,500,True),"userSpanIds":refs(fact["userSpanIds"],"user span id",4,1)})
    work = obj(raw["workstream"], {"label","statement","userFactIds"}, "workstream")
    answer["workstream"] = {"label":text(work["label"],"workstream label",1,100,True),"statement":text(work["statement"],"workstream statement",1,500,True),"userFactIds":refs(work["userFactIds"],"workstream fact",8)}
    answer["discoverySources"] = []
    for item in arr(raw["discoverySources"], "discovery sources", 0, 10):
        source = obj(item, {"id","url","title","note"}, "discovery source")
        answer["discoverySources"].append({"id":identifier(source["id"],"discovery id"),"url":public_url(source["url"],"discovery url",True),"title":text(source["title"],"discovery title",1,300,True),"note":text(source["note"],"discovery note",1,500,True)})
    answer["sources"] = []
    for item in arr(raw["sources"], "sources", 0, 20):
        source = obj(item, {"id","url","title","excerpt","retrievedAt","owner","appliesToCandidateIds"}, "source")
        answer["sources"].append({"id":identifier(source["id"],"source id"),"url":public_url(source["url"],"source url",True),"title":text(source["title"],"source title",1,300,True),"excerpt":text(source["excerpt"],"source excerpt",1,1200,True),"retrievedAt":date(source["retrievedAt"],"source date"),"owner":enum(source["owner"],{"candidate","platform","independent"},"source owner"),"appliesToCandidateIds":refs(source["appliesToCandidateIds"],"source candidate",5,1)})
    answer["candidates"] = []
    for item in arr(raw["candidates"], "candidates", 0, 5):
        candidate = obj(item, {"id","name","kind","role","canonicalUrl","canonicalSourceId","relation","relationReason","userFactIds","claims","license","unknowns"}, "candidate")
        parsed: dict[str, Any] = {
            "id":identifier(candidate["id"],"candidate id"),"name":text(candidate["name"],"candidate name",1,200,True),"kind":enum(candidate["kind"],KINDS,"candidate kind"),"role":enum(candidate["role"],ROLES,"candidate role"),"canonicalUrl":public_url(candidate["canonicalUrl"],"canonical URL",False),"canonicalSourceId":identifier(candidate["canonicalSourceId"],"canonical source"),"relation":enum(candidate["relation"],{"direct","indirect"},"relation"),"relationReason":text(candidate["relationReason"],"relation reason",1,500,True),"userFactIds":refs(candidate["userFactIds"],"candidate fact",8),
        }
        parsed["claims"] = []
        for claim_item in arr(candidate["claims"], "claims", 0, 12):
            claim = obj(claim_item, {"id","category","statement","sourceIds"}, "claim")
            parsed["claims"].append({"id":identifier(claim["id"],"claim id"),"category":enum(claim["category"],CLAIM_CATEGORIES,"claim category"),"statement":text(claim["statement"],"claim statement",1,600,True),"sourceIds":refs(claim["sourceIds"],"claim source",4,1)})
        license_raw = obj(candidate["license"], {"status","spdxId","sourceIds"}, "license")
        parsed["license"] = {"status":enum(license_raw["status"],{"documented","unknown","not_applicable"},"license status"),"spdxId":None if license_raw["spdxId"] is None else text(license_raw["spdxId"],"SPDX",1,64,True),"sourceIds":refs(license_raw["sourceIds"],"license source",4)}
        parsed["unknowns"] = []
        for unknown_item in arr(candidate["unknowns"], "unknowns", 0, 12):
            unknown = obj(unknown_item, {"id","category","statement"}, "unknown")
            parsed["unknowns"].append({"id":identifier(unknown["id"],"unknown id"),"category":enum(unknown["category"],UNKNOWN_CATEGORIES,"unknown category"),"statement":text(unknown["statement"],"unknown statement",1,500,True)})
        answer["candidates"].append(parsed)
    answer["currentMethods"] = []
    for item in arr(raw["currentMethods"], "current methods", 0, 6):
        method = obj(item, {"id","statement","userFactIds"}, "current method")
        answer["currentMethods"].append({"id":identifier(method["id"],"method id"),"statement":text(method["statement"],"method statement",1,500,True),"userFactIds":refs(method["userFactIds"],"method fact",4,1)})
    answer["excluded"] = []
    for item in arr(raw["excluded"], "excluded", 0, 12):
        excluded = obj(item, {"name","url","reason"}, "excluded candidate")
        answer["excluded"].append({"name":text(excluded["name"],"excluded name",1,200,True),"url":"" if excluded["url"]=="" else public_url(excluded["url"],"excluded URL",True),"reason":enum(excluded["reason"],{"identity_mismatch","no_canonical_source","license_unknown","unrelated","duplicate"},"excluded reason")})
    commitment = obj(raw["commitment"], {"targetCandidateId","action","statement","userFactIds","claimIds","alternativeClaimIds","alternativeCandidateIds","currentMethodIds","unknownIds"}, "commitment")
    answer["commitment"] = {
        "targetCandidateId":None if commitment["targetCandidateId"] is None else identifier(commitment["targetCandidateId"],"target"),"action":enum(commitment["action"],ACTIONS,"action"),"statement":text(commitment["statement"],"decision",1,800,True),"userFactIds":refs(commitment["userFactIds"],"decision fact",8),"claimIds":refs(commitment["claimIds"],"decision claim",12),"alternativeClaimIds":refs(commitment["alternativeClaimIds"],"alternative claim",12),"alternativeCandidateIds":refs(commitment["alternativeCandidateIds"],"alternative",5),"currentMethodIds":refs(commitment["currentMethodIds"],"current method",6),"unknownIds":refs(commitment["unknownIds"],"decision unknown",12),
    }
    answer["limitations"] = [text(item,"limitation",1,500,True) for item in arr(raw["limitations"],"limitations",0,12)]
    return answer

def ensure_refs(values: list[str], allowed: set[str], message: str) -> None:
    if any(value not in allowed for value in values):
        raise ContractError(message)

def validate_answer(input_value: dict[str, Any], raw: Any) -> dict[str, Any]:
    answer = parse_answer(raw)
    packet = build_packet(input_value)
    if answer["id"] != packet["id"] or answer["inputHash"] != packet["inputHash"] or answer["asOf"] != input_value["asOf"]:
        raise ContractError("input binding mismatch")
    if any(source["retrievedAt"] != input_value["asOf"] for source in answer["sources"]):
        raise ContractError("source date mismatch")
    if len(answer["candidates"]) > input_value["maxCandidates"] or any(candidate["kind"] not in input_value["requestedKinds"] for candidate in answer["candidates"]):
        raise ContractError("candidate boundary")
    groups = [answer["userFacts"],answer["discoverySources"],answer["sources"],answer["candidates"],answer["currentMethods"]]
    ids = [item["id"] for group in groups for item in group] + [item["id"] for candidate in answer["candidates"] for item in candidate["claims"]+candidate["unknowns"]]
    if len(set(ids)) != len(ids):
        raise ContractError("duplicate id")
    span_ids = {span["id"] for span in packet["userSpans"]}
    user_facts = {fact["id"]:fact for fact in answer["userFacts"]}
    for fact in answer["userFacts"]: ensure_refs(fact["userSpanIds"], span_ids, "invalid user span")
    ensure_refs(answer["workstream"]["userFactIds"], set(user_facts), "invalid workstream premise")
    for method in answer["currentMethods"]:
        ensure_refs(method["userFactIds"], set(user_facts), "invalid current method")
        if any(user_facts[item]["category"] != "current_method" for item in method["userFactIds"]): raise ContractError("invalid current method")
    candidates = {candidate["id"]:candidate for candidate in answer["candidates"]}
    sources = {source["id"]:source for source in answer["sources"]}
    for source in answer["sources"]: ensure_refs(source["appliesToCandidateIds"], set(candidates), "invalid source candidate binding")
    for candidate in answer["candidates"]:
        ensure_refs(candidate["userFactIds"], set(user_facts), "invalid candidate premise")
        canonical = sources.get(candidate["canonicalSourceId"])
        if not canonical or candidate["id"] not in canonical["appliesToCandidateIds"]: raise ContractError("invalid canonical source")
        for claim in candidate["claims"]:
            ensure_refs(claim["sourceIds"], set(sources), "invalid claim source")
            if any(candidate["id"] not in sources[item]["appliesToCandidateIds"] for item in claim["sourceIds"]): raise ContractError("cross-candidate claim source")
            if claim["category"] == "vendor_claim" and any(sources[item]["owner"] != "candidate" for item in claim["sourceIds"]): raise ContractError("vendor claim source owner")
        lic = candidate["license"]
        ensure_refs(lic["sourceIds"], set(sources), "invalid license source")
        if any(candidate["id"] not in sources[item]["appliesToCandidateIds"] for item in lic["sourceIds"]): raise ContractError("invalid license source")
        if candidate["kind"] == "open_source" and lic["status"] == "documented" and (not lic["spdxId"] or not lic["sourceIds"]): raise ContractError("undocumented license")
        if lic["status"] != "documented" and (lic["spdxId"] is not None or lic["sourceIds"]): raise ContractError("unexpected license evidence")
    decision = answer["commitment"]
    claims = {claim["id"]:claim for candidate in answer["candidates"] for claim in candidate["claims"]}
    unknowns = {unknown["id"]:unknown for candidate in answer["candidates"] for unknown in candidate["unknowns"]}
    methods = {method["id"]:method for method in answer["currentMethods"]}
    ensure_refs(decision["userFactIds"], set(user_facts), "invalid decision fact")
    ensure_refs(decision["claimIds"], set(claims), "invalid decision claim")
    ensure_refs(decision["alternativeClaimIds"], set(claims), "invalid alternative claim")
    ensure_refs(decision["alternativeCandidateIds"], set(candidates), "invalid alternative")
    ensure_refs(decision["currentMethodIds"], set(methods), "invalid current method")
    ensure_refs(decision["unknownIds"], set(unknowns), "invalid decision unknown")
    if answer["status"] == "hold":
        if decision["action"] != "research_hold" or decision["targetCandidateId"] is not None: raise ContractError("invalid research hold")
        return answer
    if decision["action"] == "research_hold" or decision["targetCandidateId"] not in candidates: raise ContractError("ready answer needs target")
    target = candidates[decision["targetCandidateId"]]
    if (target["kind"] == "service_vendor" and decision["action"] not in VENDOR_ACTIONS) or (target["kind"] != "service_vendor" and decision["action"] not in PRODUCT_ACTIONS): raise ContractError("action kind mismatch")
    target_claims = {item["id"]:item for item in target["claims"]}
    target_unknowns = {item["id"]:item for item in target["unknowns"]}
    ensure_refs(decision["claimIds"], set(target_claims), "decision must use target evidence")
    ensure_refs(decision["unknownIds"], set(target_unknowns), "decision must use target evidence")
    if set(decision["unknownIds"]) != set(target_unknowns): raise ContractError("all target unknowns must be visible")
    alternatives = [candidates[item] for item in decision["alternativeCandidateIds"]]
    allowed_alternative_claims = {claim["id"]:claim for candidate in alternatives for claim in candidate["claims"]}
    ensure_refs(decision["alternativeClaimIds"], set(allowed_alternative_claims), "invalid alternative evidence")
    alternative_claims = [allowed_alternative_claims[item] for item in decision["alternativeClaimIds"]]
    if alternatives and not any(item["category"] == "capability" for item in alternative_claims): raise ContractError("alternative capability required")
    if QUANTIFIED.search(decision["statement"]): raise ContractError("unverified productivity number")
    used_claims = [target_claims[item] for item in decision["claimIds"]]
    categories = {item["category"] for item in used_claims}
    used_facts = [user_facts[item] for item in decision["userFactIds"]]
    used_gap_ids = {item["id"] for item in used_facts if item["category"] == "gap"}
    if decision["action"] in ACTIVE_ACTIONS:
        if not any(item["category"]=="need" for item in used_facts) or not any(item["category"]=="gap" for item in used_facts) or "capability" not in categories: raise ContractError("active action grounding")
    required = {
        "review_payment":{"capability","price","permission","data_handling","maintenance"},
        "trial_first":{"capability","trial","price","renewal","cancellation","permission","data_handling"},
        "request_proposal":{"identity","capability","process"},
    }.get(decision["action"], set())
    if not required.issubset(categories): raise ContractError("missing action evidence")
    if decision["action"] in {"review_payment","do_not_pay"} and alternatives and any(not used_gap_ids.intersection(item["userFactIds"]) for item in alternatives): raise ContractError("alternative must address decision gap")
    if decision["action"] == "review_payment" and target["unknowns"]: raise ContractError("payment unknowns remain")
    if decision["action"] == "review_payment" and not decision["currentMethodIds"] and not decision["alternativeCandidateIds"]: raise ContractError("payment review needs comparison")
    if decision["action"] == "review_payment" and decision["currentMethodIds"] and not any(item["category"] == "current_method" for item in used_facts): raise ContractError("payment comparison needs current method fact")
    if decision["action"] == "trial_first" and any(item["category"] in {"price","permission","data_handling","payment_terms","termination"} for item in target["unknowns"]): raise ContractError("trial safety unknowns remain")
    if decision["action"] == "request_proposal" and not target["unknowns"]: raise ContractError("proposal needs contract unknowns")
    if decision["action"] == "do_not_pay" and not decision["currentMethodIds"] and not decision["alternativeCandidateIds"]: raise ContractError("do not pay needs current method or alternative")
    if decision["action"] == "do_not_pay" and decision["currentMethodIds"] and not decision["alternativeCandidateIds"] and used_gap_ids: raise ContractError("current method cannot resolve stated gap")
    if decision["action"] in {"hold_payment","hold_contract"} and not decision["unknownIds"]: raise ContractError("hold needs typed unknown")
    return answer

TITLES = {
    "review_payment":"결제를 검토할 근거가 있습니다","trial_first":"무료 체험부터 확인하세요","hold_payment":"결제 조건을 더 확인해야 합니다","do_not_pay":"지금은 결제하지 않는 편이 낫습니다","request_proposal":"서면 제안서까지만 요청해 볼 수 있습니다","hold_contract":"계약 조건을 더 확인해야 합니다","research_hold":"공개 근거를 더 조사해야 합니다",
}

def render(answer: dict[str, Any]) -> dict[str, Any]:
    sources = {source["id"]:source for source in answer["sources"]}
    candidates = []
    for candidate in answer["candidates"]:
        candidates.append({**candidate,"claims":[{**claim,"sources":[sources[item] for item in claim["sourceIds"]],"sourceOwner":sources[claim["sourceIds"][0]]["owner"]} for claim in candidate["claims"]]})
    decision = answer["commitment"]
    target = next((item for item in candidates if item["id"]==decision["targetCandidateId"]),None)
    return {
        "action":decision["action"],"title":TITLES[decision["action"]],"statement":decision["statement"],"status":answer["status"],"workstream":answer["workstream"],"target":target,
        "alternatives":[next(item for item in candidates if item["id"]==candidate_id) for candidate_id in decision["alternativeCandidateIds"]],
        "currentMethods":[next(item for item in answer["currentMethods"] if item["id"]==method_id) for method_id in decision["currentMethodIds"]],
        "unknowns":[] if target is None else [next(item for item in target["unknowns"] if item["id"]==unknown_id) for unknown_id in decision["unknownIds"]],
        "candidates":candidates,"sources":answer["sources"],"discoverySources":answer["discoverySources"],"excluded":answer["excluded"],"limitations":answer["limitations"],
        "verificationNotice":"AI가 제시한 공개 출처의 형식과 연결을 검사했습니다. 원문 진위, 실제 효과, 계약 안전을 보장하지 않습니다.",
    }

def load() -> Any:
    try: return json.load(sys.stdin)
    except Exception as exc: raise ContractError("invalid JSON input") from exc

def main() -> int:
    if len(sys.argv)==2 and sys.argv[1] in {"-h","--help"}:
        print("usage: candidate_contract.py prepare|validate")
        return 0
    try:
        if len(sys.argv)!=2 or sys.argv[1] not in {"prepare","validate"}: raise ContractError("usage: candidate_contract.py prepare|validate")
        payload = load()
        if sys.argv[1]=="prepare":
            input_value = validate_input(payload, True)
            output = {"input":input_value,"packet":build_packet(input_value)}
        else:
            exchange = obj(payload, {"input","reply"}, "exchange")
            input_value = parse_full_input(exchange["input"])
            reply = text(exchange["reply"],"reply",1,128000)
            fence = re.fullmatch(r"\x60{3}(?:json)?\s*\n([\s\S]*?)\n\x60{3}",reply.strip(),re.I)
            try: raw_answer = json.loads(fence.group(1) if fence else reply.strip())
            except Exception as exc: raise ContractError("invalid answer JSON") from exc
            answer = validate_answer(input_value, raw_answer)
            output = {"view":render(answer)}
        json.dump(output,sys.stdout,ensure_ascii=False,separators=(",",":"))
        sys.stdout.write("\n")
        return 0
    except ContractError as exc:
        print("INVALID: "+str(exc),file=sys.stderr)
        return 2
    except Exception:
        print("INVALID: contract validation failed",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
