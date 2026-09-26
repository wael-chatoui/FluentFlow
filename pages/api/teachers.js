import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Fetch all users with the role 'teacher'
  const { data, error } = await supabase.auth.admin.listUsers()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const teachers = data.users
    .filter(u => u.user_metadata?.role === 'teacher')
    .map(t => ({
      id: t.id,
      name: t.user_metadata?.full_name || t.email,
    }))

  res.status(200).json({ teachers })
}
