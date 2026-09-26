import ChipGroup from '@/components/onboarding/ChipGroup'
import FreeTextField from '@/components/onboarding/FreeTextField'
import StepHeading from '@/components/onboarding/StepHeading'
import { INTEREST_OPTIONS } from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

export default function StepInterests({ selected, text, onToggle, onTextChange, onEnter, autoFocus, disabled }) {
  return (
    <>
      <StepHeading
        id="ob-interests-title"
        helperId="ob-interests-help"
        title="What do you love talking about?"
        helper="Your lesson recaps will use examples from these topics. Optional — skip if you like."
        autoFocus={autoFocus}
      />
      <div className={styles.body}>
        <ChipGroup
          name="ob-interests"
          labelledBy="ob-interests-title"
          describedBy="ob-interests-help"
          options={INTEREST_OPTIONS}
          selected={selected}
          onToggle={onToggle}
          disabled={disabled}
        />
        <FreeTextField
          id="ob-interests-text"
          label="Anything else?"
          value={text}
          onChange={onTextChange}
          onEnter={onEnter}
          placeholder="e.g. Italian cooking, Formula 1, 19th-century novels"
          disabled={disabled}
        />
      </div>
    </>
  )
}
