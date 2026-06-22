export const LOG_BUFFER = []
export const safeUid = uid => uid ? uid.slice(0, 8) + '…' : 'none'

export function L(anchor, ...args) {
  const now = new Date()
  const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0')
  const msg = args.map(a => {
    if (a === null || a === undefined) return String(a)
    if (typeof a !== 'object') return String(a)
    try { return JSON.stringify(a) } catch (_) { return '[obj]' }
  }).join(' ')
  const line = `[${ts}][${anchor}] ${msg}`
  LOG_BUFFER.push(line)
  if (LOG_BUFFER.length > 500) LOG_BUFFER.shift()
  console.debug(`%c${line}`, 'color:#64b5f6;font-size:11px')
}
