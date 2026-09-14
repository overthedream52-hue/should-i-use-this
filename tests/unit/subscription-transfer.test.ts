import { describe, expect, it } from 'vitest';
import { buildFitPacket } from '../../lib/subscription-fit-v3';
import { importTransfer, prepareTransfer } from '../../lib/subscription-transfer';

const fields = { tool: '도구', source: '# 조건\nCloud에서는 설치하지 않습니다.', situation: '' };

describe('subscription transfer browser boundary', () => {
  it('exports original source and schema then imports a fenced answer with trusted citations', () => {
    const prepared = prepareTransfer(fields);
    expect(prepared.prompt).toContain(fields.source.replaceAll('\n', '\\n'));
    expect(prepared.prompt).toContain('inputHash');
    const answer = {
      id: prepared.input.id,
      inputHash: buildFitPacket(prepared.input).inputHash,
      decision: 'hold',
      facts: [{ id: 'cloud', category: 'requirement', statement: 'Cloud에서는 설치하지 않습니다.', spanIds: ['S1'] }],
      userFacts: [],
      judgments: [{ statement: '사용 목적이 없어 판단을 보류합니다.', factIds: [], userFactIds: [] }],
      burdenFactIds: [],
      unknowns: [],
      questionCode: 'goal',
      adoptionBasis: null,
    };
    const result = importTransfer(prepared.input, `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``);
    expect(result.view.decision).toBe('hold');
    expect(result.view.facts[0].citations[0].text).toBe(fields.source);
    expect(() => importTransfer({ ...prepared.input, source: '다른 문서' }, JSON.stringify(answer))).toThrow();
  });

  it('rejects empty and over-limit input before preparing a prompt', () => {
    expect(() => prepareTransfer({ ...fields, source: ' ' })).toThrow();
    expect(() => prepareTransfer({ ...fields, situation: 'x'.repeat(4001) })).toThrow();
    expect(() => prepareTransfer({ ...fields, source: '한'.repeat(32001) })).toThrow();
  });

  it('handles Korean payloads at the response-validation boundary', () => {
    const prepared = prepareTransfer(fields);
    expect(() => importTransfer(
      { ...prepared.input, source: '한'.repeat(32000) },
      JSON.stringify({ unknowns: ['한'.repeat(60000)] }),
    )).toThrow();
  });

  it('rejects commentary, empty and oversized replies', () => {
    const prepared = prepareTransfer(fields);
    for (const reply of ['', '앞말 {"secret":"private-test"}', 'x'.repeat(64001)]) {
      expect(() => importTransfer(prepared.input, reply)).toThrow();
    }
  });
});
