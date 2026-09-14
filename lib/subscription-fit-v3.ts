import { z } from 'zod';
import { fitAnswerSchemaV2 } from './subscription-fit-v2';
import { fitInstructions, renderFitQuestion } from './subscription-fit';
import { sha256Hex } from './sha256';

// Shared packet contract used by the browser flow and the portable skill tests.
const inputSchema = z.strictObject({ id: z.string().min(1).max(128), source: z.string().max(32000), situation: z.string().max(4000), tool: z.string().max(200).optional(), answeredQuestions: z.array(z.string().max(32)).max(8).optional() });
export type FitInputV3 = z.infer<typeof inputSchema>;
export type SourceSpan = { id: string; start: number; end: number; text: string; contextIds: string[] };

// Whole sections preserve table columns, lists, and applicability paragraphs.
// Unsupported heading styles remain in a larger span rather than being truncated.
function sectionSpans(source: string): SourceSpan[] {
  if (!source.trim()) return [];
  const cuts = [{ start: 0, level: 0 }];
  let offset = 0;
  let fence: { char: string; length: number } | null = null;
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const syntax = line.replace(/\r?\n$/, '');
    const marker = syntax.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (!fence) {
      const heading = syntax.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)/);
      if (heading) {
        if (offset === 0) cuts[0].level = heading[1].length;
        else cuts.push({ start: offset, level: heading[1].length });
      }
    }
    offset += line.length;
  }
  if (cuts.length > 64) throw new Error('too many source sections');
  const parents: { id: string; level: number }[] = [];
  return cuts.map((cut, i) => {
    while (parents.length && parents.at(-1)!.level >= cut.level) parents.pop();
    const span = { id: `S${i + 1}`, start: cut.start, end: cuts[i + 1]?.start ?? source.length, text: source.slice(cut.start, cuts[i + 1]?.start ?? source.length), contextIds: parents.map(p => p.id) };
    parents.push({ id: span.id, level: cut.level });
    return span;
  });
}

export function buildFitPacket(value: FitInputV3) {
  const input = inputSchema.parse(value);
  const bound = { id: input.id, source: input.source, situation: input.situation, tool: input.tool ?? '', answeredQuestions: input.answeredQuestions ?? [] };
  return {
    id: input.id, tool: bound.tool, offsetUnit: 'utf16' as const,
    inputHash: sha256Hex(JSON.stringify(bound)),
    sourceSpans: sectionSpans(input.source),
    userSpans: input.situation.trim() ? [{ id: 'U1', start: 0, end: input.situation.length, text: input.situation, contextIds: [] } satisfies SourceSpan] : [],
    answeredQuestions: bound.answeredQuestions,
  };
}

export const fitAnswerSchemaV3 = fitAnswerSchemaV2.extend({
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  facts: z.array(fitAnswerSchemaV2.shape.facts.element.omit({ quote: true }).extend({ spanIds: z.array(z.string().regex(/^S[1-9]\d*$/)).min(1).max(4) })).max(6),
  userFacts: z.array(fitAnswerSchemaV2.shape.userFacts.element.omit({ quote: true }).extend({ spanIds: z.array(z.literal('U1')).min(1).max(1) })).max(4),
});
export type FitAnswerV3 = z.infer<typeof fitAnswerSchemaV3>;

export function validateFitAnswerV3(raw: unknown, input: FitInputV3): FitAnswerV3 {
  const answer = fitAnswerSchemaV3.parse(raw);
  const packet = buildFitPacket(input);
  if (answer.id !== packet.id || answer.inputHash !== packet.inputHash) throw new Error('input binding mismatch');
  const ids = [...answer.facts, ...answer.userFacts].map(f => f.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate fact id');
  const refsValid = (refs: string[], allowed: Set<string>) => new Set(refs).size === refs.length && refs.every(id => allowed.has(id));
  for (const [facts, spans] of [[answer.facts, packet.sourceSpans], [answer.userFacts, packet.userSpans]] as const) {
    const allowed = new Set(spans.map(s => s.id));
    if (facts.some(f => !refsValid(f.spanIds, allowed))) throw new Error('invalid source span');
  }
  const facts = new Set(answer.facts.map(f => f.id));
  const users = new Set(answer.userFacts.map(f => f.id));
  for (const j of answer.judgments) {
    if (!refsValid(j.factIds, facts) || !refsValid(j.userFactIds, users)) throw new Error('invalid premise reference');
    if (answer.decision !== 'hold' && (!j.factIds.length || !j.userFactIds.length)) throw new Error('missing recommendation premises');
  }
  if (!refsValid(answer.burdenFactIds, new Set(answer.facts.filter(f => f.category === 'requirement').map(f => f.id)))) throw new Error('burden must reference a documented requirement');
  return answer;
}

// Rebuild from trusted input at display time; never accept model-supplied text/offsets.
export function renderFitAnswerV3(raw: unknown, input: FitInputV3) {
  const answer = validateFitAnswerV3(raw, input);
  const packet = buildFitPacket(input);
  const cite = (ids: string[], spans: SourceSpan[]) => ids.map(id => {
    const s = spans.find(s => s.id === id)!;
    return { ...s, context: s.contextIds.map(id => ({ ...spans.find(s => s.id === id)! })) };
  });
  return {
    decision: answer.decision, inputHash: packet.inputHash, offsetUnit: packet.offsetUnit,
    facts: answer.facts.map(f => ({ ...f, label: '문서의 설명', citations: cite(f.spanIds, packet.sourceSpans) })),
    userFacts: answer.userFacts.map(f => ({ ...f, label: '사용자가 알려준 상황', citations: cite(f.spanIds, packet.userSpans) })),
    judgments: answer.judgments.map(j => ({ text: `예상 판단: ${j.statement}`, factIds: [...j.factIds], userFactIds: [...j.userFactIds] })),
    burdens: answer.burdenFactIds.map(id => ({ text: `문서에 명시: ${answer.facts.find(f => f.id === id)!.statement}`, factId: id })),
    unknowns: answer.unknowns.map(s => `제공 자료에서 미확인: ${s}`),
    question: renderFitQuestion(answer.questionCode, { purpose: input.situation, answeredQuestions: input.answeredQuestions ?? [] }),
  };
}

export const fitInstructionsV3 = fitInstructions.slice(0, fitInstructions.indexOf('\nreason은')) + `
입력 sourceSpans는 프로그램이 만든 공개 원문 구절, userSpans는 사용자 진술입니다. 각 구절은 원문 text와 문맥 contextIds를 제공합니다. sourceSpans를 source, userSpans를 situation으로 읽되 문맥 구절도 함께 확인하세요.
반환할 필드: id/inputHash(입력 그대로), decision, facts, userFacts, judgments, burdenFactIds, unknowns, questionCode. 인용문을 복사/재작성하지 마세요. quote/text/offset을 출력에 추가하지 마세요.
facts: id, category(feature 또는 requirement), statement, spanIds. statement 하나는 원자적 주장 하나입니다. 그것을 전부 뒷받침하는 sourceSpans ID를 선택합니다. 복수 주장으로 나누고 각 근거를 연결하세요. 구절 안 표의 제목/열/행과 부정·선택 조건을 보존하고 다른 열/제품/설치 경로로 확대하지 마세요. 부모 contextIds의 적용 조건도 유지하세요. 문서가 Claude Code에서만 설명한 행동을 Codex 일반 사실로 바꾸지 마세요. self-learning memory는 세션 간 영속 기억을 뜻한다고 추정하지 마세요. 홍보 문구/성능 주장은 문서 설명으로 한정합니다.
userFacts: id, statement, spanIds(U1만). 명시된 상황만 진술하고 제품 기능과 혼동하지 않습니다. source/user fact ID는 전체에서 중복되지 않는 소문자 영문 ID입니다.
judgments: statement, factIds, userFactIds. 사실과 사용자 상황을 비교한 예상 판단이며 코드가 예상 판단으로 표시합니다. consider/skip 각 판단에는 양쪽 근거 모두 필요합니다. hold는 자료 부재 자체를 이유로 참조가 비어도 됩니다. 추론 표시가 없는 기능을 상상할 허가는 아닙니다.
burdenFactIds: 문서에 실제 명시된 설치/비용/운영/제한 조건 category=requirement만 참조. 기능 이점이나 당연해 보이는 기기/저장공간 추정을 부담으로 넣지 않습니다. 조건이 없다면 빈배열. 선택 기능의 요구사항은 그 기능을 선택할 때만 적용합니다.
unknowns: 자료에 없지만 판단에 필요한 정보만. 미확인을 기능 부재로 확정하거나 사용자에게 제품정보 조사를 요구하지 마세요. 알려준 상황은 다시 묻지 마세요. 한국어로 짧게 작성하세요. 올바른 ID를 선택한 것만으로 statement의 의미가 정확해지는 것은 아니므로 선택한 구절+문맥이 statement 전체를 지지하는지 확인하세요.`;
