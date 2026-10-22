import { describe, it, expect } from 'vitest'
import {
  toBigInt,
  formatGEN,
  formatGENCompact,
  parseGEN,
  WEI_PER_GEN,
} from '@/lib/units'

describe('Units & BigInt Financial Conversions', () => {
  it('converts various inputs safely with toBigInt', () => {
    expect(toBigInt(100n)).toBe(100n)
    expect(toBigInt(42)).toBe(42n)
    expect(toBigInt('1000000000000000000')).toBe(1000000000000000000n)
    expect(toBigInt('0x10')).toBe(16n)
    expect(toBigInt(null)).toBe(0n)
    expect(toBigInt(undefined)).toBe(0n)
    expect(toBigInt('')).toBe(0n)
  })

  it('throws on non-integer floating numbers in toBigInt', () => {
    expect(() => toBigInt(3.14)).toThrow(TypeError)
  })

  it('formats wei into clean GEN strings', () => {
    expect(formatGEN(0n)).toBe('0 GEN')
    expect(formatGEN(WEI_PER_GEN)).toBe('1 GEN')
    expect(formatGEN(2500000000000000n)).toBe('0.0025 GEN') // 0.0025 GEN
    expect(formatGEN(1500000000000000000n)).toBe('1.5 GEN')
    expect(formatGEN(-1000000000000000000n)).toBe('-1 GEN')
  })

  it('formats compact GEN strings', () => {
    expect(formatGENCompact(1500000000000000000n)).toBe('1.5 GEN')
    expect(formatGENCompact(50000000000000000n)).toBe('50 mGEN')
    expect(formatGENCompact(500n)).toBe('500 wei')
  })

  it('parses decimal GEN strings into BigInt wei', () => {
    expect(parseGEN('1')).toBe(1000000000000000000n)
    expect(parseGEN('0.0025')).toBe(2500000000000000n)
    expect(parseGEN('0.000000000000000001')).toBe(1n)
    expect(parseGEN('10.5')).toBe(10500000000000000000n)
  })

  it('round-trips parseGEN and formatGEN accurately', () => {
    const values = ['0.001', '0.05', '1.25', '100', '0.000001']
    for (const v of values) {
      const wei = parseGEN(v)
      expect(formatGEN(wei)).toBe(`${v} GEN`)
    }
  })

  it('throws on malformed GEN strings', () => {
    expect(() => parseGEN('')).toThrow()
    expect(() => parseGEN('abc')).toThrow()
    expect(() => parseGEN('1.2.3')).toThrow()
    expect(() => parseGEN('0.00000000000000000001')).toThrow() // 19 decimals
  })
})
