"""Compact wire boundary; deterministic expansion, no model answer repair."""
import json
from pathlib import Path
import re

# ECMAScript WhiteSpace + LineTerminator (String.trim); Python strip differs.
JS_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
def js_trim(value):
    return value.strip(JS_WHITESPACE)

REFERENCES = Path(__file__).resolve().parent.parent / 'references'
SCHEMA = json.loads((REFERENCES / 'candidate-compact-schema.json').read_text())
POLICY = json.loads((REFERENCES / 'candidate-compact-policy.json').read_text())


def check(value, schema):
    """Validate the generated schema's closed, deliberately small keyword subset."""
    allowed = {'$schema','type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','const','enum','anyOf'}
    if set(schema) - allowed:
        raise ValueError('unsupported compact schema keyword')
    if 'anyOf' in schema:
        for option in schema['anyOf']:
            try:
                return check(value, option)
            except ValueError:
                pass
        raise ValueError('invalid compact union')
    kind = schema.get('type')
    if kind == 'object':
        if not isinstance(value, dict) or not set(schema.get('required', [])).issubset(value) or set(value) - set(schema['properties']):
            raise ValueError('invalid compact object')
        value = {k: check(v, schema['properties'][k]) for k, v in value.items()}
    elif kind == 'array':
        if not isinstance(value, list) or not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', 100):
            raise ValueError('invalid compact array')
        value = [check(v, schema['items']) for v in value]
        if schema['items'].get('type') == 'integer' and len(set(value)) != len(value):
            raise ValueError('duplicate compact reference')
    elif kind == 'string':
        if not isinstance(value, str): raise ValueError('invalid compact text')
        # Mirrors Zod trim on prose; patterns on request keys/offer IDs remain exact.
        if 'minLength' in schema: value = js_trim(value)
        length = len(value.encode('utf-16-le')) // 2
        if not schema.get('minLength', 0) <= length <= schema.get('maxLength', 128000): raise ValueError('invalid compact length')
        if 'pattern' in schema and not re.fullmatch(schema['pattern'], value): raise ValueError('invalid compact pattern')
    elif kind == 'integer':
        if type(value) not in (int, float) or value != int(value) or not schema.get('minimum', 0) <= value <= schema.get('maximum', 9007199254740991): raise ValueError('invalid compact reference')
        value = int(value)
    elif kind == 'null':
        if value is not None: raise ValueError('invalid compact null')
    if 'const' in schema and value != schema['const']: raise ValueError('invalid compact constant')
    if 'enum' in schema and value not in schema['enum']: raise ValueError('invalid compact enum')
    return value


def expand(raw, packet):
    a = check(raw, SCHEMA)
    if a['requestKey'] != packet['inputHash'][:32]: raise ValueError('input binding mismatch')
    def at(items, n):
        if type(n) is not int or n < 1 or n > len(items): raise ValueError('invalid compact reference')
        return items[n-1]
    facts = [{'id':f'f{i+1}','category':f['category'],'statement':f['statement'],'userSpanIds':[at(packet['userSpans'],f['span'])['id']]} for i,f in enumerate(a['userFacts'])]
    def fact_ids(indices): return [at(facts,n)['id'] for n in indices]
    sources = [{**s,'id':f's{i+1}','retrievedAt':packet['asOf'],'appliesToCandidateIds':[]} for i,s in enumerate(a['sources'])]
    def source(n, cid):
        s = at(sources,n)
        if cid not in s['appliesToCandidateIds']: s['appliesToCandidateIds'].append(cid)
        return s
    candidates = []
    for i,c in enumerate(a['candidates']):
        cid=f'c{i+1}'; canonical=source(c['canonicalSource'],cid)
        claims=[]
        for j,cl in enumerate(c['claims']):
            s=source(cl['source'],cid)
            claims.append({'id':f'{cid}_cl{j+1}','category':cl['category'],'statement':cl['statement'],'sourceIds':[s['id']],'quote':cl['quote'],'scope':s['scope'],'offerId':s['offerId']})
        candidates.append({'id':cid,'name':c['name'],'kind':c['kind'],'role':c['role'],'canonicalUrl':canonical['url'],'canonicalSourceId':canonical['id'],'relation':c['relation'],'relationReason':c['relationReason'],'userFactIds':fact_ids(c['facts']),'claims':claims,'license':{'status':c['license']['status'],'spdxId':c['license']['spdxId'],'sourceIds':[source(n,cid)['id'] for n in c['license']['sources']]},'unknowns':[{**u,'id':f'{cid}_u{j+1}'} for j,u in enumerate(c['unknowns'])]})
    d=a['decision']; target=None if d['target'] is None else at(candidates,d['target'])
    alternatives=[at(candidates,n) for n in d['alternatives']]
    methods=[]
    for n in d['currentMethods']:
        f=at(facts,n)
        if f['category'] != 'current_method': raise ValueError('invalid current method')
        methods.append({'id':f'm{n}','statement':f['statement'],'userFactIds':[f['id']]})
    if target is None and d['claims']: raise ValueError('claims without target')
    decision={'targetCandidateId':target['id'] if target else None,'action':d['action'],'statement':d['statement'],'userFactIds':fact_ids(d['facts']),'claimIds':[at(target['claims'],n)['id'] for n in d['claims']],'alternativeCandidateIds':[c['id'] for c in alternatives],'alternativeClaimIds':[cl['id'] for c in alternatives for cl in c['claims'] if cl['category']=='capability'],'currentMethodIds':[m['id'] for m in methods],'unknownIds':[u['id'] for u in target['unknowns']] if target else [],'offerId':d['offerId'],'nextAction':d['nextAction']}
    if 'question' in d: decision['question']=d['question']
    return {'policyVersion':'candidate-policy-v3','id':packet['id'],'inputHash':packet['inputHash'],'asOf':packet['asOf'],'status':'hold' if d['action']=='research_hold' else 'ready','userFacts':facts,'workstream':{**a['workstream'],'userFactIds':[f['id'] for f in facts]},'sources':sources,'candidates':candidates,'currentMethods':methods,'discoverySources':[],'excluded':[],'commitment':decision,'limitations':a['limitations']}
