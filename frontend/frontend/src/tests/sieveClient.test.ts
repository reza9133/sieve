import { afterEach, describe, expect, it, vi } from 'vitest'
import { abi } from 'genlayer-js'
import { toHex } from 'viem'
import { executeDepositCredit, fetchContractInfo } from '@/chain/sieveClient'

const ACCOUNT = '0x1111111111111111111111111111111111111111'

function mockRpc(handler: (method: string) => unknown) {
  const methods: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body)
      methods.push(body.method)
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: handler(body.method) }), {
        headers: { 'content-type': 'application/json' },
      })
    })
  )
  return methods
}

afterEach(() => vi.unstubAllGlobals())

describe('sieveClient (genlayer-js integration, mocked network)', () => {
  it('reads a view through gen_call and normalizes the decoded dict', async () => {
    const payload = abi.calldata.encode(
      new Map<string, unknown>([
        ['name', 'Sieve'],
        ['min_budget_wei', 10n ** 15n],
      ]) as never
    )
    const methods = mockRpc((m) => (m === 'gen_call' ? toHex(payload).slice(2) : m === 'eth_chainId' ? '0xf2af' : '0x0'))

    const info = await fetchContractInfo()

    expect(methods).toContain('gen_call')
    expect(info.name).toBe('Sieve')
    expect(info.minBudgetWei).toBe(10n ** 15n)
  })

  it('sends writes through the selected wallet provider, not window.ethereum', async () => {
    mockRpc((m) => (m === 'eth_chainId' ? '0xf2af' : '0x1'))
    const sent: unknown[] = []
    const provider = {
      request: vi.fn(async ({ method, params }: { method: string; params: unknown[] }) => {
        if (method === 'eth_chainId') return '0xf2af'
        if (method === 'eth_sendTransaction') {
          sent.push(params[0])
          return '0x' + 'ab'.repeat(32)
        }
        return '0x1'
      }),
    }

    const hash = await executeDepositCredit(provider, ACCOUNT, 10n ** 15n)

    expect(hash).toBe('0x' + 'ab'.repeat(32))
    expect(sent).toHaveLength(1)
    expect((sent[0] as { from: string }).from.toLowerCase()).toBe(ACCOUNT)
  })
})
