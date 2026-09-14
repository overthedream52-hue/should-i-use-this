import { z } from 'zod';
import { fitAnswerSchemaV3, fitInstructionsV3, renderFitAnswerV3, type FitInputV3 } from './subscription-fit-v3';

const factId = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
// Model-selected premises, not a machine certificate of their meaning.
export const adoptionBasisSchema = z.strictObject({
  needUserFactId: factId,
  gapUserFactId: factId,
  benefitFactId: factId,
});
export const fitAnswerSchemaV4 = fitAnswerSchemaV3.extend({ adoptionBasis: adoptionBasisSchema.nullable() });
export function renderFitAnswerV4(raw: unknown, input: FitInputV3) {
  // Legacy answers remain readable, but cannot establish the new adoption basis.
  const current = typeof raw === 'object' && raw !== null && Object.hasOwn(raw, 'adoptionBasis');
  const parsed = current ? fitAnswerSchemaV4.parse(raw) : { ...fitAnswerSchemaV3.parse(raw), adoptionBasis: null };
  const { adoptionBasis, ...answer } = parsed;
  if (answer.decision !== 'consider' && adoptionBasis) throw new Error('unexpected adoption basis');
  const view = renderFitAnswerV3(answer, input);
  if (adoptionBasis) {
    const need = answer.userFacts.find(f => f.id === adoptionBasis.needUserFactId);
    const gap = answer.userFacts.find(f => f.id === adoptionBasis.gapUserFactId);
    const benefit = answer.facts.find(f => f.id === adoptionBasis.benefitFactId && f.category === 'feature');
    const connected = answer.judgments.some(j => j.userFactIds.includes(adoptionBasis.needUserFactId) && j.userFactIds.includes(adoptionBasis.gapUserFactId) && j.factIds.includes(adoptionBasis.benefitFactId));
    if (!need || !gap || !benefit || !connected) throw new Error('invalid adoption basis');
  }
  const deferred = answer.decision === 'consider' && !adoptionBasis;
  return {
    ...view,
    decision: deferred ? 'hold' as const : answer.decision,
    modelDecision: answer.decision,
    adoptionBasis,
    adoptionNotice: deferred ? '내 상황에서 해결할 문제와 현재 방식보다 나은 점의 근거가 연결되지 않아 도입 판단을 보류합니다. AI의 원래 설명은 아래에서 확인할 수 있습니다.' : null,
  };
}

const previousDecisionRule = 'consider=목적에 관련된 기능으로 검토 가치, skip=명시 제약/목적 충돌 또는 명시된 추가 이점 부재, hold=핵심 근거 부족. 추가로 필요한 확인이 있다는 이유만으로 관련 기능을 전부 배제하지 마세요.';
export const fitInstructionsV4 = fitInstructionsV3.replace(previousDecisionRule,
  'consider=사용자가 명시한 해결할 일/불편과 현재 방식의 부족함을 문서 기능이 메우는 근거가 함께 있을 때만 도입 후보. skip=명시 제약/목적 충돌 또는 명시된 추가 이점 부재. hold=필요성/추가 이점의 핵심 근거 부족. 단순 목적 관련성이나 가능성만으로 consider를 선택하지 마세요.') + `
추가 필드 adoptionBasis는 null 또는 {needUserFactId, gapUserFactId, benefitFactId}입니다. 사용자가 실제로 해결하려는 일/불편의 userFact, 현재 방식으로 안 되거나 부족하다고 명시한 userFact, 그 부족함을 메우는 문서 feature fact를 각각 선택합니다. 세 근거는 적어도 하나의 judgment에 함께 연결해야 합니다.
앱을 만들고 있다/도구가 궁금하다/어떤 도구를 쓴다/도입 가치나 중복을 알고 싶다는 말 자체는 해결되지 않는 문제가 아닙니다. '필요하다면 유용하다'의 조건을 충족한 사용자 사실이 없으면 adoptionBasis=null, decision=hold입니다. 현재 도구 이름만 보고 기능 부재·중복·숙련도를 만들어내지 마세요. userFacts에 없는 불편을 추가하거나 목적을 gap으로 바꾸지 마세요.
새 작업을 현재 방법으로 못 한다고 명시한 경우도 gap이 될 수 있습니다. 실제 설치·체험·시간 절감 실측은 요구하지 않습니다. 필요+현재 부족+관련 기능이 모두 있으면 기타 가격 등 부차적인 미확인이 있다는 이유만으로 전부 보류하지 마세요. 반대로 필요한 기능 자체가 문서에 없으면 hold입니다. 명시한 제약과 충돌하거나 현재 충분하여 추가 이점이 없다고 명시하면 skip을 유지합니다.
consider에는 adoptionBasis가 필요합니다. hold/skip에서는 adoptionBasis=null로 반환하세요. 지시한 명시 근거가 없으면 null을 반환해야 하며 억지로 ID를 채우지 마세요. 질문을 늘리거나 제품조사를 사용자에게 요구하지 마세요. 판단 제목과 본문도 같은 강도로 작성하세요. 구조 참조가 맞아도 의미를 증명하지 않는다는 기존 원칙을 유지하세요.`;
