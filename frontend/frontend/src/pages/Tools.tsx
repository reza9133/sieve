import React, { useState } from 'react'
import { computeCommitment, generateSalt, sha256Hex } from '@/lib/commitment'
import { hashDocumentFile } from '@/lib/hash'
import { parseGEN } from '@/lib/units'
import { formatDateTime, formatUTC } from '@/lib/time'
import { CopyButton } from '@/components/ui/CopyButton'

export function Tools() {
  // Tool 1: Commitment Calculator
  const [funder, setFunder] = useState('0x1111111111111111111111111111111111111111')
  const [tenderId, setTenderId] = useState('tender-001')
  const [bidder, setBidder] = useState('0xabcdef0123456789abcdef0123456789abcdef01')
  const [priceGen, setPriceGen] = useState('0.0025')
  const [url, setUrl] = useState('https://example.com/proposal.md')
  const [hash, setHash] = useState('0x94a81c7ee019d787fb7ac17d9f007a8a8c39d29a69dfcf693b03e06188da3d19')
  const [salt, setSalt] = useState('abcdefghijklmnop0123456789ABCDEF')
  const [outputCommitment, setOutputCommitment] = useState('')

  const handleComputeCommitment = async () => {
    try {
      const priceWei = parseGEN(priceGen)
      const res = await computeCommitment({
        funderAddress: funder,
        tenderId,
        bidderAddress: bidder,
        priceWei,
        proposalUrl: url,
        proposalHash: hash,
        salt,
      })
      setOutputCommitment(res)
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to compute commitment')
    }
  }

  // Tool 2: File Hasher
  const [fileHash, setFileHash] = useState('')
  const [fileBytes, setFileBytes] = useState<number | null>(null)
  const [fileWarnings, setFileWarnings] = useState<string[]>([])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const res = await hashDocumentFile(f)
      setFileHash(res.hash)
      setFileBytes(res.byteCount)
      setFileWarnings(res.warnings)
    } catch (err: unknown) {
      alert((err as Error).message)
    }
  }

  // String hasher
  const [stringInput, setStringInput] = useState('hello sieve')
  const [stringHash, setStringHash] = useState('')

  const handleHashString = async () => {
    const res = await sha256Hex(stringInput)
    setStringHash(res)
  }

  // Tool 3: Deadline Converter
  const [unixInput, setUnixInput] = useState(() => Math.floor(Date.now() / 1000).toString())

  const parsedUnix = parseInt(unixInput, 10) || 0

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-fade-in">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Offline Cryptographic Utilities</h1>
        <p className="text-text-muted text-sm max-w-xl mx-auto">
          Client-side tools running in Web Crypto. No secrets or documents are ever uploaded to any server.
        </p>
      </div>

      {/* Tool 1: Commitment Calculator */}
      <div className="card p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">1. Offline Bid Commitment Calculator</h2>
            <p className="text-xs text-text-muted">
              Pre-computed length-prefixed SHA-256 for sealed bids matching sieve_tools.py
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSalt(generateSalt())}
            className="btn btn-secondary text-xs py-1"
          >
            Generate Random Salt
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="label">Funder Address</label>
            <input type="text" value={funder} onChange={(e) => setFunder(e.target.value)} className="input font-mono" />
          </div>
          <div>
            <label className="label">Tender ID</label>
            <input type="text" value={tenderId} onChange={(e) => setTenderId(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Bidder Address</label>
            <input type="text" value={bidder} onChange={(e) => setBidder(e.target.value)} className="input font-mono" />
          </div>
          <div>
            <label className="label">Price in GEN</label>
            <input type="text" value={priceGen} onChange={(e) => setPriceGen(e.target.value)} className="input font-mono" />
          </div>
          <div>
            <label className="label">Proposal Document URL</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className="input font-mono" />
          </div>
          <div>
            <label className="label">Proposal Document SHA-256</label>
            <input type="text" value={hash} onChange={(e) => setHash(e.target.value)} className="input font-mono" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Salt</label>
            <input type="text" value={salt} onChange={(e) => setSalt(e.target.value)} className="input font-mono" />
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <button type="button" onClick={handleComputeCommitment} className="btn btn-primary text-xs py-2 px-6">
            Compute Commitment
          </button>
        </div>

        {outputCommitment && (
          <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2">
            <span className="text-xs text-text-muted uppercase font-bold">Resulting Commitment:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-accent break-all">{outputCommitment}</span>
              <CopyButton text={outputCommitment} />
            </div>
          </div>
        )}
      </div>

      {/* Tool 2: Document File Hasher */}
      <div className="card p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold">2. Document Byte-Exact File Hasher</h2>
          <p className="text-xs text-text-muted">
            Compute exact Web Crypto SHA-256 for requirements and proposals with strict byte constraints.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-dashed border-border bg-surface-2 text-center space-y-3">
          <input type="file" onChange={handleFile} className="text-sm file:btn file:btn-secondary file:py-1 file:px-4" />
          <p className="text-xs text-text-muted">
            Validators fetch exact raw bytes over HTTPS. Line endings, encoding, and byte count must match exactly.
          </p>
        </div>

        {fileHash && (
          <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-text">SHA-256 Hash:</span>
              <span className="font-mono text-text-muted">{fileBytes} bytes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-accent break-all">{fileHash}</span>
              <CopyButton text={fileHash} />
            </div>
            {fileWarnings.map((w, idx) => (
              <p key={idx} className="text-warning">⚠️ {w}</p>
            ))}
          </div>
        )}

        {/* String SHA-256 mini-tool */}
        <div className="pt-4 border-t border-border space-y-3">
          <h3 className="text-sm font-bold">Quick String SHA-256</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={stringInput}
              onChange={(e) => setStringInput(e.target.value)}
              className="input text-xs font-mono"
            />
            <button type="button" onClick={handleHashString} className="btn btn-secondary text-xs px-4">
              Hash
            </button>
          </div>
          {stringHash && (
            <div className="flex items-center gap-2 font-mono text-xs text-accent">
              <span className="break-all">{stringHash}</span>
              <CopyButton text={stringHash} />
            </div>
          )}
        </div>
      </div>

      {/* Tool 3: Deadline Converter */}
      <div className="card p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold">3. Unix Deadline Converter</h2>
          <p className="text-xs text-text-muted">Convert between Unix seconds, local browser time, and UTC</p>
        </div>

        <div>
          <label className="label">Unix Timestamp (Seconds)</label>
          <input
            type="number"
            value={unixInput}
            onChange={(e) => setUnixInput(e.target.value)}
            className="input font-mono w-64"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-surface-2 border border-border font-mono text-xs">
          <div>
            <span className="text-text-muted">Local Time:</span>
            <p className="font-bold text-text mt-1">{formatDateTime(parsedUnix)}</p>
          </div>
          <div>
            <span className="text-text-muted">UTC Time:</span>
            <p className="font-bold text-accent mt-1">{formatUTC(parsedUnix)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
