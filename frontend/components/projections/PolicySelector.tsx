'use client'

import { useState, useEffect, useRef } from 'react'
import { POLICY_PRESETS, COMPACT_RELEASE_AF, type OutflowPolicy } from '@/lib/monte-carlo'
import { ChevronDown, Plus, Trash2, Check, Pencil, X, Save, Bookmark } from 'lucide-react'

function pctToMaf(pct: number): number {
  return (COMPACT_RELEASE_AF * pct) / 100 / 1_000_000
}

function mafToPct(maf: number): number {
  return (maf * 1_000_000 / COMPACT_RELEASE_AF) * 100
}

/**
 * Number input that allows the field to be fully cleared while typing.
 * Syncs the parsed value upstream on every valid keystroke; resets on blur if empty.
 */
function NumInput({
  value,
  onChange,
  format,
  className,
  ...rest
}: {
  value: number
  onChange: (n: number) => void
  format?: (n: number) => string
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const fmt = format ?? String
  const [display, setDisplay] = useState(fmt(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDisplay(fmt(value))
  }, [value, fmt])

  return (
    <input
      {...rest}
      type="number"
      value={display}
      className={className}
      onChange={(e) => {
        setDisplay(e.target.value)
        const n = parseFloat(e.target.value)
        if (!isNaN(n)) onChange(n)
      }}
      onFocus={() => { focused.current = true }}
      onBlur={() => {
        focused.current = false
        if (display === '' || isNaN(parseFloat(display))) {
          setDisplay(fmt(value))
        } else {
          setDisplay(fmt(parseFloat(display)))
        }
      }}
    />
  )
}

const STORAGE_KEY = 'lp-saved-policies'

interface SavedPolicy {
  name: string
  tiers: { aboveElevation: number; percent: number }[]
}

function loadSavedPolicies(): SavedPolicy[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persistSavedPolicies(policies: SavedPolicy[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policies))
}

interface PolicySelectorProps {
  value: OutflowPolicy
  onChange: (policy: OutflowPolicy) => void
}

export default function PolicySelector({ value, onChange }: PolicySelectorProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [customType, setCustomType] = useState<'simple' | 'tiered'>('simple')
  const [customPercent, setCustomPercent] = useState(100)
  const [customTiers, setCustomTiers] = useState([
    { aboveElevation: 3600, percent: 100 },
    { aboveElevation: 3525, percent: 90 },
    { aboveElevation: 3490, percent: 80 },
    { aboveElevation: 0, percent: 70 },
  ])

  const [savedPolicies, setSavedPolicies] = useState<SavedPolicy[]>([])
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [activeSavedName, setActiveSavedName] = useState<string | null>(null)

  useEffect(() => {
    setSavedPolicies(loadSavedPolicies())
  }, [])

  const [seedSource, setSeedSource] = useState<string | null>(null)
  const [renamingPolicy, setRenamingPolicy] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<{ aboveElevation: number; percent: number } | null>(null)
  const [addDraft, setAddDraft] = useState<{ aboveElevation: number; percent: number } | null>(null)

  const sortTiers = (tiers: typeof customTiers) =>
    [...tiers].sort((a, b) => b.aboveElevation - a.aboveElevation)

  const commitTiers = (tiers: typeof customTiers) => {
    const sorted = sortTiers(tiers)
    setCustomTiers(sorted)
    setEditingIndex(null)
    setEditDraft(null)
    setActiveSavedName(null)
    const baseName = seedSource?.startsWith('__saved__:')
      ? seedSource.slice('__saved__:'.length)
      : seedSource
    const name = baseName ? `New from ${baseName}` : 'Custom Policy'
    onChange({ type: 'tiered', name, tiers: sorted })
  }

  const seedFromPreset = (preset: OutflowPolicy) => {
    if (preset.type === 'tiered' && preset.tiers?.length) {
      setCustomType('tiered')
      setCustomTiers(preset.tiers)
      setEditingIndex(null)
      setEditDraft(null)
      setAddDraft(null)
      setSeedSource(preset.name)
      onChange({ type: 'tiered', name: preset.name, tiers: preset.tiers })
    } else {
      const pct = preset.simplePercent ?? 100
      setCustomType('simple')
      setCustomPercent(pct)
      setSeedSource(preset.name)
      onChange({
        type: 'simple',
        name: `${pct}% of compact (${pctToMaf(pct).toFixed(2)} MAF)`,
        simplePercent: pct,
      })
    }
  }

  const DEFAULT_BLANK_TIERS = [
    { aboveElevation: 3525, percent: 100 },
    { aboveElevation: 0, percent: 85 },
  ]

  const handlePresetChange = (name: string) => {
    if (name === '__custom__') {
      setIsCustom(true)
      setActiveSavedName(null)
      setSeedSource(null)
      setCustomType('tiered')
      setCustomTiers(DEFAULT_BLANK_TIERS)
      setEditingIndex(null)
      setEditDraft(null)
      setAddDraft(null)
      onChange({ type: 'tiered', name: 'Custom Policy', tiers: DEFAULT_BLANK_TIERS })
      return
    }
    setIsCustom(false)
    setActiveSavedName(null)
    setSeedSource(null)
    const preset = POLICY_PRESETS.find((p) => p.name === name)
    if (preset) onChange(preset)
  }

  const handleCustomPercentChange = (pct: number) => {
    const clamped = Math.max(50, Math.min(110, Math.round(pct)))
    setCustomPercent(clamped)
    onChange({
      type: 'simple',
      name: `${clamped}% of compact (${pctToMaf(clamped).toFixed(2)} MAF)`,
      simplePercent: clamped,
    })
  }

  const handleCustomMafChange = (maf: number) => {
    const pct = Math.max(50, Math.min(110, Math.round(mafToPct(maf))))
    setCustomPercent(pct)
    onChange({
      type: 'simple',
      name: `${pct}% of compact (${pctToMaf(pct).toFixed(2)} MAF)`,
      simplePercent: pct,
    })
  }

  const startEditing = (index: number) => {
    setEditingIndex(index)
    setEditDraft({ ...customTiers[index] })
    setAddDraft(null)
  }

  const cancelEditing = () => {
    setEditingIndex(null)
    setEditDraft(null)
  }

  const saveEditing = () => {
    if (editingIndex === null || !editDraft) return
    commitTiers(customTiers.map((t, i) => (i === editingIndex ? editDraft : t)))
  }

  const removeTier = (index: number) => {
    if (customTiers.length <= 2) return
    commitTiers(customTiers.filter((_, i) => i !== index))
  }

  const startAdding = () => {
    setAddDraft({ aboveElevation: 3400, percent: 90 })
    setEditingIndex(null)
    setEditDraft(null)
  }

  const cancelAdding = () => {
    setAddDraft(null)
  }

  const confirmAdd = () => {
    if (!addDraft) return
    commitTiers([...customTiers, addDraft])
    setAddDraft(null)
  }

  const saveCurrentTiers = () => {
    const trimmed = saveName.trim()
    if (!trimmed) return
    const updated = [
      ...savedPolicies.filter((p) => p.name !== trimmed),
      { name: trimmed, tiers: customTiers },
    ]
    setSavedPolicies(updated)
    persistSavedPolicies(updated)
    setShowSaveInput(false)
    setSaveName('')
    setActiveSavedName(trimmed)
    setSeedSource(`__saved__:${trimmed}`)
    onChange({ type: 'tiered', name: trimmed, tiers: customTiers })
  }

  const updateActiveSaved = () => {
    if (!activeSavedName) return
    const updated = savedPolicies.map((p) =>
      p.name === activeSavedName ? { ...p, tiers: customTiers } : p
    )
    setSavedPolicies(updated)
    persistSavedPolicies(updated)
    setSeedSource(`__saved__:${activeSavedName}`)
    onChange({ type: 'tiered', name: activeSavedName, tiers: customTiers })
  }

  const deleteSavedPolicy = (name: string) => {
    const updated = savedPolicies.filter((p) => p.name !== name)
    setSavedPolicies(updated)
    persistSavedPolicies(updated)
    if (activeSavedName === name) setActiveSavedName(null)
  }

  const confirmRename = (oldName: string) => {
    const newName = renameDraft.trim()
    if (!newName || newName === oldName) {
      setRenamingPolicy(null)
      setRenameDraft('')
      return
    }
    const updated = savedPolicies.map((p) =>
      p.name === oldName ? { ...p, name: newName } : p
    )
    setSavedPolicies(updated)
    persistSavedPolicies(updated)
    if (activeSavedName === oldName) {
      setActiveSavedName(newName)
      setSeedSource(`__saved__:${newName}`)
      onChange({ type: 'tiered', name: newName, tiers: customTiers })
    }
    setRenamingPolicy(null)
    setRenameDraft('')
  }

  const loadSavedPolicy = (saved: SavedPolicy) => {
    setIsCustom(true)
    setCustomType('tiered')
    setCustomTiers(saved.tiers)
    setEditingIndex(null)
    setEditDraft(null)
    setAddDraft(null)
    setActiveSavedName(saved.name)
    setSeedSource(`__saved__:${saved.name}`)
    setShowSaveInput(false)
    setSaveName('')
    onChange({ type: 'tiered', name: saved.name, tiers: saved.tiers })
  }

  const inputClass = 'bg-white border border-gray-200 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-teal-400'

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
        Release Policy
      </label>

      {/* Preset selector */}
      <div className="relative">
        <select
          value={
            POLICY_PRESETS.some((p) => p.name === value.name)
              ? value.name
              : activeSavedName
                ? `__saved__:${activeSavedName}`
                : '__custom__'
          }
          onChange={(e) => {
            const val = e.target.value
            if (val.startsWith('__saved__:')) {
              const name = val.slice('__saved__:'.length)
              const saved = savedPolicies.find((p) => p.name === name)
              if (saved) loadSavedPolicy(saved)
              return
            }
            handlePresetChange(val)
          }}
          className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2.5 pr-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors"
        >
          {POLICY_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
          <option value="__custom__">Custom Policy</option>
          {savedPolicies.length > 0 && (
            <optgroup label="Your saved policies">
              {savedPolicies.map((p) => (
                <option key={`saved-${p.name}`} value={`__saved__:${p.name}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>

      {/* Custom config */}
      {isCustom && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-3 border border-gray-100">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCustomType('simple')
                handleCustomPercentChange(customPercent)
              }}
              className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                customType === 'simple'
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Flat release
            </button>
            <button
              onClick={() => {
                setCustomType('tiered')
                const baseName = seedSource?.startsWith('__saved__:')
                  ? seedSource.slice('__saved__:'.length)
                  : seedSource
                const name = activeSavedName ?? (baseName ? `New from ${baseName}` : 'Custom Policy')
                onChange({ type: 'tiered', name, tiers: customTiers })
              }}
              className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                customType === 'tiered'
                  ? 'bg-white shadow-sm text-gray-900 border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Elevation-based
            </button>
          </div>

          {/* Seed from preset */}
          {customType === 'tiered' && (
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Start from existing</label>
              <select
                onChange={(e) => {
                  const val = e.target.value
                  if (val.startsWith('__saved__:')) {
                    const name = val.slice('__saved__:'.length)
                    const saved = savedPolicies.find((p) => p.name === name)
                    if (saved) {
                      setCustomTiers(saved.tiers)
                      setEditingIndex(null)
                      setEditDraft(null)
                      setAddDraft(null)
                      setActiveSavedName(name)
                      setSeedSource(`__saved__:${name}`)
                      onChange({ type: 'tiered', name, tiers: saved.tiers })
                    }
                  } else {
                    const preset = POLICY_PRESETS.find((p) => p.name === val)
                    if (preset?.tiers) {
                      setCustomTiers(preset.tiers)
                      setEditingIndex(null)
                      setEditDraft(null)
                      setAddDraft(null)
                      setActiveSavedName(null)
                      setSeedSource(val)
                      onChange({ type: 'tiered', name: val, tiers: preset.tiers })
                    }
                  }
                }}
                value={
                  activeSavedName
                    ? `__saved__:${activeSavedName}`
                    : seedSource && !seedSource.startsWith('__saved__:')
                      ? seedSource
                      : ''
                }
                className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-400"
              >
                <option value="" disabled>Choose a proposal to edit...</option>
                {POLICY_PRESETS.filter((p) => p.type === 'tiered').map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
                {savedPolicies.length > 0 && (
                  <optgroup label="Your saved">
                    {savedPolicies.map((p) => (
                      <option key={`seed-saved-${p.name}`} value={`__saved__:${p.name}`}>{p.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {customType === 'simple' ? (
            <div className="space-y-2">
              {/* % slider */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">% of compact release</span>
                <span className="text-sm font-medium text-gray-900">{customPercent}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={110}
                value={customPercent}
                onChange={(e) => handleCustomPercentChange(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-teal-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>50%</span>
                <span>100%</span>
                <span>110%</span>
              </div>
              {/* MAF input */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-gray-500 whitespace-nowrap">=</span>
                <NumInput
                  step={0.1}
                  min={4}
                  max={9.1}
                  value={pctToMaf(customPercent)}
                  format={(n) => n.toFixed(2)}
                  onChange={handleCustomMafChange}
                  className={inputClass}
                />
                <span className="text-xs text-gray-400">MAF/yr</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_auto_auto] gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide font-medium px-0.5">
                <span>Above ft</span>
                <span>%</span>
                <span>MAF/yr</span>
                <span className="w-6" />
                <span className="w-6" />
              </div>
              {customTiers.map((tier, i) => {
                const isEditing = editingIndex === i && editDraft !== null
                const display = isEditing ? editDraft : tier

                return (
                  <div key={i} className={`grid grid-cols-[1fr_0.8fr_0.8fr_auto_auto] gap-1.5 items-center rounded-md transition-colors ${isEditing ? 'bg-teal-50 p-1 -mx-1' : ''}`}>
                    {isEditing ? (
                      <>
                        <NumInput
                          value={display.aboveElevation}
                          format={(n) => String(Math.round(n))}
                          onChange={(n) => setEditDraft({ ...editDraft, aboveElevation: Math.round(n) })}
                          className={inputClass}
                          autoFocus
                        />
                        <NumInput
                          value={display.percent}
                          min={50}
                          max={110}
                          format={(n) => String(Math.round(n))}
                          onChange={(n) => setEditDraft({ ...editDraft, percent: Math.round(n) })}
                          className={inputClass}
                        />
                        <span className="text-xs text-gray-500 text-center">{pctToMaf(display.percent).toFixed(1)}</span>
                        <button
                          onClick={saveEditing}
                          className="p-1 text-teal-600 hover:text-teal-700 transition-colors"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-gray-900 px-2 py-1.5">{tier.aboveElevation} ft</span>
                        <span className="text-sm text-gray-900 px-2 py-1.5">{tier.percent}%</span>
                        <span className="text-xs text-gray-500 px-2 py-1.5">{pctToMaf(tier.percent).toFixed(1)}</span>
                        <button
                          onClick={() => startEditing(i)}
                          className="p-1 text-gray-400 hover:text-teal-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeTier(i)}
                          disabled={customTiers.length <= 2}
                          className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}

              {addDraft !== null ? (
                <div className="grid grid-cols-[1fr_0.8fr_0.8fr_auto_auto] gap-1.5 items-center bg-green-50 rounded-md p-1 -mx-1">
                  <NumInput
                    value={addDraft.aboveElevation}
                    format={(n) => String(Math.round(n))}
                    onChange={(n) => setAddDraft({ ...addDraft, aboveElevation: Math.round(n) })}
                    className={inputClass}
                    autoFocus
                  />
                  <NumInput
                    value={addDraft.percent}
                    min={50}
                    max={110}
                    format={(n) => String(Math.round(n))}
                    onChange={(n) => setAddDraft({ ...addDraft, percent: Math.round(n) })}
                    className={inputClass}
                  />
                  <span className="text-xs text-gray-500 text-center">{pctToMaf(addDraft.percent).toFixed(1)}</span>
                  <button
                    onClick={confirmAdd}
                    className="p-1 text-green-600 hover:text-green-700 transition-colors"
                    title="Add"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cancelAdding}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startAdding}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add tier
                </button>
              )}

              {/* Save / manage saved configs */}
              <div className="border-t border-gray-200 pt-2 mt-2 space-y-2">
                {activeSavedName && (
                  <div className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 rounded px-2 py-1.5 border border-teal-100">
                    <Pencil className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate flex-1">Editing <strong>{activeSavedName}</strong></span>
                  </div>
                )}

                {showSaveInput ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentTiers(); if (e.key === 'Escape') { setShowSaveInput(false); setSaveName('') } }}
                      placeholder="Name this configuration..."
                      className="flex-1 bg-white border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                      autoFocus
                    />
                    <button
                      onClick={saveCurrentTiers}
                      disabled={!saveName.trim()}
                      className="p-1.5 text-teal-600 hover:text-teal-700 disabled:opacity-30 transition-colors"
                      title="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setShowSaveInput(false); setSaveName('') }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {activeSavedName ? (
                      <>
                        <button
                          onClick={updateActiveSaved}
                          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 transition-colors"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Update
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => setShowSaveInput(true)}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-teal-600 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Save as new
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowSaveInput(true)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-teal-600 transition-colors"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        Save this configuration
                      </button>
                    )}
                  </div>
                )}

                {savedPolicies.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">Saved</span>
                    {savedPolicies.map((sp) => (
                      <div key={sp.name} className={`flex items-center justify-between text-xs text-gray-600 rounded px-2 py-1.5 border ${activeSavedName === sp.name ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-100'}`}>
                        {renamingPolicy === sp.name ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <input
                              type="text"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmRename(sp.name)
                                if (e.key === 'Escape') { setRenamingPolicy(null); setRenameDraft('') }
                              }}
                              className="flex-1 min-w-0 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                              autoFocus
                            />
                            <button
                              onClick={() => confirmRename(sp.name)}
                              className="p-0.5 text-teal-600 hover:text-teal-700 transition-colors flex-shrink-0"
                              title="Confirm"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => { setRenamingPolicy(null); setRenameDraft('') }}
                              className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => loadSavedPolicy(sp)}
                              className="text-left hover:text-teal-600 transition-colors truncate flex-1"
                            >
                              {sp.name}
                              <span className="text-[10px] text-gray-400 ml-1">({sp.tiers.length} tiers)</span>
                            </button>
                            <button
                              onClick={() => { setRenamingPolicy(sp.name); setRenameDraft(sp.name) }}
                              className="p-0.5 text-gray-400 hover:text-teal-600 transition-colors ml-1 flex-shrink-0"
                              title="Rename"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteSavedPolicy(sp.name)}
                              className="p-0.5 text-gray-400 hover:text-red-500 transition-colors ml-1 flex-shrink-0"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current policy description */}
      <p className="text-xs text-gray-400">
        {value.type === 'simple'
          ? `Release ${pctToMaf(value.simplePercent ?? 100).toFixed(2)} MAF/yr (${value.simplePercent ?? 100}% of compact)`
          : value.type === 'tiered'
            ? `Release varies by elevation: ${value.tiers
                ?.sort((a, b) => b.aboveElevation - a.aboveElevation)
                .map((t) => `${t.percent}% (${pctToMaf(t.percent).toFixed(1)} MAF) above ${t.aboveElevation} ft`)
                .join(', ')}`
            : `${value.percent ?? 100}% of: ${value.basePolicy?.name ?? 'selected policy'}`}
      </p>
    </div>
  )
}
