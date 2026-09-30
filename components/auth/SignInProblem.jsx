import { useEffect, useRef } from 'react'
import Link from 'next/link'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import { FAILURES } from '@/components/auth/failures'
import ui from '@/components/ui/ui.module.css'

/**
 * Full-page explanation of why a sign-in did not work, with one clear next step.
 * @param {{ failure: keyof typeof FAILURES, onRetry?: () => void, loginHref?: string }} props
 *   loginHref: /login, with the page the user was heading to as ?next= when known
 */
export default function SignInProblem({ failure, onRetry, loginHref = '/login' }) {
  const copy = FAILURES[failure] || FAILURES.generic
  const actionRef = useRef(null)

  // Move focus to the way out, so keyboard and screen-reader users land on it
  useEffect(() => {
    actionRef.current?.focus()
  }, [failure])

  return (
    <AuthScreen labelledBy="signin-problem-title">
      <div role="alert">
        <AuthHeader
          id="signin-problem-title"
          emoji={copy.emoji}
          tone={copy.action === 'retry' ? 'blue' : 'orange'}
          title={copy.title}
          subtitle={copy.text}
        />
      </div>
      {copy.action === 'retry' && onRetry ? (
        <button ref={actionRef} type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={onRetry}>
          {copy.actionLabel}
        </button>
      ) : (
        <Link ref={actionRef} href={loginHref} className={`${ui.btn} ${ui.green} ${ui.block}`}>
          {copy.action === 'retry' ? 'Back to sign in' : copy.actionLabel}
        </Link>
      )}
    </AuthScreen>
  )
}
