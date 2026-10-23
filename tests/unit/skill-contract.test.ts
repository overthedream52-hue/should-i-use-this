import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFitPacket } from '../../lib/subscription-fit-v3';
import { renderFitAnswerV4 } from '../../lib/subscription-fit-v4';

const skill = '.agents/skills/should-i-use-this';
const contract = `${skill}/scripts/fit_contract.py`;
const candidateContract = `${skill}/scripts/candidate_contract.py`;

function run(script: string, command: 'prepare' | 'validate', value: unknown) {
  return spawnSync('python3', [script, command], {
    cwd: process.cwd(),
    input: JSON.stringify(value),
    encoding: 'utf8',
  });
}

const input = {
  id: '00000000-0000-4000-8000-000000000001',
  tool: '조율 도구 🧭',
  source: '# Cloud\r\n제공자가 관리합니다. 🧭\r\n\r\n```sh\r\n# 제목 아님\r\n```\r\n## 제한\r\n유료 요금제가 필요합니다.\r\n',
  situation: '여러 작업을 조율해야 하지만 현재 방식으로는 할 수 없습니다. 🧭',
};

function candidate() {
  return {
    id: input.id,
    inputHash: buildFitPacket(input).inputHash,
    decision: 'consider',
    facts: [
      { id: 'managed', category: 'feature', statement: 'Cloud는 제공자가 관리한다.', spanIds: ['S1'] },
      { id: 'paid', category: 'requirement', statement: '유료 요금제가 필요하다.', spanIds: ['S2'] },
    ],
    userFacts: [
      { id: 'need', statement: '여러 작업 조율이 필요하다.', spanIds: ['U1'] },
      { id: 'gap', statement: '현재 방식으로는 조율할 수 없다.', spanIds: ['U1'] },
    ],
    judgments: [{ statement: '현재 부족한 조율을 지원하므로 도입 후보이다.', factIds: ['managed'], userFactIds: ['need', 'gap'] }],
    burdenFactIds: ['paid'],
    unknowns: ['실제 업무 시간 절감'],
    questionCode: null,
    adoptionBasis: { needUserFactId: 'need', gapUserFactId: 'gap', benefitFactId: 'managed' },
  };
}

describe('portable skill contract', () => {
  it('offers command help without treating discovery as invalid input', () => {
    const result = spawnSync('python3', [contract, '--help'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('prepare');
    expect(result.stdout).toContain('validate');
  });

  it('prepares the same UTF-16 packet as the web contract', () => {
    const result = run(contract, 'prepare', input);
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout);
    expect(prepared.input).toEqual(input);
    expect(prepared.packet).toEqual(buildFitPacket(input));
  });

  it('renders the same grounded adoption decision as the web contract', () => {
    const answer = candidate();
    const result = run(contract, 'validate', { input, reply: `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`` });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).view).toEqual(renderFitAnswerV4(answer, input));
  });

  it('rejects stale, forged, disconnected and extra-field answers without echoing private input', () => {
    const answer = candidate();
    const cases = [
      { input: { ...input, source: `${input.source}changed` }, reply: JSON.stringify(answer) },
      { input, reply: JSON.stringify({ ...answer, facts: [{ ...answer.facts[0], spanIds: ['S999'] }] }) },
      { input, reply: JSON.stringify({ ...answer, judgments: [{ ...answer.judgments[0], userFactIds: ['need'] }] }) },
      { input, reply: JSON.stringify({ ...answer, decision: 'hold' }) },
      { input, reply: JSON.stringify({ ...answer, decision: 'skip' }) },
      { input, reply: JSON.stringify({ ...answer, unexpected: 'private-marker' }) },
    ];
    for (const value of cases) {
      const result = run(contract, 'validate', value);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('INVALID:');
      expect(result.stderr).not.toContain('private-marker');
      expect(result.stderr).not.toContain('여러 작업');
    }
  });

  it('runs after copying only the skill directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'should-i-use-this-skill-'));
    cpSync(skill, join(root, 'should-i-use-this'), { recursive: true });
    const copied = join(root, 'should-i-use-this/scripts/fit_contract.py');
    const result = run(copied, 'prepare', input);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).packet.inputHash).toBe(buildFitPacket(input).inputHash);
    expect(readFileSync(join(root, 'should-i-use-this/SKILL.md'), 'utf8')).toContain('name: should-i-use-this');
    expect(readFileSync(join(root, 'should-i-use-this/scripts/candidate_contract.py'), 'utf8')).toContain('research_hold');
  });

  it('routes URLs, lists, paid products and vendors through the candidate contract', () => {
    const body = readFileSync(`${skill}/SKILL.md`, 'utf8');
    const reference = readFileSync(`${skill}/references/candidate-contract.md`, 'utf8');
    expect(body).toContain('candidate_contract.py');
    expect(body).toContain('service vendor');
    expect(reference).toContain('discovery source only');
    expect(reference).toContain('free/open-source alternatives');
    expect(reference).toContain('request_proposal');
    expect(reference).toContain('source-code ownership');
    expect(reference).toContain('vendor_claim');
    expect(reference).toContain('Ask at most one short question');
  });

  it('offers candidate contract help as a portable script', () => {
    const result = spawnSync('python3', [candidateContract, '--help'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('prepare|validate');
  });
});
