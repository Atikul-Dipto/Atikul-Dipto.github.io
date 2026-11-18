// The abuse filter shared by the citizens wall (api/citizens.ts) and the
// watch party lobby (api/watchparty.ts).

/**
 * Abuse, in English and Bangla (in both scripts). Whole words for the short
 * ones, so a name like Iqbal is never caught by a fragment of it.
 */
const WORDS = [
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'rapist', 'nazi', 'hitler', 'porn', 'sex', 'penis', 'vagina', 'motherfucker',
  'magi', 'khanki', 'chudi', 'chuda', 'choda', 'chod', 'chodi', 'bal', 'baal', 'haramjada', 'haramzada', 'haramjadi', 'shuor', 'shuorer', 'kuttar', 'bainchod', 'banchod', 'madarchod', 'madarchud', 'bhosdi', 'gandu', 'randi',
]
const FRAGMENTS = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'motherf', 'khanki', 'madarch', 'bainch', 'banch', 'haramj', 'haramz']
const BANGLA = ['মাগি', 'মাগী', 'খানকি', 'খানকী', 'চোদ', 'চুদ', 'বাল', 'হারামজাদা', 'হারামজাদি', 'শুয়োর', 'শূয়োর', 'কুত্তার', 'বেশ্যা', 'রান্ডি', 'বোকাচোদা']

export function abusive(name: string) {
  const plain = name
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[$5]/g, 's')
  const words = plain.split(/[^\p{L}\p{M}]+/u).filter(Boolean)
  if (words.some((w) => WORDS.includes(w))) return true
  const squashed = plain.replace(/[^\p{L}]/gu, '')
  if (FRAGMENTS.some((f) => squashed.includes(f))) return true
  return BANGLA.some((b) => name.includes(b))
}
