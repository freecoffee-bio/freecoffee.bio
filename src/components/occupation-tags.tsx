import { useState } from 'react'
import { Input } from '@/components/ui/input'

type OccupationTagsProps = {
  name: string
  initialValue?: string | null
}

function parseOccupations(value?: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  } catch {
    return value.trim() ? [value.trim()] : []
  }
}

export function OccupationTags({ name, initialValue }: OccupationTagsProps) {
  const [occupations, setOccupations] = useState(() => parseOccupations(initialValue))
  const [input, setInput] = useState('')

  function addOccupation() {
    const value = input.trim()
    if (!value || occupations.includes(value)) {
      setInput('')
      return
    }
    setOccupations((current) => [...current, value])
    setInput('')
  }

  return <div className="tag-input occupation-tags">
    {occupations.map((occupation) => <span className="occupation-tag" key={occupation}>
      {occupation}
      <button type="button" onClick={() => setOccupations((current) => current.filter((item) => item !== occupation))} aria-label={`Remove ${occupation}`}>×</button>
    </span>)}
    <Input
      value={input}
      onChange={(event) => setInput(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          addOccupation()
        }
      }}
      placeholder={occupations.length ? 'Add another occupation' : 'Add an occupation'}
      aria-label="Add occupation"
      className="occupation-tags-input"
    />
    <input type="hidden" name={name} value={JSON.stringify(occupations)} />
  </div>
}
