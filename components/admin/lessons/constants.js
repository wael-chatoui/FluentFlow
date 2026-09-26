// Labels shared by the back-office lesson pages (French UI).

export const LESSON_STATUS_LABELS = {
  published: 'Publiée',
  generating: 'En génération',
  failed: 'Échec',
}

export const LESSON_STATUS_FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'published', label: 'Publiées' },
  { value: 'generating', label: 'En génération' },
  { value: 'failed', label: 'En échec' },
]

export const EXERCISE_TYPE_META = {
  mcq: { label: 'QCM', icon: '🔘', tone: 'blue' },
  fill_blank: { label: 'Texte à trous', icon: '✏️', tone: 'orange' },
  match: { label: 'Association', icon: '🔗', tone: 'purple' },
}

export function lessonTitle(lesson) {
  return lesson?.title?.trim() || lesson?.content?.title?.trim() || 'Leçon sans titre'
}
