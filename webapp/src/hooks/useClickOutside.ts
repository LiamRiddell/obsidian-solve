import { useEffect, type RefObject } from "react"

/** Calls `onOutside` on any mousedown outside the given element. Ported from playground's `v-click-outside` directive. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [ref, onOutside, active])
}
