import Link from 'next/link'
import styles from '@/components/teacher/lessons/lessonUi.module.css'

/** "‹ LABEL" link shown above a teacher lesson page. */
export default function BackLink({ href, label }) {
  return (
    <Link href={href} className={`${styles.back} no-print`}>
      <span className={styles.backArrow} aria-hidden="true">‹</span>
      <span>{label}</span>
    </Link>
  )
}
