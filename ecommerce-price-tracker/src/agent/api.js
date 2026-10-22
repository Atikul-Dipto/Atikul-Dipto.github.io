// The shopping agent runs as a Cloudflare Pages Function on the Cloudflare
// copy of the site (functions/api/pp/ at the repo root, code in ../worker/);
// both copies of this page call it there. VITE_AGENT_API points development
// at a preview deployment instead.
export const AGENT_API = import.meta.env.VITE_AGENT_API ?? 'https://atikul-islam-portfolio.pages.dev/api/pp'

async function getJson(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `The agent answered ${response.status}.`)
  return data
}

// name: a product, searched exactly as typed. details: what they need (the only text the AI reads).
export const askAgent = ({ name, details }, signal) =>
  fetch(`${AGENT_API}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, details }),
    signal,
  }).then(getJson)

export const getVouchers = () => fetch(`${AGENT_API}/vouchers`).then(getJson)
export const getStats = () => fetch(`${AGENT_API}/stats`).then(getJson)
