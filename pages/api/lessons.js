// API route: List lesson PDFs from Supabase Storage bucket
// No SQL table needed — we list files directly from the "lesson-pdfs" bucket
import { createClient } from '@/utils/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const supabase = createClient({ req, res })

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // List all files in the bucket that match this student's ID
    const { data: files, error: listError } = await supabase.storage
      .from('lesson-pdfs')
      .list('', {
        limit: 100,
        sortBy: { column: 'updated_at', order: 'desc' },
      })

    if (listError) throw listError

    // Filter files belonging to this student (files are named `<studentId>_lesson.pdf`)
    const studentFiles = (files || [])
      .filter((f) => f.name && f.name.startsWith(user.id))
      .map((f) => {
        const { data: urlData } = supabase.storage
          .from('lesson-pdfs')
          .getPublicUrl(f.name)
        return {
          name: f.name,
          url: urlData?.publicUrl,
          lastModified: f.updated_at || f.created_at,
          size: f.metadata?.size,
        }
      })

    return res.status(200).json({ lessons: studentFiles })
  } catch (err) {
    console.error('Error listing lessons:', err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
