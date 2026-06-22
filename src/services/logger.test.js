import { describe, it, expect, beforeEach } from 'vitest'
import { LOG_BUFFER, L, safeUid } from './logger.js'

beforeEach(() => {
  LOG_BUFFER.length = 0
})

describe('safeUid', () => {
  it('truncates to 8 chars with ellipsis', () => {
    expect(safeUid('abcdefghijk')).toBe('abcdefgh…')
  })

  it('returns "none" for falsy', () => {
    expect(safeUid(null)).toBe('none')
    expect(safeUid('')).toBe('none')
    expect(safeUid(undefined)).toBe('none')
  })
})

describe('L', () => {
  it('appends to LOG_BUFFER', () => {
    L('test', 'hello world')
    expect(LOG_BUFFER).toHaveLength(1)
    expect(LOG_BUFFER[0]).toContain('[test]')
    expect(LOG_BUFFER[0]).toContain('hello world')
  })

  it('caps buffer at 500 entries', () => {
    for (let i = 0; i < 510; i++) L('x', i)
    expect(LOG_BUFFER.length).toBe(500)
  })

  it('serializes objects with JSON.stringify', () => {
    L('test', { foo: 1 })
    expect(LOG_BUFFER[0]).toContain('{"foo":1}')
  })

  it('handles null and undefined gracefully', () => {
    L('test', null, undefined)
    expect(LOG_BUFFER[0]).toContain('null undefined')
  })
})
