import { boundedText, RequestError } from './request';

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin || !host || (fetchSite && fetchSite !== 'same-origin')) {
    throw new RequestError('이 페이지와 같은 주소에서만 사용할 수 있습니다.', 403);
  }
  try {
    const browser = new URL(origin);
    if (!['http:', 'https:'].includes(browser.protocol) || browser.origin !== origin || browser.host.toLowerCase() !== host.toLowerCase()) {
      throw new Error('origin mismatch');
    }
  } catch {
    throw new RequestError('이 페이지와 같은 주소에서만 사용할 수 있습니다.', 403);
  }
}

export async function sameOriginJson(request: Request, limit = 131072) {
  sameOrigin(request);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new RequestError('JSON 입력이 필요합니다.');
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  try {
    return JSON.parse(await boundedText(request.body, limit, signal)) as unknown;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('입력을 읽지 못했습니다. 형식을 확인해 주세요.');
  }
}
