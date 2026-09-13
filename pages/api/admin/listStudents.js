// API route: List all students (teacher-only)
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
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

  try {
    const admin = createAdminClient()
    const { data: { users }, error } = await admin.auth.admin.listUsers({
      perPage: 100,
    })

    if (error) throw error

    // Filter only students
    const students = (users || [])
      .filter((u) => u.user_metadata?.role === 'student')
      .map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        user_metadata: u.user_metadata,
      }))

    return res.status(200).json({ students })
  } catch (err) {
    console.error('List students error:', err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
