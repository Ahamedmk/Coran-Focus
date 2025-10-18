// Today.jsx (V2.2) — direct program_segments + garde auth + tick + toasts

import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

const tzDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const Section = ({ title, children, right }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {right}
    </div>
    <div className="grid gap-3">{children}</div>
  </section>
)

const Empty = ({ text }) => (
  <Card className="border-dashed">
    <CardContent className="text-slate-500 text-sm py-6">{text}</CardContent>
  </Card>
)

export default function Today() {
  const [loading, setLoading] = useState(true)
  const [learn, setLearn] = useState([])       // segments du jour
  const [planReviews, setPlanReviews] = useState([]) // on laisse vide pour l’instant
  const [sm2, setSm2] = useState([])           // idem
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)

  const today = tzDate()
  const navigate = useNavigate()

  // ---- tiny tick
  const audioRef = useRef(null)
  useEffect(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx) audioRef.current = new Ctx()
    return () => { try { audioRef.current?.close() } catch {} }
  }, [])
  const tick = () => {
    if (!audioRef.current) return
    const ctx = audioRef.current
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = "sine"; o.frequency.value = 880
    o.connect(g); g.connect(ctx.destination)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.start(t); o.stop(t + 0.1)
  }

  // ---- garde auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const fetchToday = useCallback(async () => {
    if (!session) { setLoading(false); return } // pas connecté => rien
    setLoading(true); setError(null)

    try {
      // Direct table program_segments (RLS doit laisser passer les segments de l'user)
      const { data: segs, error } = await supabase
        .from("program_segments")
        .select("id, page_from, page_to, planned_date, completed_at")
        .eq("planned_date", today)
        .is("completed_at", null)
        .order("id", { ascending: true })

      if (error) throw error
      const learnItems = (segs || []).map(s => ({
        id: s.id, page_from: s.page_from, page_to: s.page_to
      }))
      setLearn(learnItems)

      // (Optionnel) à remplir plus tard via tes vues:
      setPlanReviews([]); setSm2([])
    } catch (e) {
      setError(e.message)
      toast.error("Erreur: " + e.message)
    } finally {
      setLoading(false)
    }
  }, [today, session])

  useEffect(() => { fetchToday() }, [fetchToday])

  const completeSegment = async (segmentId) => {
    const prev = learn
    // UI optimiste
    setLearn(list => list.filter(x => x.id !== segmentId))
    const { error } = await supabase.rpc("complete_segment_and_init_sm2", { p_segment_id: segmentId })
    if (error) {
      setLearn(prev)
      setError(error.message)
      toast.error("Erreur : " + error.message)
    } else {
      toast.success("Segment terminé ✓")
      tick()
      fetchToday()
    }
  }

  const goReview = () => navigate("/review")

  const cardVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.98 },
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Assalamu alaykum</h1>
            <p className="text-slate-600 text-sm">{today}</p>
          </div>
          <Badge className="bg-emerald-600">Focus</Badge>
        </div>
      </motion.div>

      {!session && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            Pas connecté — connecte-toi pour voir ta journée.
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {/* À apprendre aujourd'hui */}
      <Section title="À apprendre aujourd'hui">
        {loading && <Empty text="Chargement..." />}
        {!loading && session && learn.length === 0 && <Empty text="Rien à apprendre aujourd’hui" />}

        <AnimatePresence mode="popLayout">
          {!loading && learn.map((l) => (
            <motion.div
              key={l.id}
              variants={cardVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Pages {l.page_from}–{l.page_to}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 text-sm">Aujourd'hui</span>
                  <div className="flex items-center gap-2">
                    <motion.div whileTap={{ scale: 0.98 }}>
                      <Button variant="outline" onClick={() => navigate(`/learn/session?seg=${l.id}`)}>
                        Commencer
                      </Button>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.98 }}>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => completeSegment(l.id)}>
                        Terminer
                      </Button>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </Section>

      <Section title="Révisions planifiées" right={<Badge variant="secondary">{planReviews.length}</Badge>}>
        {!loading && planReviews.length === 0 && <Empty text="Aucune révision programmée" />}
      </Section>

      <Section title="Révisions dues (SM-2)" right={<Badge variant="secondary">{sm2.length}</Badge>}>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">{sm2.length} éléments en attente</p>
              <p className="text-slate-500 text-sm">Algorithme SM-2</p>
            </div>
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { tick(); goReview(); }}>
                Lancer
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}
