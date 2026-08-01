import { cn } from "@/lib/utils"

/**
 * The "Solve" wordmark, set in the self-hosted BBH Bartle brand font.
 * Deliberately no letter-spacing/gradient/text-transform — the font face
 * alone carries the brand signal, color is inherited via className.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return <span className={cn("font-brand font-normal leading-none", className)}>Solve</span>
}
