/**
 * Shared OneBot message utilities
 */

/**
 * Convert a CQ code string to array segment format.
 * @param {string} cq
 * @returns {Array}
 */
export function cqToArray(cq) {
  if (!cq || typeof cq !== 'string') return []
  const result = []
  const regex = /\[CQ:([^,\]]+)((?:,[^,\]]+=[^,\]]*)*)\]|([^\[]+)/g
  let match
  while ((match = regex.exec(cq)) !== null) {
    if (match[3]) {
      result.push({ type: 'text', data: { text: match[3] } })
    } else {
      const type = match[1]
      const params = {}
      if (match[2]) {
        match[2].slice(1).split(',').forEach(p => {
          const [k, v] = p.split('=')
          if (k) params[k] = v
        })
      }
      result.push({ type, data: params })
    }
  }
  return result.length ? result : [{ type: 'text', data: { text: cq } }]
}
