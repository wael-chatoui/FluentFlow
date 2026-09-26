import '../styles/globals.css'
import '../styles/print.css'
import '../styles/tokens.css'
import AuthProvider from '@/components/AuthProvider'
import { appFont } from '@/components/ui/font'

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <style jsx global>{`
        :root {
          --font-app: ${appFont.style.fontFamily};
        }
        html body {
          font-family: var(--font-app);
        }
      `}</style>
      <Component {...pageProps} />
    </AuthProvider>
  )
}

export default MyApp
