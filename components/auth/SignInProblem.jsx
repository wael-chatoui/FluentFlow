import { useEffect, useRef } from 'react'
import Link from 'next/link'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import { FAILURES } from '@/components/auth/failures'
import ui from '@/components/ui/ui.module.css'

/**
 * Full-page explanation of why a sign-in did not work, with one clear next step.
 * @param {{ failure: keyof typeof FAILURES, onRetry?: () => void, loginHref?: string, loginLabel?: string }} props
 *   loginHref: /login, with the page the user was heading to as ?next= when known (or the
 *   join page the student came from); loginLabel: replaces the failure's button label
 */
export default function SignInProblem({ failure, onRetry, loginHref = '/login', loginLabel }) {
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
          icon={copy.icon}
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
          {loginLabel || (copy.action === 'retry' ? 'Back to sign in' : copy.actionLabel)}
        </Link>
      )}
    </AuthScreen>
  )
}
