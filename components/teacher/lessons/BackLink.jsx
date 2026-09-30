import Link from 'next/link'
import styles from '@/components/teacher/lessons/lessonUi.module.css'
import { ChevronLeft } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/** "‹ LABEL" link shown above a teacher lesson page. */
export default function BackLink({ href, label }) {
  return (
    <Link href={href} className={`${styles.back} no-print`}>
      <span className={styles.backArrow} aria-hidden="true">
        <Icon icon={ChevronLeft} size={20} strokeWidth={3} />
      </span>
      <span>{label}</span>
    </Link>
  )
}
