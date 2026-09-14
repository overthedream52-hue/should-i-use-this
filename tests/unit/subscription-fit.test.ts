import { describe, expect, it } from 'vitest';
import * as fit from '../../lib/subscription-fit';
const answer = { id: 'one', decision: 'hold', reason: '자료 부족', burden: '미확인', unknown: '기능 미확인', questionCode: null, quotes: [] };
describe('subscription question contract', () => {
  it('rejects product research and arbitrary question fields', () => {
    expect(fit.fitAnswerSchema.safeParse({ ...answer, questionCode: 'research_product' }).success).toBe(false);
    expect(fit.fitAnswerSchema.safeParse({ ...answer, question: '기능을 조사해 주세요' }).success).toBe(false);
  });
  it('does not ask a goal the user already supplied', () => {
    expect(fit.renderFitQuestion('goal', { purpose: '보고서 작성', answeredQuestions: [] })).toBeNull();
  });
  it('does not repeat an answered constraint', () => {
    expect(fit.renderFitQuestion('constraint', { purpose: '보고서 작성', answeredQuestions: ['constraint'] })).toBeNull();
  });
  it('renders only user-owned missing information', () => {
    expect(fit.renderFitQuestion('goal', { purpose: '', answeredQuestions: [] })).toBe('어떤 일에 이 도구를 쓰고 싶으세요?');
    expect(fit.renderFitQuestion(null, { purpose: '', answeredQuestions: [] })).toBeNull();
  });
  it('binds output to the requested case and exact source', () => {
    expect(() => fit.validateFitAnswer({ ...answer, id: 'other' }, { id: 'one', source: '' })).toThrow();
    expect(() => fit.validateFitAnswer({ ...answer, quotes: ['invented'] }, { id: 'one', source: 'Real source.' })).toThrow();
    expect(() => fit.validateFitAnswer({ ...answer, quotes: ['개인 작업을 정리하고 싶다'] }, { id: 'one', source: 'Stores tasks.' })).toThrow();
    expect(fit.validateFitAnswer(answer, { id: 'one', source: '' }).decision).toBe('hold');
  });
});
