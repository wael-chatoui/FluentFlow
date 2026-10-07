import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '@/pages/api/teacher/import/folder'
import * as auth from '@/utils/auth/server'
import * as google from '@/utils/import/google'
import * as adminClient from '@/utils/supabase/admin'

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      res.statusCode = code
      return res
    },
    json(obj) {
      res.data = obj
      return res
    },
    setHeader(k, v) {
      res.headers[k] = v
      return res
    },
    end() {
      return res
    },
  }
  return res
}

describe('POST /api/teacher/import/folder', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(auth, 'requireTeacher').mockResolvedValue({ id: 'teacher-1' })
  })

  it('rejects GET or other methods with 405', async () => {
    const req = { method: 'GET', headers: {} }
    const res = mockRes()
    await handler(req, res)
    expect(res.statusCode).toBe(405)
  })

  it('resolves a public folder and annotates existing lessons in DB', async () => {
    vi.spyOn(google, 'resolveGoogleFolder').mockResolvedValue({
      folderId: 'folder-123',
      folderName: 'Cours Rebecca',
      files: [
        { id: 'f1', name: 'Lecon_01.pdf', kind: 'drive', url: 'https://drive.google.com/file/d/f1/view', dedupeKey: 'google:f1' },
        { id: 'f2', name: 'Lecon_02.pdf', kind: 'drive', url: 'https://drive.google.com/file/d/f2/view', dedupeKey: 'google:f2' },
      ],
    })

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              { id: 'lesson-1', title: 'Leçon 1', lesson_date: '2025-01-10', source_name: 'Lecon_01.pdf' },
            ],
          })),
        })),
      })),
    }
    vi.spyOn(adminClient, 'createAdminClient').mockReturnValue(mockAdmin)

    const req = {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
      body: {
        url: 'https://drive.google.com/drive/folders/folder-123',
        studentId: '11111111-1111-1111-1111-111111111111',
      },
    }
    const res = mockRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.data.folderName).toBe('Cours Rebecca')
    expect(res.data.files).toHaveLength(2)
    // f1 should be annotated with existingLesson
    expect(res.data.files[0].existingLesson).toEqual({
      id: 'lesson-1',
      title: 'Leçon 1',
      lesson_date: '2025-01-10',
      match: 'source',
    })
    // f2 should not be annotated
    expect(res.data.files[1].existingLesson).toBeUndefined()
  })

  it('handles folder resolution error cleanly', async () => {
    vi.spyOn(google, 'resolveGoogleFolder').mockRejectedValue(new Error('Dossier privé'))
    const req = {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
      body: { url: 'https://drive.google.com/drive/folders/folder-123' },
    }
    const res = mockRes()
    await handler(req, res)
    expect(res.statusCode).toBe(500)
    expect(res.data.error).toBeDefined()
  })
})
