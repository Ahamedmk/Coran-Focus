// src/pages/Stats.jsx
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts"

// --- Branding ---
const NAVY = "#0B1535";      // bleu nuit
const NAVY_SOFT = "#111A3B"; // navy un peu + clair
const GOLD = "#D4AF37";      // or
const GOLD_SOFT = "#F6E7B2"; // or très clair

// --- Helpers ---
const fmtDay = (d) => d.toISOString().slice(0, 10)
const weekKey = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    )
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

// --- Heatmap (simple, léger, no-lib) ---
function Heatmap({ data, months = 6 }) {
  // data: [{ day:'YYYY-MM-DD', count:number }]
  const byDay = useMemo(() => {
    const map = new Map()
    data.forEach((d) => map.set(d.day, d.count))
    return map
  }, [data])

  const days = useMemo(() => {
    const result = []
    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - months)
    start.setHours(0, 0, 0, 0)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      result.push(new Date(d))
    }
    return result
  }, [months])

  const max = useMemo(() => {
    let m = 0
    for (const [, c] of byDay) if (c > m) m = c
    return m
  }, [byDay])

  const colorFor = (c) => {
    if (!c) return NAVY_SOFT
    // 4 niveaux vers l’or
    if (c >= (max * 3) / 4) return GOLD
    if (c >= (max * 2) / 4) return "#E5C454"
    if (c >= max / 4) return "#F0D77E"
    return GOLD_SOFT
  }

  // grille en colonnes (semaines)
  // on regroupe par semaine (dimanche->samedi pour l’affichage compact)
  const weeks = useMemo(() => {
    const cols = []
    let col = []
    let currentWeekDay = days[0].getDay()
    days.forEach((d) => {
      if (col.length === 0) {
        // pré-remplir du vide si la 1ère colonne ne commence pas dimanche
        for (let i = 0; i < d.getDay(); i++) col.push(null)
      }
      col.push(d)
      if (d.getDay() === 6) {
        cols.push(col)
        col = []
      }
    })
    if (col.length) cols.push(col)
    return cols
  }, [days])

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, r) => {
              const date = col?.[r] ?? null
              const key = date ? fmtDay(date) : `empty-${i}-${r}`
              const c = date ? byDay.get(key) || 0 : 0
              const bg = date ? colorFor(c) : "transparent"
              const title = date ? `${key} · ${c} révision(s)` : ""
              return (
                <div
                  key={key}
                  title={title}
                  className="w-3 h-3 rounded-sm border border-black/10"
                  style={{ backgroundColor: bg }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Stats() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const [progress, setProgress] = useState(null)
  const [reviews, setReviews] = useState([])
  const [segmentsDone, setSegmentsDone] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setErr(null)

        // 1) Vue des stats
        const { data: prog, error: e1 } = await supabase
          .from("user_progress_stats")
          .select("*")
          .single()
        if (e1 && e1.code !== "PGRST116") throw e1
        if (!cancelled) setProgress(prog || null)

        // 2) Révisions
        const { data: revs, error: e2 } = await supabase
          .from("review_logs")
          .select("reviewed_at")
          .order("reviewed_at", { ascending: true })
        if (e2) throw e2
        if (!cancelled) setReviews(revs || [])

        // 3) Segments complétés — select alias + filtre/ordre sur la vraie colonne
        const { data: segs, error: e3 } = await supabase
          .from("program_segments")
          .select("done_at:completed_at")
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: true })
        if (e3) throw e3
        if (!cancelled) setSegmentsDone(segs || [])
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // --- Dérivées ---
  // KPIs
  const totalAyahs = progress?.total_ayahs_memorized ?? reviews.length
  const totalSegments = segmentsDone.length

  // Révisions par jour
  const reviewsPerDay = useMemo(() => {
    const m = new Map()
    reviews.forEach((r) => {
      const k = fmtDay(new Date(r.reviewed_at))
      m.set(k, (m.get(k) || 0) + 1)
    })
    return Array.from(m.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, count]) => ({ day, count }))
  }, [reviews])

  // Streak
  const streak = useMemo(() => {
    if (reviewsPerDay.length === 0) return 0
    let s = 0
    const setDays = new Set(reviewsPerDay.map((d) => d.day))
    const cur = new Date()
    // normalise au jour courant
    cur.setHours(0, 0, 0, 0)
    while (true) {
      const key = fmtDay(cur)
      if (!setDays.has(key)) break
      s++
      cur.setDate(cur.getDate() - 1)
    }
    return s
  }, [reviewsPerDay])

  // Segments par semaine
  const segmentsPerWeek = useMemo(() => {
    const m = new Map()
    segmentsDone.forEach((s) => {
      if (!s.done_at) return
      const k = weekKey(new Date(s.done_at))
      m.set(k, (m.get(k) || 0) + 1)
    })
    return Array.from(m.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([week, count]) => ({ week, count }))
  }, [segmentsDone])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: NAVY }}>
            Statistiques
          </h1>
          <p className="text-sm text-slate-500">Suivi de ta progression</p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: GOLD_SOFT, color: NAVY }}
        >
          CoranFocus
        </span>
      </div>

      {/* Error */}
      {err && (
        <Card className="border-red-200" style={{ backgroundColor: "#FEF2F2" }}>
          <CardContent className="py-3 text-sm" style={{ color: "#B91C1C" }}>
            {err}
          </CardContent>
        </Card>
      )}

      {/* KPIs (ancien layout compact) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm" style={{ borderColor: GOLD_SOFT }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: NAVY }}>
              Versets mémorisés
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold" style={{ color: GOLD }}>
            {loading ? <Skeleton className="h-8 w-24" /> : totalAyahs}
          </CardContent>
        </Card>

        <Card className="shadow-sm" style={{ borderColor: GOLD_SOFT }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: NAVY }}>
              Segments terminés
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold" style={{ color: GOLD }}>
            {loading ? <Skeleton className="h-8 w-24" /> : totalSegments}
          </CardContent>
        </Card>

        <Card className="shadow-sm" style={{ borderColor: GOLD_SOFT }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: NAVY }}>
              Streak (jours)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold" style={{ color: GOLD }}>
            {loading ? <Skeleton className="h-8 w-24" /> : streak}
          </CardContent>
        </Card>
      </div>

      <Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-base" style={{ color: "#0B1535" }}>
      Badges récents
    </CardTitle>
  </CardHeader>
  <CardContent className="text-sm text-slate-600">
    <a href="/badges" className="underline text-amber-600">Voir tous les badges</a>
  </CardContent>
</Card>


      {/* Heatmap des révisions (6 derniers mois) */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ color: NAVY }}>
            Heatmap des révisions (6 derniers mois)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Heatmap data={reviewsPerDay} months={6} />
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>Moins</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: NAVY_SOFT }} />
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GOLD_SOFT }} />
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#F0D77E" }} />
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#E5C454" }} />
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: GOLD }} />
            </div>
            <span>Plus</span>
          </div>
        </CardContent>
      </Card>

      {/* Graphes (ancien esprit : 2 blocs) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>
              Révisions par jour
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : reviewsPerDay.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune révision enregistrée.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={reviewsPerDay}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GOLD} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis width={32} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke={GOLD} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>
              Segments complétés (par semaine)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : segmentsPerWeek.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun segment complété pour le moment.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentsPerWeek}>
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} minTickGap={24} />
                  <YAxis width={32} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
