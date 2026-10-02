// Registers the service worker (production build only) and reports when a new
// version is waiting, so the toolbar can offer "Update".
import { useSyncExternalStore } from 'react'

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()

function setWaiting(sw: ServiceWorker | null) {
  waiting = sw
  listeners.forEach((l) => l())
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const track = (sw: ServiceWorker | null) => {
          // A first install has no controller: nothing to update, the page is already current.
          if (!sw || !navigator.serviceWorker.controller) return
          if (sw.state === 'installed') setWaiting(sw)
          else sw.addEventListener('statechange', () => sw.state === 'installed' && setWaiting(sw))
        }
        // The browser may have found the new version while this page was loading.
        track(reg.waiting ?? reg.installing)
        reg.addEventListener('updatefound', () => track(reg.installing))
        // A tab left open for days still learns about new deploys.
        setInterval(() => void reg.update(), 60 * 60 * 1000)
      })
      .catch(() => {})
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !waiting) return
      reloading = true
      location.reload()
    })
  })
}

export function applyUpdate() {
  waiting?.postMessage('SKIP_WAITING')
}

export function useUpdateReady() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => waiting !== null,
  )
}
