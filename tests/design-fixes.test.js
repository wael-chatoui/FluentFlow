import { describe, expect, it, vi } from 'vitest'
import { createGuardRegistry, NAVIGATION_CANCELLED } from '@/components/ui/unsavedGuards'

// Minimal stand-ins for next/router's singleton (mitt events + the single beforePopState
// slot, as in next/dist/shared/lib/router/router.js) and for window.
function setup({ confirm = () => true } = {}) {
  const handlers = {}
  const events = {
    on: (type, fn) => (handlers[type] ||= []).push(fn),
    off: (type, fn) => {
      const list = handlers[type] || []
      const i = list.indexOf(fn)
      if (i !== -1) list.splice(i, 1)
    },
    emit: (type, ...args) => (handlers[type] || []).slice().forEach((fn) => fn(...args)),
  }
  const router = {
    asPath: '/teacher/students/1',
    events,
    bps: undefined,
    beforePopState(cb) {
      this.bps = cb
    },
  }
  const winListeners = {}
  const win = {
    confirm: vi.fn(confirm),
    history: { state: { as: '/teacher/students/1', __N: true }, pushState: vi.fn() },
    location: { href: 'http://localhost/teacher/students/1' },
    addEventListener: (type, fn) => (winListeners[type] ||= []).push(fn),
    removeEventListener: (type, fn) => {
      winListeners[type] = (winListeners[type] || []).filter((f) => f !== fn)
    },
  }
  const registry = createGuardRegistry({ router, win })
  const guard = (message) => ({ message, bypass: { current: false } })
  // Like Next: onPopState asks _bps, then (if allowed) starts the route change
  const back = (url = '/teacher') => {
    const allowed = router.bps ? router.bps({ as: url }) : true
    if (allowed) events.emit('routeChangeStart', url, { shallow: false })
    return allowed
  }
  const link = (url = '/teacher') => events.emit('routeChangeStart', url, { shallow: false })
  const unload = () => {
    const e = { preventDefault: vi.fn(), returnValue: undefined }
    ;(winListeners.beforeunload || []).forEach((fn) => fn(e))
    return e.preventDefault.mock.calls.length > 0
  }
  return { registry, router, win, events, handlers, winListeners, guard, back, link, unload }
}

describe('useUnsavedGuard registry: several guards on one page', () => {
  it('keeps the back-button protection when another guard ends (plan done, form still dirty)', () => {
    const { registry, win, guard, back } = setup({ confirm: () => false })
    const removeForm = registry.add(guard('La fiche élève a des modifications non enregistrées.'))
    const removePlan = registry.add(guard('Le plan est en cours de préparation.'))
    removePlan() // the plan arrived

    expect(back()).toBe(false) // still asked, and refused
    expect(win.confirm).toHaveBeenCalledTimes(1)
    expect(win.confirm).toHaveBeenCalledWith('La fiche élève a des modifications non enregistrées.')
    // the guarded page's entry is pushed back so the address bar matches the page
    expect(win.history.pushState).toHaveBeenCalledWith(win.history.state, '', win.location.href)
    removeForm()
  })

  it('asks once per link with the most recent guard’s message, and cancels on « Annuler »', () => {
    const { registry, win, guard, link, events } = setup({ confirm: () => false })
    registry.add(guard('form'))
    registry.add(guard('plan'))
    const onError = vi.fn()
    events.on('routeChangeError', onError)

    expect(() => link('/teacher')).toThrow(NAVIGATION_CANCELLED)
    expect(win.confirm).toHaveBeenCalledTimes(1)
    expect(win.confirm).toHaveBeenCalledWith('plan')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('asks once for Back: a confirmed pop does not ask again on the route change it starts', () => {
    const { registry, win, guard, back, events } = setup({ confirm: () => true })
    registry.add(guard('form'))
    registry.add(guard('plan'))

    expect(back()).toBe(true)
    expect(win.confirm).toHaveBeenCalledTimes(1)
    expect(win.history.pushState).not.toHaveBeenCalled()

    // Same page still mounted after the navigation (other student): guarded again
    events.emit('routeChangeComplete', '/teacher/students/2')
    expect(back()).toBe(true)
    expect(win.confirm).toHaveBeenCalledTimes(2)
  })

  it('a refused navigation keeps the guard armed for the next one', () => {
    const { registry, win, guard, link } = setup({ confirm: () => false })
    registry.add(guard('form'))
    expect(() => link('/a')).toThrow(NAVIGATION_CANCELLED)
    expect(() => link('/b')).toThrow(NAVIGATION_CANCELLED)
    expect(win.confirm).toHaveBeenCalledTimes(2)
  })

  it('a navigation cancelled by the next one does not ask again (the user already agreed)', () => {
    const { registry, win, guard, link, events } = setup({ confirm: () => true })
    registry.add(guard('form'))
    link('/a') // confirmed, still loading
    events.emit('routeChangeError', Object.assign(new Error('Route Cancelled'), { cancelled: true }), '/a')
    link('/b')
    expect(win.confirm).toHaveBeenCalledTimes(1)
    // a real failure (page stays) re-arms it
    events.emit('routeChangeError', new Error('boom'), '/b')
    link('/c')
    expect(win.confirm).toHaveBeenCalledTimes(2)
  })

  it('skips a bypassed guard but still asks for the others', () => {
    const { registry, win, guard, link } = setup({ confirm: () => true })
    const form = guard('form')
    const plan = guard('plan')
    registry.add(form)
    registry.add(plan)

    plan.bypass.current = true
    link('/teacher')
    expect(win.confirm).toHaveBeenCalledWith('form')

    form.bypass.current = true
    win.confirm.mockClear()
    link('/elsewhere')
    expect(win.confirm).not.toHaveBeenCalled()
  })

  it('does not ask for the URL already shown', () => {
    const { registry, win, guard, link, router } = setup()
    registry.add(guard('form'))
    link(router.asPath)
    expect(win.confirm).not.toHaveBeenCalled()
  })

  it('reads the message at ask time (a guard can change its text while active)', () => {
    const { registry, win, guard, link } = setup({ confirm: () => true })
    const g = guard('running')
    registry.add(g)
    g.message = 'unsent'
    link('/teacher')
    expect(win.confirm).toHaveBeenCalledWith('unsent')
  })

  it('blocks reload/close only while an unbypassed guard is active', () => {
    const { registry, guard, unload } = setup()
    const g = guard('form')
    const remove = registry.add(g)
    expect(unload()).toBe(true)
    g.bypass.current = true
    expect(unload()).toBe(false)
    remove()
    expect(unload()).toBe(false)
  })
})

describe('useUnsavedGuard registry: install and cleanup', () => {
  it('installs one set of listeners and clears everything with the last guard', () => {
    const { registry, router, handlers, winListeners, guard } = setup()
    const removeA = registry.add(guard('a'))
    const removeB = registry.add(guard('b'))
    expect(handlers.routeChangeStart).toHaveLength(1)
    expect(winListeners.beforeunload).toHaveLength(1)

    removeA()
    expect(router.bps({})).toBe(true) // B still guards: confirm() → true here
    expect(handlers.routeChangeStart).toHaveLength(1)

    removeB()
    removeB() // idempotent
    expect(registry.size()).toBe(0)
    expect(handlers.routeChangeStart).toHaveLength(0)
    expect(handlers.routeChangeComplete).toHaveLength(0)
    expect(handlers.routeChangeError).toHaveLength(0)
    expect(winListeners.beforeunload).toHaveLength(0)
    expect(router.bps({})).toBe(true)
  })

  it('pushes back the entry shown when the guard was armed, refreshed after each arrival', () => {
    const { registry, win, guard, back, events } = setup({ confirm: () => false })
    registry.add(guard('form'))
    win.history.state = { as: '/teacher/students/2', __N: true }
    win.location.href = 'http://localhost/teacher/students/2'
    events.emit('routeChangeComplete', '/teacher/students/2')

    back()
    expect(win.history.pushState).toHaveBeenCalledWith(
      { as: '/teacher/students/2', __N: true },
      '',
      'http://localhost/teacher/students/2'
    )
  })

  it('re-arms cleanly after being emptied (StrictMode mount → cleanup → mount)', () => {
    const { registry, handlers, guard, link, win } = setup({ confirm: () => false })
    const g = guard('form')
    registry.add(g)()
    registry.add(g)
    expect(handlers.routeChangeStart).toHaveLength(1)
    expect(() => link('/teacher')).toThrow(NAVIGATION_CANCELLED)
    expect(win.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('Icon and Shell tab rendering', () => {
  it('renders standard Lucide icons', async () => {
    const React = (await import('react')).default
    const { default: ReactDOMServer } = await import('react-dom/server')
    const { RotateCcw } = await import('lucide-react')
    const { default: Icon } = await import('@/components/ui/Icon')

    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { icon: RotateCcw, size: 20 }))
    expect(html).toContain('svg')
  })

  it('renders tab icons wrapped with badge components without throwing', async () => {
    const React = (await import('react')).default
    const { default: ReactDOMServer } = await import('react-dom/server')
    const { RotateCcw } = await import('lucide-react')
    const { default: Icon } = await import('@/components/ui/Icon')

    function ReviewIcon(props) {
      return React.createElement(
        'span',
        { className: 'iconWrap' },
        React.createElement(Icon, { icon: RotateCcw, ...props }),
        React.createElement('span', { className: 'badge' }, '5')
      )
    }

    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { icon: ReviewIcon, size: 20 }))
    expect(html).toContain('svg')
    expect(html).toContain('badge')
    expect(html).toContain('5')
  })

  it('safely tolerates already-instantiated elements passed to Icon', async () => {
    const React = (await import('react')).default
    const { default: ReactDOMServer } = await import('react-dom/server')
    const { default: Icon } = await import('@/components/ui/Icon')

    const element = React.createElement('span', { className: 'custom-element' }, 'fallback')
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { icon: element, size: 20 }))
    expect(html).toContain('custom-element')
    expect(html).toContain('fallback')
  })
})
