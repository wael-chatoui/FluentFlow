import Document, { Head, Html, Main, NextScript } from 'next/document'
import { pageLang } from '@/utils/auth/routing'

// Tab icon (no static files needed): the French flag on a rounded tile
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3CclipPath id='r'%3E%3Crect width='64' height='64' rx='16'/%3E%3C/clipPath%3E%3Cg clip-path='url(%23r)'%3E%3Crect width='22' height='64' fill='%23002395'/%3E%3Crect x='21' width='22' height='64' fill='%23fff'/%3E%3Crect x='42' width='22' height='64' fill='%23ed2939'/%3E%3C/g%3E%3C/svg%3E"

/**
 * <html lang>: French for the teacher area and the back office, English elsewhere
 * (screen readers pick the right voice; api() also picks its error language from it).
 * pages/_app.js keeps it in sync on client-side navigations.
 */
export default class AppDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps, lang: pageLang(ctx.pathname) }
  }

  render() {
    return (
      <Html lang={this.props.lang || 'en'}>
        <Head>
          <link rel="icon" href={FAVICON} type="image/svg+xml" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
