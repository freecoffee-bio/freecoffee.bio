export function requestId(request: Request): string {
  return request.headers.get('x-request-id') || crypto.randomUUID();
}

export function publicError(message: string, status: number, id: string, retryAfter?: number): Response {
  return Response.json({ error: message, requestId: id }, {
    status,
    headers: { 'x-request-id': id, ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}) },
  });
}
