/** Response helpers shared by the Price Pulse endpoints in functions/api/pp/. */

// Same origins as the silo's citizens register: both copies of the site, plus local dev.
const ALLOWED = [/^https:\/\/atikul-dipto\.github\.io$/, /^https:\/\/([a-z0-9-]+\.)?atikul-islam-portfolio\.pages\.dev$/, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/]

export function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? ''
  if (!ALLOWED.some((re) => re.test(origin))) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

export const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(request) },
  })

export const preflight = ({ request }: { request: Request }) => new Response(null, { status: 204, headers: cors(request) })
