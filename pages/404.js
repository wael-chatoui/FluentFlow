import Head from 'next/head'
import Link from 'next/link'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import ui from '@/components/ui/ui.module.css'
import { Compass } from 'lucide-react'

// "/" sends everyone to the right place (login, teacher, student or onboarding).
export default function NotFoundPage() {
  return (
    <AuthScreen labelledBy="notfound-title">
      <Head>
        <title>Page not found · Preply Lessons</title>
      </Head>
      <AuthHeader
        id="notfound-title"
        icon={Compass}
        tone="purple"
        title="Oups! Page not found"
        subtitle="This page doesn’t exist, or it went out for a croissant. Let’s get you back on track."
      />
      <Link href="/" className={`${ui.btn} ${ui.green} ${ui.block}`}>
        Take me home
      </Link>
    </AuthScreen>
  )
}
