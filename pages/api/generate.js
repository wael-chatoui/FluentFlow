// File: /Users/wael/Documents/Preply/webapp/pages/api/generate.js
import { promises as fs } from 'fs'
import path from 'path'
import { generate_lesson, create_pdf } from '@/utils/lesson_manager'
import { supabase } from '@/utils/supabaseClient'

export default async function handler(req, res) {
  // Protect route – require valid Supabase JWT
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }
  const { studentId, instruction } = req.body ?? {}
  if (!studentId || !instruction) {
    return res.status(400).json({ error: 'Missing studentId or instruction' })
  }
  try {
    // Generate lesson markdown
    const markdown = await generate_lesson(studentId, instruction)
    // Ensure output directory exists (temporary local path for PDF generation)
    const pdfDir = path.resolve(process.cwd(), 'tmp', 'pdfs')
    await fs.mkdir(pdfDir, { recursive: true })
    const pdfPath = path.join(pdfDir, `${studentId}_lesson.pdf`)
    // Create PDF locally
    await create_pdf(markdown, pdfPath)
    // Upload PDF to Supabase Storage bucket "lesson-pdfs"
    const fileBuffer = await fs.readFile(pdfPath)
    const { error: uploadError } = await supabase.storage
      .from('lesson-pdfs')
      .upload(`${studentId}_lesson.pdf`, fileBuffer, { cacheControl: '3600', upsert: true })
    if (uploadError) throw uploadError
    // Get public URL
    const { data: publicData } = supabase.storage.from('lesson-pdfs').getPublicUrl(`${studentId}_lesson.pdf`)
    const pdfUrl = publicData?.publicUrl
    return res.status(200).json({ pdfUrl })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
