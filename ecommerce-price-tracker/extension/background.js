// DorAI's one network call: the product page's address and title go to the
// compare service, which answers with that product on every store. It runs
// here, not in the page, so the stores' pages never talk to DorAI directly.
const API = 'https://atikul-islam-portfolio.pages.dev/api/pp/compare'

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type !== 'compare') return false
  const url = `${API}?link=${encodeURIComponent(message.link)}&name=${encodeURIComponent(message.name ?? '')}`
  fetch(url)
    .then((response) => response.json())
    .then(reply)
    .catch(() => reply({ error: "Couldn't reach DorAI just now." }))
  return true // the reply comes later
})

// The toolbar icon: the full comparison for the page this tab is on, or DorAI itself.
const SITE = 'https://atikul-islam-portfolio.pages.dev/price-pulse/'
const STORE = /^https:\/\/(www\.)?(daraz\.com\.bd|cartup\.com|othoba\.com)\//i

chrome.action.onClicked.addListener((tab) => {
  const url = tab.url && STORE.test(tab.url) ? `${SITE}?link=${encodeURIComponent(tab.url.split(/[?#]/)[0])}` : SITE
  chrome.tabs.create({ url })
})
