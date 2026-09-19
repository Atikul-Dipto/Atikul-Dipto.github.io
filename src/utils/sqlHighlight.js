// Tiny SQL tokenizer for the showcase — enough to colour keywords, strings,
// comments, numbers and function calls without pulling in a highlighter lib.

const KEYWORDS = new Set(
  `select from where and or not in is null as with window partition by order
   group having limit offset join left right inner outer full on using over
   rows between preceding current row following unbounded case when then else
   end distinct union all interval filter within asc desc nulls first last
   exists`.split(/\s+/),
)

const TYPES = new Set(['numeric', 'date', 'int', 'integer', 'text', 'epoch', 'day', 'hours', 'days'])

const TOKEN_RE =
  /(--[^\n]*)|('(?:[^'\\]|\\.)*')|("[^"]*")|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)(?=\s*\()|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)|(::|->>|->|[(),;.*/+\-<>=]+)|(\s+)|(.)/g

export function tokenizeSql(sql) {
  const out = []
  let m
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(sql)) !== null) {
    const [text, comment, str, quoted, num, fn, word, punct] = m
    let type = 'plain'
    if (comment) type = 'comment'
    else if (str) type = 'string'
    else if (quoted) type = 'ident'
    else if (num) type = 'number'
    else if (fn) type = KEYWORDS.has(fn.toLowerCase()) ? 'keyword' : 'function'
    else if (word) {
      const lower = word.toLowerCase()
      if (KEYWORDS.has(lower)) type = 'keyword'
      else if (TYPES.has(lower)) type = 'type'
    } else if (punct) type = 'punct'
    out.push({ type, text })
  }
  return out
}
