import { describe, expect, it } from 'vitest'
import { inArea, isJoinPath, pageLang, pathAfterSignIn, safeNext } from '@/utils/auth/routing'

describe('safeNext', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeNext('/student')).toBe('/student')
    expect(safeNext('/teacher/lessons/abc?tab=exercises#top')).toBe('/teacher/lessons/abc?tab=exercises#top')
    expect(safeNext(['/student/review', '/teacher'])).toBe('/student/review')
  })

  it('rejects missing, relative and oversized values', () => {
    expect(safeNext(undefined)).toBeNull()
    expect(safeNext(null)).toBeNull()
    expect(safeNext('')).toBeNull()
    expect(safeNext(42)).toBeNull()
    expect(safeNext('student')).toBeNull()
    expect(safeNext(`/${'a'.repeat(512)}`)).toBeNull()
  })

  it('rejects anything that could leave the origin', () => {
    expect(safeNext('//evil.com')).toBeNull()
    expect(safeNext('/\\evil.com')).toBeNull()
    expect(safeNext('/a\\b')).toBeNull()
    expect(safeNext('https://evil.com')).toBeNull()
    expect(safeNext('javascript:alert(1)')).toBeNull()
    expect(safeNext('/\t/evil.com')).toBeNull()
    expect(safeNext('/\n/evil.com')).toBeNull()
    expect(safeNext('/ /evil.com')).toBeNull()
    expect(safeNext('/.//evil.com')).toBeNull()
    expect(safeNext('/./..//evil.com')).toBeNull()
  })

  it('keeps encoded characters encoded', () => {
    expect(safeNext('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com')
  })

  it('returns the normalized path, so area checks see the real destination', () => {
    expect(safeNext('/teacher/../logout')).toBe('/logout')
    expect(safeNext('/student/%2e%2e/teacher?x=1')).toBe('/teacher?x=1')
    expect(pathAfterSignIn({ role: 'teacher', next: '/teacher/../logout' })).toBe('/teacher')
    expect(pathAfterSignIn({ role: 'student', onboarded: true, next: '/student/../admin' })).toBe('/student')
  })
})

describe('inArea', () => {
  it('matches whole path segments only', () => {
    expect(inArea('/teacher', '/teacher')).toBe(true)
    expect(inArea('/teacher/students/1?x=1', '/teacher')).toBe(true)
    expect(inArea('/teacher?x=1', '/teacher')).toBe(true)
    expect(inArea('/teachers', '/teacher')).toBe(false)
    expect(inArea('/', '/teacher')).toBe(false)
  })
})

describe('pathAfterSignIn', () => {
  it('sends teachers to next inside /teacher or /admin, else /teacher', () => {
    expect(pathAfterSignIn({ role: 'teacher' })).toBe('/teacher')
    expect(pathAfterSignIn({ role: 'teacher', next: '/teacher/lessons/1' })).toBe('/teacher/lessons/1')
    expect(pathAfterSignIn({ role: 'teacher', next: '/admin/users' })).toBe('/admin/users')
    expect(pathAfterSignIn({ role: 'teacher', next: '/student' })).toBe('/teacher')
    expect(pathAfterSignIn({ role: 'teacher', next: '/teachers-evil' })).toBe('/teacher')
    expect(pathAfterSignIn({ role: 'teacher', next: '//evil.com/teacher' })).toBe('/teacher')
  })

  it('teachers are never pending, whatever the flag says', () => {
    expect(pathAfterSignIn({ role: 'teacher', approved: false })).toBe('/teacher')
  })

  it('sends accounts waiting for approval to /pending before anything else', () => {
    expect(pathAfterSignIn({ role: 'student', approved: false, onboarded: true, next: '/student' })).toBe('/pending')
    expect(pathAfterSignIn({ role: 'student', approved: false, isAdmin: true, next: '/admin' })).toBe('/pending')
  })

  it('treats a missing approval flag as approved (like the server)', () => {
    expect(pathAfterSignIn({ role: 'student', onboarded: true })).toBe('/student')
  })

  it('sends students to onboarding first, then to next inside /student', () => {
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: false, next: '/student/review' })).toBe('/onboarding')
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: true })).toBe('/student')
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: true, next: '/student/lessons/1/practice' })).toBe(
      '/student/lessons/1/practice'
    )
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: true, next: '/teacher' })).toBe('/student')
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: true, next: '/login' })).toBe('/student')
  })

  it('lets a student admin go back to the back office', () => {
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: false, isAdmin: true, next: '/admin/lessons' })).toBe(
      '/admin/lessons'
    )
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: true, isAdmin: false, next: '/admin' })).toBe('/student')
  })

  it('sends students back to a join link, even before approval and onboarding', () => {
    expect(pathAfterSignIn({ role: 'student', approved: false, next: '/join/abc' })).toBe('/join/abc')
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: false, next: '/join/abc' })).toBe('/join/abc')
    expect(pathAfterSignIn({ role: 'student', approved: true, onboarded: true, next: '/join/abc' })).toBe('/join/abc')
    expect(pathAfterSignIn({ role: 'teacher', next: '/join/abc' })).toBe('/teacher')
    expect(pathAfterSignIn({ role: 'student', approved: false, next: '/join' })).toBe('/pending')
    expect(pathAfterSignIn({ role: 'student', approved: false, next: '/join/../student' })).toBe('/pending')
    expect(pathAfterSignIn({ role: 'student', approved: false, next: '/joined' })).toBe('/pending')
    expect(pathAfterSignIn({ role: 'student', approved: false, next: '//evil.com/join/abc' })).toBe('/pending')
  })

  it('handles no input', () => {
    expect(pathAfterSignIn()).toBe('/onboarding')
  })
})

describe('pageLang', () => {
  it('is French in the teacher area and the back office, English elsewhere', () => {
    expect(pageLang('/teacher')).toBe('fr')
    expect(pageLang('/teacher/lessons/[id]')).toBe('fr')
    expect(pageLang('/admin/forbidden')).toBe('fr')
    expect(pageLang('/student')).toBe('en')
    expect(pageLang('/login')).toBe('en')
    expect(pageLang('/404')).toBe('en')
    expect(pageLang(undefined)).toBe('en')
  })
})

describe('isJoinPath', () => {
  it('matches /join/<token> only', () => {
    expect(isJoinPath('/join/abc')).toBe(true)
    expect(isJoinPath('/join/abc?x=1')).toBe(true)
    expect(isJoinPath('/join')).toBe(false)
    expect(isJoinPath('/join/')).toBe(false)
    expect(isJoinPath('/joined/abc')).toBe(false)
  })
})
