// API route: Create a new student (teacher-only)
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // Verify caller is a teacher
  const supabase = createClient({ req, res })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (user.user_metadata?.role !== 'teacher') {
    return res.status(403).json({ error: 'Forbidden — teacher role required' })
  }

  const { email, password, fullName } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        role: 'student',
        full_name: fullName || '',
      },
    })

    if (error) throw error

    return res.status(201).json({ user: data.user })
  } catch (err) {
    console.error('Create student error:', err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
