import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  loadActivityRegistry,
  togglePinActivity,
  exportActivityJson,
  importActivityJson,
  type ActivityRecord,
} from '@/lib/storage'
import { validateAddress, validateTenderId } from '@/lib/validation'
import { shortenAddress } from '@/lib/units'
import { formatDateTime } from '@/lib/time'

export function Explore() {
  const navigate = useNavigate()
  const [funderInput, setFunderInput] = useState('')
  const [tenderIdInput, setTenderIdInput] = useState('')
  const [errors, setErrors] = useState<{ funder?: string; tenderId?: string }>({})
  const [recentRecords, setRecentRecords] = useState<ActivityRecord[]>([])
  const [importStatus, setImportStatus] = useState<string | null>(null)

  useEffect(() => {
    setRecentRecords(loadActivityRegistry())
  }, [])

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault()
    const funderVal = validateAddress(funderInput)
    const idVal = validateTenderId(tenderIdInput)

    const newErrors: { funder?: string; tenderId?: string } = {}
    if (!funderVal.valid) newErrors.funder = funderVal.error
    if (!idVal.valid) newErrors.tenderId = idVal.error

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    navigate(`/tender/${funderInput.trim().toLowerCase()}/${tenderIdInput.trim()}`)
  }

  const handleTogglePin = (funder: string, id: string) => {
    togglePinActivity(funder, id)
    setRecentRecords(loadActivityRegistry())
  }

  const handleExport = () => {
    const json = exportActivityJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sieve-activity-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string
        const res = importActivityJson(text)
        setRecentRecords(loadActivityRegistry())
        setImportStatus(`Imported ${res.importedCount} tenders`)
        setTimeout(() => setImportStatus(null), 3000)
      } catch (err) {
        setImportStatus('Failed to parse backup JSON')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-12 max-w-4xl mx-auto animate-fade-in">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Explore & Lookup Tenders</h1>
        <p className="text-text-muted text-sm max-w-xl mx-auto">
          Tenders on Sieve are addressed uniquely by the composite key of <code>(funder_address, tender_id)</code>.
        </p>
      </div>

      {/* Honest Architectural Notice */}
      <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-xs text-text-muted flex items-start gap-3">
        <svg className="w-5 h-5 text-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="space-y-1">
          <p className="font-semibold text-text">Why Direct Lookup is Required</p>
          <p>
            The Sieve intelligent contract contains no global enumeration method and emits no events to query all historical tenders. To view a tender, enter the funder’s address and tender ID or open a share link. Global directory indexing is an off-chain layer slated for future tooling.
          </p>
        </div>
      </div>

      {/* Lookup Form */}
      <div className="card p-6 sm:p-8 space-y-6">
        <h2 className="text-lg font-bold">Find a Tender</h2>
        <form onSubmit={handleLookup} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Funder Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={funderInput}
                onChange={(e) => setFunderInput(e.target.value)}
                className={`input font-mono ${errors.funder ? 'error' : ''}`}
              />
              {errors.funder && <p className="text-xs text-danger mt-1">{errors.funder}</p>}
            </div>

            <div>
              <label className="label">Tender ID</label>
              <input
                type="text"
                placeholder="e.g. tender-001"
                value={tenderIdInput}
                onChange={(e) => setTenderIdInput(e.target.value)}
                className={`input ${errors.tenderId ? 'error' : ''}`}
              />
              {errors.tenderId && <p className="text-xs text-danger mt-1">{errors.tenderId}</p>}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn btn-primary px-6">
              View Tender
            </button>
          </div>
        </form>
      </div>

      {/* Local Activity Registry */}
      <div className="card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold">Your Saved & Interacted Tenders</h2>
            <p className="text-xs text-text-muted">Stored locally in your browser</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={recentRecords.length === 0}
              className="btn btn-secondary text-xs py-1.5"
            >
              Export JSON
            </button>
            <label className="btn btn-secondary text-xs py-1.5 cursor-pointer">
              Import JSON
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </div>

        {importStatus && (
          <p className="text-xs text-accent font-medium">{importStatus}</p>
        )}

        {recentRecords.length > 0 ? (
          <div className="divide-y divide-border">
            {recentRecords.map((item) => (
              <div
                key={`${item.funderAddress}-${item.tenderId}`}
                className="py-3.5 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/tender/${item.funderAddress}/${item.tenderId}`}
                      className="font-semibold text-text hover:text-accent transition-colors text-sm"
                    >
                      {item.title || item.tenderId}
                    </Link>
                    <span className="badge badge-accent uppercase text-[10px]">{item.role}</span>
                  </div>
                  <p className="text-xs text-text-muted font-mono">
                    Funder: {shortenAddress(item.funderAddress)} • Last interacted: {formatDateTime(item.lastInteractedAt / 1000)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(item.funderAddress, item.tenderId)}
                    className={`p-1.5 rounded hover:bg-surface-2 transition-colors ${
                      item.pinned ? 'text-warning' : 'text-text-muted hover:text-text'
                    }`}
                    title={item.pinned ? 'Unpin' : 'Pin to top'}
                  >
                    ★
                  </button>
                  <Link
                    to={`/tender/${item.funderAddress}/${item.tenderId}`}
                    className="btn btn-secondary text-xs py-1 px-3"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-muted text-sm space-y-2">
            <p>No local tenders recorded yet.</p>
            <p className="text-xs">
              When you open, bid on, or look up tenders, they will be remembered here for instant access.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
