// API route: Update a student (teacher-only)
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT'])
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

  const { userId, email, fullName, role } = req.body ?? {}
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' })
  }

  try {
    const admin = createAdminClient()

    const updates = {}
    if (email) updates.email = email
    if (fullName !== undefined || role) {
      updates.user_metadata = {}
      if (fullName !== undefined) updates.user_metadata.full_name = fullName
      if (role) updates.user_metadata.role = role
    }

    const { data, error } = await admin.auth.admin.updateUserById(userId, updates)
    if (error) throw error

    return res.status(200).json({ user: data.user })
  } catch (err) {
    console.error('Update student error:', err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
