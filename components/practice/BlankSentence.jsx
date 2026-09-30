import { RichTextInline } from '@/components/lesson/RichText'

/**
 * A French exercise sentence split around its blank: `children` (the blank, the
 * input or the answer) goes between the two halves. `parts` comes from splitBlank().
 * @param {{ parts: [string, string], className?: string, children?: React.ReactNode }} props
 */
export default function BlankSentence({ parts, className, children }) {
  return (
    <p className={className} lang="fr">
      <RichTextInline text={parts[0]} keepSpaces />
      {children}
      <RichTextInline text={parts[1]} keepSpaces />
    </p>
  )
}
