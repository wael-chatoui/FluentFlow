import '../styles/globals.css'
import '../styles/theme.css'
import '../styles/auth.css'
import '../styles/dashboard.css'
import AuthProvider from '@/components/AuthProvider'

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  )
}

export default MyApp
