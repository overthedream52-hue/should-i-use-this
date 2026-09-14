import { errorResponse, noStore, RequestError } from '../../../lib/request';
import { sameOriginJson } from '../../../lib/same-origin-request';
import { importTransfer, prepareTransfer, transferRequest } from '../../../lib/subscription-transfer';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const parsed = transferRequest.safeParse(await sameOriginJson(request, 512 * 1024));
    if (!parsed.success) throw new RequestError('입력 길이와 형식을 확인해 주세요. 문서 32,000자·상황 4,000자·답변 64,000자까지 가능합니다.');
    const data = parsed.data;
    try {
      const result = data.action === 'prepare'
        ? prepareTransfer({ tool: data.tool, source: data.source, situation: data.situation })
        : importTransfer(data.input, data.reply);
      return Response.json(result, { headers: noStore });
    } catch {
      throw new RequestError(data.action === 'import'
        ? '이 분석의 답변인지 확인해 주세요. AI가 반환한 JSON 전체를 붙여넣어야 하며, 입력과 근거가 일치해야 합니다.'
        : '문서의 구절이 너무 많거나 자료를 준비하지 못했습니다. 하나의 완전한 문서로 다시 시도해 주세요.', 422);
    }
  } catch (error) { return errorResponse(error); }
}
