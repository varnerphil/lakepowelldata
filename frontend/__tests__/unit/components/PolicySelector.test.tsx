import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PolicySelector from '@/components/projections/PolicySelector'
import { POLICY_PRESETS, DEIS_PRESETS, type OutflowPolicy } from '@/lib/monte-carlo'

const STORAGE_KEY = 'lp-saved-policies'

function renderSelector(overrides: Partial<{ value: OutflowPolicy; onChange: (p: OutflowPolicy) => void }> = {}) {
  const onChange = overrides.onChange ?? vi.fn()
  const value = overrides.value ?? POLICY_PRESETS[0]
  const result = render(<PolicySelector value={value} onChange={onChange} />)
  return { onChange, rerender: (v: OutflowPolicy) => result.rerender(<PolicySelector value={v} onChange={onChange} />) }
}

beforeEach(() => {
  localStorage.clear()
})

describe('PolicySelector', () => {
  describe('custom policy from scratch', () => {
    it('selecting Custom Policy opens a blank editor', () => {
      const { onChange } = renderSelector()
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: '__custom__' } })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tiered', name: 'Custom Policy' })
      )
    })
  })

  describe('saved policy editing preserves Update button', () => {
    it('editing a tier of a loaded saved policy keeps the Update button visible', () => {
      const savedTiers = [
        { aboveElevation: 3575, percent: 100 },
        { aboveElevation: 3525, percent: 91 },
        { aboveElevation: 0, percent: 85 },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ name: 'My Test Policy', tiers: savedTiers }]))

      const onChange = vi.fn()
      renderSelector({ onChange })

      // Select Custom Policy to enter custom mode
      const select = screen.getAllByRole('combobox')[0]
      fireEvent.change(select, { target: { value: '__custom__' } })

      // Load the saved policy — target the button in the saved list (not the <option>)
      const savedButtons = screen.getAllByText('My Test Policy')
      const loadButton = savedButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(loadButton)

      // Verify we're editing the saved policy
      expect(screen.getByText(/Editing/)).toBeInTheDocument()

      // Click the edit (pencil) button on the first tier row
      const editButtons = screen.getAllByTitle('Edit')
      fireEvent.click(editButtons[0])

      // Change the percent value in the editing row
      const inputs = screen.getAllByRole('spinbutton')
      const percentInput = inputs[1]
      fireEvent.change(percentInput, { target: { value: '95' } })

      // Click the save (check) button to commit the tier edit
      const saveButton = screen.getByTitle('Save')
      fireEvent.click(saveButton)

      // The Update button should still be visible (activeSavedName not cleared)
      expect(screen.getByText('Update')).toBeInTheDocument()

      // The onChange should have been called with the saved policy name (modified)
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(lastCall.name).toContain('My Test Policy')
    })

    it('clicking Update after editing saves changes back to the same policy', () => {
      const savedTiers = [
        { aboveElevation: 3575, percent: 100 },
        { aboveElevation: 0, percent: 85 },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify([{ name: 'My Policy', tiers: savedTiers }]))

      const onChange = vi.fn()
      renderSelector({ onChange })

      // Enter custom mode
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '__custom__' } })

      // Load saved policy — target the button (not the <option>s)
      const savedButtons = screen.getAllByText('My Policy')
      const loadButton = savedButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(loadButton)

      // Edit a tier
      const editButtons = screen.getAllByTitle('Edit')
      fireEvent.click(editButtons[0])
      const inputs = screen.getAllByRole('spinbutton')
      fireEvent.change(inputs[1], { target: { value: '95' } })
      fireEvent.click(screen.getByTitle('Save'))

      // Click Update
      fireEvent.click(screen.getByText('Update'))

      // Verify the saved policy in localStorage was updated
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      const updated = stored.find((p: any) => p.name === 'My Policy')
      expect(updated).toBeDefined()
      expect(updated.tiers[0].percent).toBe(95)

      // onChange was called with clean name (no "modified")
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(lastCall.name).toBe('My Policy')
    })
  })

  describe('dropdown ordering', () => {
    it('Custom Policy appears before saved policies in the dropdown', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { name: 'Saved A', tiers: [{ aboveElevation: 3525, percent: 100 }, { aboveElevation: 0, percent: 85 }] },
      ]))

      renderSelector()

      const select = screen.getByRole('combobox')
      const options = within(select).getAllByRole('option')
      const customIdx = options.findIndex((o) => o.textContent === 'Custom Policy')
      const savedIdx = options.findIndex((o) => o.textContent === 'Saved A')
      expect(customIdx).toBeLessThan(savedIdx)
    })
  })

  describe('DEIS presets in dropdown', () => {
    it('shows all 5 DEIS alternatives in the dropdown', () => {
      renderSelector()
      const select = screen.getByRole('combobox')
      const options = within(select).getAllByRole('option')
      const optionTexts = options.map((o) => o.textContent)

      for (const preset of DEIS_PRESETS) {
        expect(optionTexts).toContain(preset.name)
      }
    })

    it('DEIS optgroup appears between existing presets and Custom Policy', () => {
      renderSelector()
      const select = screen.getByRole('combobox')
      const options = within(select).getAllByRole('option')
      const optionTexts = options.map((o) => o.textContent)

      const lastExistingIdx = optionTexts.indexOf('85% of compact (6.99 MAF)')
      const firstDeisIdx = optionTexts.indexOf('DEIS: No Action')
      const customIdx = optionTexts.indexOf('Custom Policy')

      expect(lastExistingIdx).toBeLessThan(firstDeisIdx)
      expect(firstDeisIdx).toBeLessThan(customIdx)
    })

    it('selecting a DEIS preset calls onChange with that preset', () => {
      const { onChange } = renderSelector()
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: DEIS_PRESETS[0].name } })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ name: DEIS_PRESETS[0].name })
      )
    })
  })
})
