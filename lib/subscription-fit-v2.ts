import { z } from 'zod';
import { fitInstructions, renderFitQuestion, type FitQuestionContext } from './subscription-fit';

// Candidate only. v1 and its frozen experiments remain reproducible.
const text = z.string().trim().min(1).max(400);
const id = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
const refs = z.array(id).max(6);
export const fitAnswerSchemaV2 = z.strictObject({
  id: z.string().min(1),
  decision: z.enum(['consider', 'hold', 'skip']),
  facts: z.array(z.strictObject({ id, category: z.enum(['feature', 'requirement']), statement: text, quote: z.string().min(1).max(1500) })).max(6),
  userFacts: z.array(z.strictObject({ id, statement: text, quote: z.string().min(1).max(1000) })).max(4),
  judgments: z.array(z.strictObject({ statement: text, factIds: refs, userFactIds: refs })).min(1).max(3),
  burdenFactIds: refs,
  unknowns: z.array(text).max(3),
  questionCode: z.enum(['goal', 'constraint']).nullable(),
});
export type FitAnswerV2 = z.infer<typeof fitAnswerSchemaV2>;

// Reference and quote validity is structural evidence, not semantic entailment.
export function validateFitAnswerV2(value: unknown, input: { id: string; source: string; situation: string }): FitAnswerV2 {
  const answer = fitAnswerSchemaV2.parse(value);
  if (answer.id !== input.id) throw new Error('case mismatch');
  const facts = new Map(answer.facts.map(f => [f.id, f]));
  const users = new Set(answer.userFacts.map(f => f.id));
  const ids = [...answer.facts, ...answer.userFacts].map(f => f.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate fact id');
  for (const [rows, original] of [[answer.facts, input.source], [answer.userFacts, input.situation]] as const) {
    if (rows.some(f => !f.quote.trim() || !original.includes(f.quote))) throw new Error('unbound quote');
  }
  const validRefs = (values: string[], exists: (value: string) => boolean) => new Set(values).size === values.length && values.every(exists);
  for (const judgment of answer.judgments) {
    if (!validRefs(judgment.factIds, ref => facts.has(ref)) || !validRefs(judgment.userFactIds, ref => users.has(ref))) throw new Error('invalid premise reference');
    if (answer.decision !== 'hold' && (!judgment.factIds.length || !judgment.userFactIds.length)) throw new Error('missing recommendation premises');
  }
  if (!validRefs(answer.burdenFactIds, ref => facts.get(ref)?.category === 'requirement')) throw new Error('burden must reference documented requirement');
  return answer;
}

export function renderFitAnswerV2(answer: FitAnswerV2, context: FitQuestionContext) {
  return {
    decision: answer.decision,
    facts: answer.facts.map(f => ({ ...f, label: '문서의 설명' })),
    userFacts: answer.userFacts.map(f => ({ ...f, label: '사용자가 알려준 상황' })),
    judgments: answer.judgments.map(j => ({ text: `예상 판단: ${j.statement}`, factIds: [...j.factIds], userFactIds: [...j.userFactIds] })),
    burdens: answer.burdenFactIds.map(ref => ({ text: `문서에 명시: ${answer.facts.find(f => f.id === ref)!.statement}`, factId: ref })),
    unknowns: answer.unknowns.map(item => `제공 자료에서 미확인: ${item}`),
    question: renderFitQuestion(answer.questionCode, context),
  };
}

// Reuse the established condition/question rules, replace only the v1 output instructions.
export const fitInstructionsV2 = fitInstructions.slice(0, fitInstructions.indexOf('\nreason은')) + `
출력은 facts, userFacts, judgments, burdenFactIds, unknowns, questionCode로 분리합니다. v1의 reason/burden/quotes 필드는 쓰지 않습니다.
facts: 제공 source에서 확인한 제품 설명만. 각 statement는 하나의 원자적 주장이고 quote는 그것을 뒷받침하는 충분한 조건을 포함한 source의 연속 원문입니다. category=feature는 기능/특성, requirement는 설치·운영·제한·유료/선택 조건 등 문서에 명시된 요구사항입니다. 로컬 저장 기능에서 기기/저장공간 부담을 추정해 requirement로 넣지 마세요. 다른 설치 경로/기능 조건을 합치지 마세요. 공식 문서의 홍보 수치/보안 보장은 독립 실측으로 단정하지 말고 문서 주장임을 밝히거나 제외합니다.
userFacts: situation에 명시된 사용자 상황만. quote는 situation 원문이며 제품 문서 인용과 섞지 마세요. 각 fact/userFact에는 전체에서 중복되지 않는 짧은 영문 소문자 id를 붙입니다.
judgments: facts와 userFacts를 비교한 예상 판단만, 관련 factIds/userFactIds를 연결합니다. consider/skip 각 판단에는 제품 근거와 사용자 근거 모두 최소 하나가 있어야 합니다. hold는 자료 부재 자체를 이유로 참조가 없을 수 있습니다. 추론이라고 표시해도 없는 기능/조건을 상상해도 되는 것은 아닙니다. 기능 자료 없이 설치 제약만 있으면 목적 관련성은 미확인으로 두고 해당 제약 충돌만 설명하세요. 실제 써서 효과가 입증되었다고 말하지 마세요.
burdenFactIds: 사용자 판단에 관련된 문서 requirement 사실 id만. 이점/추측을 넣지 마세요. 명시 요구사항이 없다면 빈 배열; 부담이 없다고 검증했다는 의미는 아닙니다. 선택 기능의 요구사항에는 그 선택 조건을 유지합니다.
unknowns: 결정에 필요한데 제공 자료로 알 수 없는 항목만, 제품의 부재/의무 단정 및 조사 요청 금지. 부족한 정보가 사용자가 이미 준 내용이면 다시 미확인으로 만들지 마세요. 질문은 기존 코드 규칙을 유지합니다. 출력 전체를 한국어로 짧게 작성하세요.`;
