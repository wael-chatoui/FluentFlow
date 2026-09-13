// API route: Generate a lesson PDF and upload it to Supabase Storage
import { promises as fs } from 'fs'
import path from 'path'
import { generate_lesson, create_pdf } from '@/utils/lesson_manager'
import { createClient } from '@/utils/supabase/server'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // Auth via cookies (SSR-aware client)
  const supabase = createClient({ req, res })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { studentId, instruction } = req.body ?? {}
  if (!studentId || !instruction) {
    return res.status(400).json({ error: 'Missing studentId or instruction' })
  }

  try {
    // Generate lesson markdown
    const markdown = await generate_lesson(studentId, instruction)

    // Ensure output directory exists
    const pdfDir = path.resolve(process.cwd(), 'tmp', 'pdfs')
    await fs.mkdir(pdfDir, { recursive: true })

    const timestamp = Date.now()
    const filename = `${studentId}_lesson_${timestamp}.pdf`
    const pdfPath = path.join(pdfDir, filename)

    // Create PDF locally
    await create_pdf(markdown, pdfPath)

    // Upload PDF to Supabase Storage bucket "lesson-pdfs"
    const fileBuffer = await fs.readFile(pdfPath)
    const { error: uploadError } = await supabase.storage
      .from('lesson-pdfs')
      .upload(filename, fileBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'application/pdf',
      })

    if (uploadError) throw uploadError

    // Get public URL
    const { data: publicData } = supabase.storage
      .from('lesson-pdfs')
      .getPublicUrl(filename)
    const pdfUrl = publicData?.publicUrl

    // Clean up local temp file
    await fs.unlink(pdfPath).catch(() => {})

    return res.status(200).json({ pdfUrl })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
