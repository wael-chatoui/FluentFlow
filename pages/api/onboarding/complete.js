import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { subjectId, teacherId } = req.body
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Verify the user making the request
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // 1. Insert into student_teacher_relations
  const { error: insertError } = await supabase
    .from('student_teacher_relations')
    .upsert({
      student_id: user.id,
      teacher_id: teacherId,
      subject_id: subjectId
    }, { onConflict: 'student_id' }) // in case they somehow resubmit

  if (insertError) {
    return res.status(500).json({ error: insertError.message })
  }

  // 2. Update user_metadata to set onboarding_completed = true
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, onboarding_completed: true }
  })

  if (updateError) {
    return res.status(500).json({ error: updateError.message })
  }

  res.status(200).json({ success: true })
}
