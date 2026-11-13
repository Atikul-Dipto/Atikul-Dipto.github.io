import { newContact } from '../model/sections.ts'
import type { Contact, ContactKind } from '../model/types.ts'
import type { Line } from './geometry.ts'
import { flat, isPlace } from './text.ts'

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi
// A web address needs a scheme, a "www.", a path, or an ending people use for sites:
// "Node.js" and "B.Sc" must not pass for one.
const TLD = 'com|org|net|io|dev|me|co|ai|app|in|uk|bd|de|fr|ca|au|us|edu|gov|info|xyz|tech|page|site|ly|gg|sh|nl|se|no|es|it|pk|sg|nz|ch|at|be|ie|pt|br|jp|cn|ru|pl|za|ae|sa|ng|ke|lk|np|my|id|ph|vn|th|tr|eg|gr|cz|ro|hu|fi|dk|blog|design|studio|online|pro|cloud|codes|works|link|bio'
const URL_RE = new RegExp(`(?:https?://|www\\.)[^\\s|,;•·<>()]+|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLD})\\b(?:/[^\\s|,;•·<>()]*)?`, 'gi')
const PHONE = /(?:\+|\(?\d)[\d\s().-]{6,}\d/g
const LABEL = /^(?:e-?mail|mail|phone|mobile|cell|tel|telephone|contact(?:\s+no)?|address|location|linkedin|github|website|web|portfolio|site|url|blog|twitter|x|skype|whatsapp|nationality|date of birth|dob|born)\s*[:.-]?\s*/i

const digits = (s: string) => s.replace(/\D/g, '').length

/** "https://www.linkedin.com/in/name/" prints as "linkedin.com/in/name". */
export const prettyUrl = (url: string): string =>
  url
    .replace(/^mailto:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#]+$/, '')

const fullUrl = (text: string): string => (/^https?:\/\//i.test(text) ? text : `https://${text}`)

function urlKind(url: string): ContactKind {
  if (/linkedin\.com/i.test(url)) return 'linkedin'
  if (/github\.com|gitlab\.com/i.test(url)) return 'github'
  return 'website'
}

export interface ContactScan {
  contacts: Contact[]
  /** What was left of the lines once the contact details were lifted out. */
  rest: string[]
}

/**
 * Lifts email addresses, phone numbers, links and a place out of the lines
 * around a name. Links that sit behind a word ("LinkedIn") come from the
 * file's own link targets.
 */
export function scanContacts(lines: Line[]): ContactScan {
  const contacts: Contact[] = []
  const rest: string[] = []
  const have = new Set<string>()
  let fromLine: Contact[] = []
  const add = (kind: ContactKind, value: string, url = '') => {
    const id = `${kind}:${value.toLowerCase().replace(/\s+/g, '')}`
    if (!value || have.has(id)) return
    have.add(id)
    const contact = newContact(kind, value, url)
    contacts.push(contact)
    fromLine.push(contact)
  }

  for (const line of lines) {
    fromLine = []
    let text = line.text
    for (const m of text.match(EMAIL) ?? []) add('email', m, `mailto:${m}`)
    text = text.replace(EMAIL, '\t')
    for (const m of text.match(URL_RE) ?? []) {
      const clean = m.replace(/[.,;:]+$/, '')
      add(urlKind(clean), prettyUrl(clean), fullUrl(clean))
    }
    text = text.replace(URL_RE, '\t')
    for (const m of text.match(PHONE) ?? []) {
      const n = digits(m)
      // Not a pair of years, and long enough to ring.
      if (n >= 8 && n <= 15 && !/^(?:19|20)\d{2}\s*[-–.]\s*(?:19|20)\d{2}$/.test(m.trim())) {
        add('phone', m.trim())
        text = text.replace(m, '\t')
      }
    }
    // What the file links to is where the printed address really leads:
    // "linkedin.com/in/Name" on the page, the full profile address behind it.
    for (const link of line.links) {
      const kind: ContactKind | null = /^mailto:/i.test(link) ? 'email' : /^tel:/i.test(link) ? 'phone' : /^https?:/i.test(link) ? urlKind(link) : null
      if (!kind) continue
      const printed = fromLine.find((c) => c.kind === kind && c.url !== link)
      if (printed) printed.url = link
      else if (kind === 'phone') add('phone', link.replace(/^tel:/i, ''))
      else add(kind, prettyUrl(link), link)
    }
    // What remains, piece by piece: a place, or words that go back to the caller.
    for (const piece of text.split(/\t|\s+[|•·]\s+|\s{3,}|\s[–—]\s/)) {
      const raw = flat(piece).replace(/^[^\w(]+|[^\w)]+$/g, '')
      const value = raw.replace(LABEL, '').trim()
      if (!value) continue
      if (isPlace(value) || /^(?:address|location)\b/i.test(raw)) add('location', value)
      else if (value !== raw && value.length > 2 && !LABEL.test(`${value}:`)) add('other', raw)
      else if (!LABEL.test(`${raw}:`) && raw.length > 1) rest.push(raw)
    }
  }
  // A link the text and the file both give is one contact, not two.
  const byUrl = new Map<string, Contact>()
  const unique = contacts.filter((c) => {
    if (!c.url) return true
    const k = prettyUrl(c.url).toLowerCase()
    if (byUrl.has(k)) return false
    byUrl.set(k, c)
    return true
  })
  return { contacts: order(unique), rest }
}

const ORDER: ContactKind[] = ['email', 'phone', 'location', 'linkedin', 'github', 'website', 'other']
const order = (contacts: Contact[]): Contact[] => [...contacts].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))

/** Whether a line is made of contact details rather than words about the person. */
export function isContactLine(text: string): boolean {
  EMAIL.lastIndex = 0
  URL_RE.lastIndex = 0
  if (EMAIL.test(text) || URL_RE.test(text)) return true
  if (/^\s*(?:phone|mobile|cell|tel|telephone|e-?mail|address|location|linkedin|github|website|portfolio|nationality|date of birth|dob)\s*:/i.test(text)) return true
  const phone = text.match(PHONE)
  return !!phone && phone.some((m) => digits(m) >= 8) && text.replace(PHONE, '').replace(/[^A-Za-z]/g, '').length < 24
}
