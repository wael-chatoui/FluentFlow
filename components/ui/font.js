// App font (rounded, friendly). Applied globally in pages/_app.js as --font-app.
// Variable font: one file renders every weight used in the CSS (400–900) exactly.
// The latin subset covers French and English (œ, «», accents); the onboarding
// flow loads its own Inter (pages/onboarding.js).
import { Nunito } from 'next/font/google'

export const appFont = Nunito({ subsets: ['latin'], display: 'swap' })
