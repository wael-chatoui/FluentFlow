import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // We can use the service role key to bypass RLS, or anon key since RLS should be open for SELECT
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: subjects, error } = await supabase
    .from('subjects')
    .select('id, name')
    .order('name')

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.status(200).json({ subjects })
}
