import {
  ArrowLeftRight,
  Banknote,
  BinaryIcon,
  Bitcoin,
  Braces,
  CalendarDays,
  CalendarSearch,
  Calculator,
  ChartColumn,
  Clapperboard,
  Clock,
  Dices,
  FileText,
  GitBranch,
  Globe,
  Infinity as InfinityIcon,
  Move3d,
  Percent,
  RadioTower,
  Rows3,
  Ruler,
  Sparkles,
  SquareFunction,
  TrendingUp,
  Variable,
  type LucideIcon,
} from "lucide-react"

/**
 * Per-category identity for the Examples menu: a lucide glyph plus a tone drawn from the
 * categorical chart tokens (see index.css). Tones are passed as raw CSS vars rather than
 * `text-chart-N` classes so Tailwind never has to see a dynamically-built class name.
 *
 * Hues are assigned by domain, not cycled: money is green, clocks/dates are blue, measurement
 * and conversion are teal, code-shaped things are violet.
 */
export interface CategoryMeta {
  icon: LucideIcon
  tone: string
}

const VIOLET = "var(--chart-1)"
const ORANGE = "var(--chart-2)"
const TEAL = "var(--chart-3)"
const GOLD = "var(--chart-4)"
const PINK = "var(--chart-5)"
const GREEN = "var(--chart-6)"
const BLUE = "var(--chart-7)"
const CORAL = "var(--chart-8)"

const CATEGORY_META: Record<string, CategoryMeta> = {
  Arithmetic: { icon: Calculator, tone: VIOLET },
  Percentage: { icon: Percent, tone: PINK },
  "Date & Time": { icon: CalendarDays, tone: BLUE },
  "Day Questions": { icon: CalendarSearch, tone: BLUE },
  Dice: { icon: Dices, tone: CORAL },
  Variables: { icon: Variable, tone: VIOLET },
  "Units of Measurement": { icon: Ruler, tone: TEAL },
  Currency: { icon: Banknote, tone: GREEN },
  CryptoCurrency: { icon: Bitcoin, tone: ORANGE },
  Functions: { icon: SquareFunction, tone: VIOLET },
  Vectors: { icon: Move3d, tone: TEAL },
  BigInt: { icon: InfinityIcon, tone: GOLD },
  Time: { icon: Clock, tone: BLUE },
  "Video Timecode": { icon: Clapperboard, tone: PINK },
  Conditionals: { icon: GitBranch, tone: ORANGE },
  Converters: { icon: ArrowLeftRight, tone: TEAL },
  Statistics: { icon: ChartColumn, tone: GOLD },
  "Bases & Bitwise": { icon: BinaryIcon, tone: GREEN },
  "Time Zones": { icon: Globe, tone: BLUE },
  Finance: { icon: TrendingUp, tone: GREEN },
  "User-Defined Functions": { icon: Braces, tone: VIOLET },
  "Cross-Line Data Access": { icon: Rows3, tone: GOLD },
  "Live Data": { icon: RadioTower, tone: CORAL },
  "Knowledge Queries": { icon: Sparkles, tone: ORANGE },
}

const FALLBACK: CategoryMeta = { icon: FileText, tone: VIOLET }

/** Never throws for an unmapped category — new engine features get a neutral glyph until mapped. */
export function categoryMeta(name: string): CategoryMeta {
  return CATEGORY_META[name] ?? FALLBACK
}
