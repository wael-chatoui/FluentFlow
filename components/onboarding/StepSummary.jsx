import Icon from '@/components/ui/Icon'
import StepHeading from '@/components/onboarding/StepHeading'
import {
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  STEPS,
  firstNameOf,
  levelLabel,
} from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

function Choices({ options, ids, text, empty }) {
  const picked = options.filter((o) => ids.includes(o.id))
  const extra = text.trim()
  if (!picked.length && !extra) return <span className={styles.summaryEmpty}>{empty}</span>
  return (
    <>
      {picked.length ? (
        <ul className={styles.tagList}>
          {picked.map((o) => (
            <li key={o.id} className={styles.tag}>
              <Icon icon={o.icon} size={14} />
              {o.label}
            </li>
          ))}
        </ul>
      ) : null}
      {extra ? <p className={styles.quote}>{extra}</p> : null}
    </>
  )
}

function Row({ term, editLabel, onEdit, disabled, children }) {
  return (
    <div className={styles.summaryRow}>
      <dt className={styles.summaryTerm}>{term}</dt>
      <dd className={styles.summaryValue}>
        {children}
        <button type="button" className={styles.summaryEdit} onClick={onEdit} disabled={disabled} aria-label={editLabel}>
          Edit
        </button>
      </dd>
    </div>
  )
}

export default function StepSummary({ answers, onEdit, autoFocus, disabled }) {
  const firstName = firstNameOf(answers.fullName)

  return (
    <>
      <StepHeading
        id="ob-summary-title"
        helperId="ob-summary-help"
        title={firstName ? `You're all set, ${firstName}!` : "You're all set!"}
        helper="Here's what Wael will use to personalize your lessons. You can change it any time from your profile."
        autoFocus={autoFocus}
      />
      <dl className={`${styles.body} ${styles.summary}`}>
        <Row term="Name" editLabel="Edit your name" onEdit={() => onEdit(STEPS.NAME)} disabled={disabled}>
          {answers.fullName.trim()}
        </Row>
        <Row term="French level" editLabel="Edit your level" onEdit={() => onEdit(STEPS.LEVEL)} disabled={disabled}>
          {levelLabel(answers.level)}
        </Row>
        <Row term="Goals" editLabel="Edit your goals" onEdit={() => onEdit(STEPS.GOALS)} disabled={disabled}>
          <Choices options={GOAL_OPTIONS} ids={answers.goals} text={answers.goalsText} empty="None yet" />
        </Row>
        <Row
          term="Interests"
          editLabel="Edit your interests"
          onEdit={() => onEdit(STEPS.INTERESTS)}
          disabled={disabled}
        >
          <Choices options={INTEREST_OPTIONS} ids={answers.interests} text={answers.interestsText} empty="Skipped" />
        </Row>
      </dl>
    </>
  )
}
