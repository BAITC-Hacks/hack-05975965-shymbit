import { useEffect, useRef } from 'react'

const revealSelector = [
  '.sana-hero__copy > *', '.editorial-heading', '.journey-step', '.pathway',
  '.challenge-card', '.team-card', '.hub-panel', '.assistant-hub', '.form-card',
  '.application-card', '.directory-heading', '.page-heading', '.page-title-row',
  '.task-header', '.team-profile-header', '.state-card',
].join(',')

/** Появление блоков один раз, без скрытия контента и без обработчика скролла. */
export function usePageMotion(pathname: string) {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const seen = new WeakSet<Element>()
    const running = new Set<Animation>()
    let frame = 0
    let stopped = false

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        if (preference.matches || typeof entry.target.animate !== 'function') continue
        const element = entry.target
        const siblings = element.parentElement ? Array.from(element.parentElement.children) : []
        const delay = Math.min(Math.max(siblings.indexOf(element), 0), 3) * 55
        const animation = element.animate([
          { opacity: 0, transform: 'translate3d(0, 16px, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        ], { duration: 480, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' })
        running.add(animation)
        animation.finished.then(() => running.delete(animation), () => running.delete(animation))
      }
    }, { threshold: .08, rootMargin: '0px 0px -12px 0px' })

    const scan = () => {
      frame = 0
      if (stopped || preference.matches) return
      root.querySelectorAll(revealSelector).forEach((element) => {
        if (seen.has(element)) return
        seen.add(element)
        observer.observe(element)
      })
    }
    const changes = new MutationObserver(() => {
      if (!frame && !preference.matches) frame = requestAnimationFrame(scan)
    })
    const onPreferenceChange = () => {
      if (preference.matches) {
        observer.disconnect()
        running.forEach((animation) => animation.cancel())
        running.clear()
      } else scan()
    }
    scan()
    changes.observe(root, { childList: true, subtree: true })
    preference.addEventListener('change', onPreferenceChange)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      changes.disconnect()
      preference.removeEventListener('change', onPreferenceChange)
      running.forEach((animation) => animation.cancel())
    }
  }, [pathname])

  return rootRef
}
