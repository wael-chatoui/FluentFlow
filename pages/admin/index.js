import Link from 'next/link'
import AdminShell from '@/components/admin/AdminShell'
import StatusPill from '@/components/admin/common/StatusPill'
import { ToastViewport } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import {
  cx,
  displayName,
  formatCompact,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  formatShortDay,
  formatDate,
  formatUsd,
  initialsOf,
} from '@/components/admin/common/format'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import d from '@/components/admin/common/dashboard.module.css'

const SERIES = [
  { key: 'signups', label: 'Inscriptions', tone: d.seriesBlue },
  { key: 'lessons', label: 'Leçons', tone: d.seriesPurple },
  { key: 'sessions', label: "Sessions d'exercices", tone: d.seriesGreen },
]

function pct(part, whole) {
  if (!whole) return null
  return Math.round((part / whole) * 100)
}

function buildTiles(stats) {
  const t = stats?.totals || {}
  const ai = stats?.ai || {}
  const tokens = (Number(ai.prompt_tokens) || 0) + (Number(ai.completion_tokens) || 0)
  const onboardedPct = pct(t.onboarded, t.students)
  const publishedPct = pct(t.lessons_published, t.lessons)
  return [
    { key: 'users', emoji: '👥', label: 'Utilisateurs', value: formatNumber(t.users), tone: d.blue, href: '/admin/users' },
    { key: 'students', emoji: '🎓', label: 'Élèves', value: formatNumber(t.students), tone: d.blue, href: '/admin/users?role=student' },
    { key: 'teachers', emoji: '🧑‍🏫', label: 'Profs', value: formatNumber(t.teachers), tone: d.orange, href: '/admin/users?role=teacher' },
    { key: 'admins', emoji: '🛠️', label: 'Admins', value: formatNumber(t.admins), tone: d.purple, href: '/admin/users?role=admin' },
    {
      key: 'onboarded',
      emoji: '✅',
      label: 'Onboardés',
      value: formatNumber(t.onboarded),
      sub: onboardedPct !== null ? `${onboardedPct} % des élèves` : null,
      tone: d.green,
    },
    { key: 'lessons', emoji: '📚', label: 'Leçons', value: formatNumber(t.lessons), tone: d.purple, href: '/admin/lessons' },
    {
      key: 'published',
      emoji: '🚀',
      label: 'Publiées',
      value: formatNumber(t.lessons_published),
      sub: publishedPct !== null ? `${publishedPct} % des leçons` : null,
      tone: d.green,
      href: '/admin/lessons?status=published',
    },
    {
      key: 'failed',
      emoji: '💥',
      label: 'Échecs',
      value: formatNumber(t.lessons_failed),
      tone: t.lessons_failed > 0 ? d.red : undefined,
      href: '/admin/lessons?status=failed',
    },
    { key: 'sessions', emoji: '🏋️', label: "Sessions d'exercices", value: formatNumber(t.practice_sessions), tone: d.yellow },
    { key: 'reviews', emoji: '🔁', label: 'Révisions', value: formatNumber(t.review_attempts), tone: d.pink },
    {
      key: 'success',
      emoji: '🎯',
      label: 'Taux de réussite',
      value: stats?.successRate === null || stats?.successRate === undefined ? '—' : formatPercent(stats.successRate),
      sub: 'Moyenne score / total',
      tone: d.green,
    },
    {
      key: 'ai',
      emoji: '🤖',
      label: 'Coût IA estimé',
      value: formatUsd(ai.estimated_cost_usd),
      sub: `${formatNumber(ai.calls || 0)} appels · ${formatCompact(tokens)} tokens (${formatCompact(ai.prompt_tokens || 0)} entrée + ${formatCompact(ai.completion_tokens || 0)} sortie)`,
      title:
        ai.price_input_per_m !== undefined
          ? `Tarifs : ${formatUsd(ai.price_input_per_m)} / M tokens en entrée, ${formatUsd(ai.price_output_per_m)} / M en sortie`
          : undefined,
      tone: d.orange,
    },
  ]
}

function Tiles({ stats }) {
  const tiles = buildTiles(stats)
  return (
    <ul className={d.tiles} aria-label="Indicateurs clés">
      {tiles.map((tile) => {
        const inner = (
          <>
            <span className={d.tileLabel}>
              <span aria-hidden="true">{tile.emoji}</span>
              {tile.label}
            </span>
            <span className={d.tileValue}>
              {tile.value}
              {tile.sub && <span className={d.tileSub}>{tile.sub}</span>}
            </span>
          </>
        )
        const className = cx(d.tile, tile.tone)
        return (
          <li key={tile.key} className={d.tileCell}>
            {tile.href ? (
              <Link href={tile.href} className={className} title={tile.title}>
                {inner}
              </Link>
            ) : (
              <div className={className} title={tile.title}>
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TilesSkeleton() {
  return (
    <div className={d.tiles} aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={cx(d.tile, d.tileSkel)}>
          <span className={ui.skel} style={{ width: '60%', height: 12 }} />
          <span className={ui.skel} style={{ width: 56, height: 26 }} />
        </div>
      ))}
    </div>
  )
}

function SeriesChart({ label, tone, days, values }) {
  const max = Math.max(1, ...values)
  const n = Math.max(1, values.length)
  const W = 300
  const H = 60
  const slot = W / n
  const barW = Math.max(1, slot * 0.72)
  const total = values.reduce((a, b) => a + b, 0)
  return (
    <div className={cx(d.series, tone)}>
      <div className={d.seriesHead}>
        <span className={d.seriesName}>{label}</span>
        <span>max {formatNumber(Math.max(0, ...values))}/j · total {formatNumber(total)}</span>
      </div>
      <svg className={d.plot} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(2, (v / max) * H) : 0
          return (
            <rect key={days[i] || i} className={d.bar} x={i * slot + (slot - barW) / 2} y={H - h} width={barW} height={h} rx="1">
              <title>{`${formatDate(days[i])} : ${formatNumber(v)}`}</title>
            </rect>
          )
        })}
        <line className={d.baseline} x1="0" y1={H} x2={W} y2={H} />
      </svg>
    </div>
  )
}

function ActivityChart({ last30 }) {
  const days = Array.isArray(last30?.days) ? last30.days : []
  const series = SERIES.map((sr) => {
    const raw = Array.isArray(last30?.[sr.key]) ? last30[sr.key] : []
    const values = days.map((_, i) => Number(raw[i]) || 0)
    return { ...sr, values, total: values.reduce((a, b) => a + b, 0) }
  })

  if (days.length === 0) {
    return <p className={s.muted}>Pas encore de données d&apos;activité.</p>
  }

  const mid = days[Math.floor(days.length / 2)]
  const summary = series.map((sr) => `${sr.label} : ${formatNumber(sr.total)}`).join(', ')

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="sr-only">
        Activité des 30 derniers jours, du {formatDate(days[0])} au {formatDate(days[days.length - 1])}. Totaux — {summary}.
        Le détail jour par jour est disponible dans le tableau ci-dessous.
      </figcaption>
      <ul className={d.legend} aria-hidden="true">
        {series.map((sr) => (
          <li key={sr.key} className={sr.tone}>
            <span className={d.swatch} />
            {sr.label} <span className={d.legendTotal}>{formatNumber(sr.total)}</span>
          </li>
        ))}
      </ul>
      <div className={d.charts}>
        {series.map((sr) => (
          <SeriesChart key={sr.key} label={sr.label} tone={sr.tone} days={days} values={sr.values} />
        ))}
      </div>
      <div className={d.axis} aria-hidden="true">
        <span>{formatShortDay(days[0])}</span>
        <span>{formatShortDay(mid)}</span>
        <span>{formatShortDay(days[days.length - 1])}</span>
      </div>
      <details className={d.dataToggle}>
        <summary>Voir les données (tableau)</summary>
        <div className={d.dataTableWrap}>
          <table className={d.dataTable}>
            <caption className="sr-only">Activité quotidienne des 30 derniers jours</caption>
            <thead>
              <tr>
                <th scope="col">Jour</th>
                {series.map((sr) => (
                  <th key={sr.key} scope="col">
                    {sr.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day, ri) => {
                const i = days.length - 1 - ri
                return (
                  <tr key={day}>
                    <th scope="row" style={{ fontWeight: 700 }}>
                      {formatDate(day)}
                    </th>
                    {series.map((sr) => (
                      <td key={sr.key}>{formatNumber(sr.values[i])}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

function ChartSkeleton() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <span className={ui.skel} style={{ width: 140, height: 12, marginBottom: 8 }} />
          <span className={ui.skel} style={{ width: '100%', height: 56 }} />
        </div>
      ))}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className={ui.skel} style={{ width: 38, height: 38, flex: 'none' }} />
          <span style={{ flex: 1 }}>
            <span className={ui.skel} style={{ width: '70%', height: 13, marginBottom: 6 }} />
            <span className={ui.skel} style={{ width: '40%', height: 11 }} />
          </span>
        </div>
      ))}
    </div>
  )
}

function RecentLessons({ lessons }) {
  if (!lessons.length) return <p className={s.muted}>Aucune leçon pour l&apos;instant.</p>
  return (
    <ul className={d.list}>
      {lessons.map((l) => (
        <li key={l.id}>
          <Link href={`/admin/lessons/${l.id}`} className={d.item}>
            <span className={cx(d.avatar, d.lessonIcon)} aria-hidden="true">
              📘
            </span>
            <span className={d.itemMain}>
              <span className={d.itemTitle}>{l.title || 'Leçon sans titre'}</span>
              <span className={d.itemSub}>{l.student_name || 'Élève inconnu'}</span>
            </span>
            <span className={d.itemSide}>
              <StatusPill status={l.status} />
              <time dateTime={l.created_at} title={formatDateTime(l.created_at)}>
                {formatRelative(l.created_at)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function RecentSignups({ signups }) {
  if (!signups.length) return <p className={s.muted}>Aucune inscription pour l&apos;instant.</p>
  return (
    <ul className={d.list}>
      {signups.map((u) => (
        <li key={u.id}>
          <Link href={`/admin/users/${u.id}`} className={d.item}>
            <span className={d.avatar} aria-hidden="true">
              {initialsOf(u.full_name || u.email)}
            </span>
            <span className={d.itemMain}>
              <span className={d.itemTitle}>{displayName(u)}</span>
              {u.full_name && <span className={d.itemSub}>{u.email}</span>}
            </span>
            <span className={d.itemSide}>
              <time dateTime={u.created_at} title={formatDateTime(u.created_at)}>
                {formatRelative(u.created_at)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function AdminDashboard() {
  const { data, error, loading, reload } = useAdminQuery('/api/admin/stats')
  const showSkeleton = loading && !data

  return (
    <AdminShell
      title="Tableau de bord"
      actions={
        <button
          type="button"
          className={cx(ui.btn, ui.small, s.tap, s.blueGhost)}
          onClick={reload}
          disabled={loading}
          aria-busy={loading || undefined}
        >
          {loading ? <span className={s.spinner} aria-hidden="true" /> : <span aria-hidden="true">↻</span>}
          Actualiser
        </button>
      }
    >
      <ToastViewport />
      <div className={s.stack} aria-busy={loading || undefined}>
        {error && (
          <div className={s.alert} role="alert">
            <span aria-hidden="true">⚠️</span>
            <span className={s.alertText}>
              {data ? 'Actualisation impossible : ' : 'Impossible de charger les statistiques : '}
              {error}
            </span>
            <button type="button" className={cx(ui.btn, ui.small, s.tap, s.redGhost)} onClick={reload}>
              Réessayer
            </button>
          </div>
        )}

        {showSkeleton ? <TilesSkeleton /> : data ? <Tiles stats={data} /> : null}

        {(showSkeleton || data) && (
          <section className={s.section} aria-labelledby="activity-title">
            <div className={s.sectionHead}>
              <h2 id="activity-title" className={s.sectionTitle}>
                <span aria-hidden="true">📈</span> Activité — 30 derniers jours
              </h2>
            </div>
            {showSkeleton ? <ChartSkeleton /> : <ActivityChart last30={data.last30} />}
          </section>
        )}

        {(showSkeleton || data) && (
          <div className={d.grid2}>
            <section className={s.section} aria-labelledby="recent-lessons-title">
              <div className={s.sectionHead}>
                <h2 id="recent-lessons-title" className={s.sectionTitle}>
                  <span aria-hidden="true">📚</span> Dernières leçons
                </h2>
                <Link href="/admin/lessons" className={d.seeAll}>
                  Tout voir →
                </Link>
              </div>
              {showSkeleton ? <ListSkeleton /> : <RecentLessons lessons={data.recent?.lessons || []} />}
            </section>
            <section className={s.section} aria-labelledby="recent-signups-title">
              <div className={s.sectionHead}>
                <h2 id="recent-signups-title" className={s.sectionTitle}>
                  <span aria-hidden="true">👋</span> Derniers inscrits
                </h2>
                <Link href="/admin/users" className={d.seeAll}>
                  Tout voir →
                </Link>
              </div>
              {showSkeleton ? <ListSkeleton /> : <RecentSignups signups={data.recent?.signups || []} />}
            </section>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
