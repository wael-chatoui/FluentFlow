// App font (rounded, friendly). Applied globally in pages/_app.js as --font-app.
// The onboarding flow keeps its own Inter look via --font-sans.
import { Nunito } from 'next/font/google'

export const appFont = Nunito({ subsets: ['latin', 'latin-ext'], weight: ['500', '700', '800', '900'], display: 'swap' })
