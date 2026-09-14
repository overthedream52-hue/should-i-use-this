import { describe, expect, it } from 'vitest';
import { renderFitAnswerV4 } from '../../lib/subscription-fit-v4';
import { buildFitPacket } from '../../lib/subscription-fit-v3';

const input = {
  id: 'test',
  tool: '조율 도구',
  source: '# 기능\n여러 에이전트 작업을 조율합니다.\n# 설치\n설정 파일 추가가 필요합니다.',
  situation: '여러 작업의 조율이 필요하지만 현재 도구로는 할 수 없다.',
};

function candidate() {
  return {
    id: 'test',
    inputHash: buildFitPacket(input).inputHash,
    decision: 'consider',
    facts: [
      { id: 'feature', category: 'feature', statement: '여러 에이전트 조율을 지원한다.', spanIds: ['S1'] },
      { id: 'install', category: 'requirement', statement: '설정 파일 추가가 필요하다.', spanIds: ['S2'] },
    ],
    userFacts: [
      { id: 'need', statement: '여러 작업 조율이 필요하다.', spanIds: ['U1'] },
      { id: 'gap', statement: '현재 도구로는 조율할 수 없다.', spanIds: ['U1'] },
    ],
    judgments: [{
      statement: '현재 못 하는 작업 조율을 지원하므로 검토 가치가 있다.',
      factIds: ['feature'],
      userFactIds: ['need', 'gap'],
    }],
    burdenFactIds: ['install'],
    unknowns: [],
    questionCode: null,
    adoptionBasis: { needUserFactId: 'need', gapUserFactId: 'gap', benefitFactId: 'feature' },
  };
}

describe('adoption gate', () => {
  it('downgrades a legacy unsupported recommendation without rewriting its source', () => {
    const legacy = { ...candidate() };
    Reflect.deleteProperty(legacy, 'adoptionBasis');
    const view = renderFitAnswerV4(legacy, input);
    expect(view.decision).toBe('hold');
    expect(view.modelDecision).toBe('consider');
    expect(view.adoptionNotice).toContain('보류');
    expect(view.facts[0].citations[0].text).toBe(input.source.slice(0, view.facts[0].citations[0].end));
  });

  it('preserves supported consideration and never upgrades hold or skip', () => {
    expect(renderFitAnswerV4(candidate(), input).decision).toBe('consider');
    for (const decision of ['hold', 'skip']) {
      expect(renderFitAnswerV4({ ...candidate(), decision, adoptionBasis: null }, input).decision).toBe(decision);
    }
    expect(renderFitAnswerV4({ ...candidate(), adoptionBasis: null }, input).decision).toBe('hold');
  });

  it('rejects forged, requirement-only and disconnected adoption premises', () => {
    const answer = candidate();
    expect(() => renderFitAnswerV4({ ...answer, adoptionBasis: {} }, input)).toThrow();
    expect(() => renderFitAnswerV4({ ...answer, adoptionBasis: { ...answer.adoptionBasis, confirmed: true } }, input)).toThrow();
    expect(() => renderFitAnswerV4({ ...answer, adoptionBasis: { ...answer.adoptionBasis, gapUserFactId: 'missing' } }, input)).toThrow();
    expect(() => renderFitAnswerV4({
      ...answer,
      judgments: [{ ...answer.judgments[0], factIds: ['install'] }],
      adoptionBasis: { ...answer.adoptionBasis, benefitFactId: 'install' },
    }, input)).toThrow();
    expect(() => renderFitAnswerV4({
      ...answer,
      judgments: [{ ...answer.judgments[0], userFactIds: ['need'] }],
    }, input)).toThrow();
  });
});
