import { useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/utils/apiClient'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import { formatLessonDate, formatRelative, lessonTitle, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/dashboard/Overview.module.css'

// Lesson groups of GET /api/teacher/overview `attention`, in display order
const LESSON_GROUPS = [
  { key: 'failed', title: 'Générations échouées', icon: '😵', action: 'regenerate' },
  { key: 'stale', title: 'Générations bloquées', icon: '⏳', action: 'regenerate' },
  { key: 'regenFailed', title: 'Régénérations échouées', icon: '⚠️', action: 'regenerate', hint: "L'ancienne version reste en ligne." },
  { key: 'drafts', title: 'Brouillons à publier', icon: '🙈', action: 'publish', hint: "Invisibles pour l'élève tant que tu ne les publies pas." },
]

const PROVIDERS = { google: 'avec Google', email: 'par e-mail' }

function Skeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span className={ui.skel} style={{ width: '40%', height: 18 }} />
      <span className={ui.skel} style={{ height: 56, borderRadius: 14 }} />
      <span className={ui.skel} style={{ height: 56, borderRadius: 14 }} />
    </div>
  )
}

/**
 * « À traiter » on the dashboard: access requests to approve, lessons whose generation
 * failed or is stuck, failed regenerations and drafts to publish, each with its quick action.
 * @param {{ overview: object | null, loading: boolean, error: string | null, onRetry: () => void,
 *   onUpdate: (updater: (overview: object) => object) => void, onRefresh?: () => void,
 *   onStudentsChanged: () => void }} props
 *   onRefresh: re-fetches the overview in the background (keeps what is shown on failure)
 */
export default function AttentionPanel({ overview, loading, error, onRetry, onUpdate, onRefresh, onStudentsChanged }) {
  const mounted = useMountedRef()
  const [states, setStates] = useState({}) // key → { busy, done, error }
  const [toReject, setToReject] = useState(null)
  const [announce, setAnnounce] = useState('')
  const titleRef = useRef(null)

  const setState = (key, value) => setStates((s) => ({ ...s, [key]: value }))

  const run = async (key, request, { onSuccess, done }) => {
    setState(key, { busy: true })
    try {
      await request()
      if (!mounted.current) return
      setState(key, done ? { done } : null)
      onSuccess?.()
    } catch (err) {
      if (mounted.current) setState(key, { error: err.message || "L'action a échoué." })
    }
  }

  // The handled row disappears: the focus goes back to the panel title
  const removeFrom = (group, id) => {
    onUpdate((o) =>
      group === 'pending'
        ? { ...o, pending: o.pending.filter((p) => p.id !== id) }
        : { ...o, attention: { ...o.attention, [group]: o.attention[group].filter((l) => l.id !== id) } }
    )
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  const approve = (p) =>
    run(`pending:${p.id}`, () => api(`/api/teacher/students/${p.id}/approve`, { method: 'POST' }), {
      onSuccess: () => {
        setAnnounce(`Accès accordé à ${studentDisplayName(p)}.`)
        removeFrom('pending', p.id)
        onStudentsChanged()
      },
    })

  const reject = (p) => {
    setToReject(null)
    run(`pending:${p.id}`, () => api(`/api/teacher/students/${p.id}/reject`, { method: 'POST' }), {
      onSuccess: () => {
        setAnnounce(`Demande de ${studentDisplayName(p)} refusée.`)
        removeFrom('pending', p.id)
      },
    })
  }

  const regenerate = (group, lesson) =>
    run(`${group}:${lesson.id}`, () => api(`/api/teacher/lessons/${lesson.id}/regenerate`, { method: 'POST', body: {} }), {
      done: 'Génération relancée',
    })

  // Failed regeneration the teacher accepts (the previous version stays online): clears
  // lessons.error. The row goes at once; the refresh brings the rest of the list up to date.
  const dismiss = (lesson) =>
    run(`regenFailed:${lesson.id}`, () => api(`/api/teacher/lessons/${lesson.id}`, { method: 'PATCH', body: { dismissError: true } }), {
      onSuccess: () => {
        setAnnounce(`Avertissement de « ${lessonTitle(lesson)} » ignoré.`)
        removeFrom('regenFailed', lesson.id)
        onRefresh?.()
      },
    })

  const publish = (lesson) =>
    run(`drafts:${lesson.id}`, () => api(`/api/teacher/lessons/${lesson.id}`, { method: 'PATCH', body: { hidden: false } }), {
      onSuccess: () => {
        setAnnounce(`« ${lessonTitle(lesson)} » est publiée pour l'élève.`)
        removeFrom('drafts', lesson.id)
      },
    })

  if (loading) {
    return (
      <section className={styles.panel} aria-labelledby="todo-title" aria-busy="true">
        <h2 id="todo-title" className={styles.panelTitle}>
          <span aria-hidden="true">📌</span> À traiter
        </h2>
        <Skeleton />
      </section>
    )
  }

  if (error) {
    return (
      <section className={styles.panel} aria-labelledby="todo-title">
        <h2 id="todo-title" className={styles.panelTitle}>
          <span aria-hidden="true">📌</span> À traiter
        </h2>
        <div className={`${bits.alert} ${bits.error}`} role="alert">
          <span className={bits.alertIcon} aria-hidden="true">😕</span>
          <div className={bits.alertBody}>
            <span>{error}</span>
            <div className={bits.alertActions}>
              <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onRetry}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const pending = overview?.pending || []
  const groups = LESSON_GROUPS.map((g) => ({ ...g, items: overview?.attention?.[g.key] || [] })).filter((g) => g.items.length)
  const total = pending.length + groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <section className={`${styles.panel} ${total ? styles.panelTodo : ''}`} aria-labelledby="todo-title">
      <h2 id="todo-title" ref={titleRef} tabIndex={-1} className={styles.panelTitle}>
        <span aria-hidden="true">📌</span> À traiter
        {total > 0 && <span className={styles.badge}>{total}</span>}
      </h2>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>

      {total === 0 ? (
        <p className={styles.allGood}>
          <span aria-hidden="true">🎉 </span>Rien à traiter : tout est à jour.
        </p>
      ) : (
        <div className={styles.groups}>
          {pending.length > 0 && (
            <div className={styles.group}>
              <h3 className={styles.groupTitle}>
                <span aria-hidden="true">🙋 </span>Demandes d&apos;accès
              </h3>
              <p className={styles.groupHint}>Comptes créés sans invitation : accepte seulement tes élèves.</p>
              <ul className={styles.items}>
                {pending.map((p) => {
                  const state = states[`pending:${p.id}`]
                  return (
                    <li key={p.id} className={styles.item}>
                      <div className={styles.itemText}>
                        <span className={styles.itemTitle}>{studentDisplayName(p)}</span>
                        <span className={styles.itemMeta}>
                          {p.full_name ? `${p.email} · ` : ''}
                          {PROVIDERS[p.provider] ? `inscrit ${PROVIDERS[p.provider]} · ` : ''}
                          {formatRelative(p.created_at)}
                        </span>
                        {state?.error && <span className={styles.itemError} role="alert">{state.error}</span>}
                      </div>
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`}
                          onClick={() => approve(p)}
                          disabled={state?.busy}
                        >
                          {state?.busy && <span className={bits.spinner} aria-hidden="true" />} Accepter
                          <span className="sr-only"> {studentDisplayName(p)}</span>
                        </button>
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap}`}
                          onClick={() => setToReject(p)}
                          disabled={state?.busy}
                        >
                          Refuser<span className="sr-only"> {studentDisplayName(p)}</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.key} className={styles.group}>
              <h3 className={styles.groupTitle}>
                <span aria-hidden="true">{group.icon} </span>
                {group.title}
              </h3>
              {group.hint && <p className={styles.groupHint}>{group.hint}</p>}
              <ul className={styles.items}>
                {group.items.map((lesson) => {
                  const state = states[`${group.key}:${lesson.id}`]
                  const title = lessonTitle(lesson)
                  return (
                    <li key={lesson.id} className={styles.item}>
                      <div className={styles.itemText}>
                        <Link href={`/teacher/lessons/${lesson.id}`} className={styles.itemLink}>
                          {title}
                        </Link>
                        <span className={styles.itemMeta}>
                          {lesson.student_name || 'Élève'} · {formatLessonDate(lesson.lesson_date)}
                        </span>
                        {lesson.error && group.key !== 'drafts' && (
                          <span className={styles.itemDetail} title={lesson.error}>
                            {lesson.error}
                          </span>
                        )}
                        {state?.error && <span className={styles.itemError} role="alert">{state.error}</span>}
                      </div>
                      <div className={styles.itemActions}>
                        {state?.done ? (
                          <Link href={`/teacher/lessons/${lesson.id}`} className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap}`}>
                            <span aria-hidden="true">✓</span> {state.done} · Suivre
                          </Link>
                        ) : group.action === 'publish' ? (
                          <button
                            type="button"
                            className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`}
                            onClick={() => publish(lesson)}
                            disabled={state?.busy}
                          >
                            {state?.busy && <span className={bits.spinner} aria-hidden="true" />} Publier
                            <span className="sr-only"> « {title} »</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={`${ui.btn} ${ui.small} ${ui.orange} ${bits.tap}`}
                              onClick={() => regenerate(group.key, lesson)}
                              disabled={state?.busy}
                            >
                              {state?.busy ? <span className={bits.spinner} aria-hidden="true" /> : <span aria-hidden="true">🔄</span>}{' '}
                              Régénérer<span className="sr-only"> « {title} »</span>
                            </button>
                            {group.key === 'regenFailed' && (
                              <button
                                type="button"
                                className={`${ui.btn} ${ui.small} ${bits.tap}`}
                                onClick={() => dismiss(lesson)}
                                disabled={state?.busy}
                              >
                                Ignorer<span className="sr-only"> l&apos;échec de « {title} »</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toReject)}
        title="Refuser cette demande ?"
        message={
          toReject
            ? `Le compte ${toReject.email} sera supprimé. La personne pourra refaire une demande plus tard.`
            : undefined
        }
        confirmLabel="Refuser et supprimer"
        danger
        onConfirm={() => reject(toReject)}
        onCancel={() => setToReject(null)}
      />
    </section>
  )
}
