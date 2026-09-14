export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const noStore = { 'Cache-Control': 'no-store' };

export async function boundedText(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal?: AbortSignal,
) {
  if (!stream) throw new RequestError('응답이나 입력이 비어 있습니다.');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError('입력 또는 응답이 허용 크기를 넘었습니다.', 413);
      }
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(data);
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function errorResponse(error: unknown) {
  return Response.json(
    { error: error instanceof RequestError ? error.message : '처리하지 못했습니다. 다시 시도해 주세요.' },
    { status: error instanceof RequestError ? error.status : 500, headers: noStore },
  );
}
