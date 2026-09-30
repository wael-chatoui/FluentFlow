import ChipGroup from '@/components/onboarding/ChipGroup'
import FreeTextField from '@/components/onboarding/FreeTextField'
import StepHeading from '@/components/onboarding/StepHeading'
import { GOAL_OPTIONS, freeTextMax } from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

export default function StepGoals({ selected, text, onToggle, onTextChange, onEnter, autoFocus, disabled }) {
  return (
    <>
      <StepHeading
        id="ob-goals-title"
        helperId="ob-goals-help"
        title="What brings you to French?"
        helper="Pick as many as you like. Wael uses this to shape every lesson."
        autoFocus={autoFocus}
      />
      <div className={styles.body}>
        <ChipGroup
          name="ob-goals"
          labelledBy="ob-goals-title"
          describedBy="ob-goals-help"
          options={GOAL_OPTIONS}
          selected={selected}
          onToggle={onToggle}
          disabled={disabled}
        />
        <FreeTextField
          id="ob-goals-text"
          label="Anything specific?"
          value={text}
          max={freeTextMax(GOAL_OPTIONS, selected)}
          onChange={onTextChange}
          onEnter={onEnter}
          placeholder="e.g. I'm moving to Lyon in March and need to handle day-to-day life"
          disabled={disabled}
        />
      </div>
    </>
  )
}
