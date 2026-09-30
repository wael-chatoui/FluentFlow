import { describe, expect, it } from 'vitest'
import { isCrossSiteWrite } from '@/utils/api/sameOrigin'

const req = (method, headers = {}) => ({ method, headers })

describe('isCrossSiteWrite', () => {
  it('lets reads through whatever their origin', () => {
    expect(isCrossSiteWrite(req('GET', { 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })
  it('accepts writes from our own pages', () => {
    expect(isCrossSiteWrite(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(false)
    expect(isCrossSiteWrite(req('PATCH', { origin: 'https://fluent-flow-mu.vercel.app', host: 'fluent-flow-mu.vercel.app' }))).toBe(false)
  })
  it('rejects writes from another site or a sibling subdomain', () => {
    expect(isCrossSiteWrite(req('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(true)
    expect(isCrossSiteWrite(req('POST', { 'sec-fetch-site': 'same-site' }))).toBe(true)
    expect(isCrossSiteWrite(req('DELETE', { origin: 'https://evil.example', host: 'fluent-flow-mu.vercel.app' }))).toBe(true)
    expect(isCrossSiteWrite(req('POST', { origin: 'null', host: 'fluent-flow-mu.vercel.app' }))).toBe(true)
  })
  it('lets non-browser clients (no Origin, no Sec-Fetch-Site) through', () => {
    expect(isCrossSiteWrite(req('POST', {}))).toBe(false)
  })
})
