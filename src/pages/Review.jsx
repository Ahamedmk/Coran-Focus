// Review.jsx — V3 avec Sonner + Framer Motion + son "tick" + compte à rebours par item
// Dépendances :
// npm i sonner framer-motion

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'

const tzDate = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}

// ====== paramètres UX ======
const ITEM_TIMER_SEC = 30    // durée du compte à rebours par verset
const SOUND_ENABLED = true   // activer/désactiver le son "tick"

export default function Review(){
  const [queue, setQueue] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)

  // Timer par item
  const [secLeft, setSecLeft] = useState(ITEM_TIMER_SEC)
  const [paused, setPaused] = useState(false)

  // AudioContext réutilisable
  const audioRef = useRef(null)
  useEffect(() => {
    if (!SOUND_ENABLED) return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx) audioRef.current = new Ctx()
    return () => { try { audioRef.current?.close() } catch(_){} }
  }, [])

  const playTick = () => {
    if (!SOUND_ENABLED || !audioRef.current) return
    const ctx = audioRef.current
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = 880
    o.connect(g); g.connect(ctx.destination)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.start(t); o.stop(t + 0.1)
  }

  const load = async () => {
    setLoading(true); setError('')
    const today = tzDate()
    const { data, error } = await supabase
      .from('user_memorization')
      .select(`
        ayah_id,
        due_at,
        interval_days,
        repetitions,
        ayahs:ayah_id ( id, text_ar )
      `)
      .lte('due_at', today)
      .order('due_at', { ascending: true })
      .limit(50)
    if(error){
      setError(error.message)
      toast.error('Erreur de chargement : ' + error.message)
    } else {
      const items = (data||[]).map(r => ({ id: r.ayah_id, text: r.ayahs?.text_ar || '', due_at: r.due_at }))
      setQueue(items)
      setTotal(items.length)
    }
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

  // Raccourcis clavier (1/2/3, espace)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); setRevealed(v=>!v); playTick() }
      if (e.key === '1') grade(2)
      if (e.key === '2') grade(3)
      if (e.key === '3') grade(5)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, revealed])

  const current = queue[0]
  const done = Math.max(total - queue.length, 0)
  const remaining = Math.max(queue.length - 1, 0)
  const progress = total ? Math.round((done / total) * 100) : 0

  // Reset du timer à chaque nouveau verset
  useEffect(() => {
    if (!current) return
    setSecLeft(ITEM_TIMER_SEC)
    setPaused(false)
  }, [current?.id])

  // Tick du timer
  useEffect(() => {
    if (!current || paused) return
    const id = setInterval(() => {
      setSecLeft((s) => {
        if (s <= 1) {
          toast.message('⏳ Temps écoulé — révélation automatique')
          setRevealed(true)
          playTick()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [current?.id, paused])

  const grade = async (q) => {
    if(!current) return
    setError('')
    setQueue(prev => prev.slice(1))
    const { error } = await supabase.rpc('review_and_log_sm2', { p_ayah_id: current.id, p_quality: q })
    if(error){
      setError(error.message)
      toast.error('Erreur : ' + error.message)
      load()
    } else {
      const label = q <= 2 ? 'Difficile' : q >= 5 ? 'Facile' : 'Bien'
      toast.success(`${label} ✓`)
      playTick()
    }
    setRevealed(false)
  }

  const cardVariants = {
    initial: { opacity: 0, y: 8, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.98 }
  }

  const timerPct = Math.round(((ITEM_TIMER_SEC - secLeft) / ITEM_TIMER_SEC) * 100)
  const fmt = (s) => `00:${String(Math.max(0,s)).padStart(2,'0')}`

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Révision SM‑2</h1>
          <p className="text-sm text-slate-500">{done}/{total} aujourd'hui</p>
        </div>
        <div className="w-28"><Progress value={progress} /></div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {loading && <Card><CardContent className="py-10 text-center text-slate-500">Chargement…</CardContent></Card>}

      {!loading && (
        <AnimatePresence mode="popLayout">
          {!current ? (
            <motion.div key="done" variants={cardVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-lg font-medium">Tout est révisé pour aujourd'hui ✅</p>
                  <Button className="mt-4" onClick={load}>Rafraîchir</Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div key={current.id} variants={cardVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
              <Card className="min-h-[260px]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-slate-600">Récite puis révèle le texte</CardTitle>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`tabular-nums ${secLeft===0?'text-red-600':'text-slate-600'}`}>{fmt(secLeft)}</span>
                      <div className="w-24"><Progress value={timerPct} /></div>
                      <Button size="sm" variant="outline" onClick={()=>setPaused(p=>!p)}>{paused?'Reprendre':'Pause'}</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-4">
                    {!revealed ? (
                      <motion.div className="h-24 rounded-xl bg-slate-100 grid place-items-center text-slate-400" initial={{opacity:0}} animate={{opacity:1}}>
                        <span>••• masqué •••</span>
                      </motion.div>
                    ) : (
                      <motion.p dir="rtl" className="text-2xl leading-relaxed font-['Noto Naskh Arabic']" initial={{opacity:0}} animate={{opacity:1}}>
                        {current.text}
                      </motion.p>
                    )}
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" onClick={()=>{ setRevealed(v=>!v); playTick(); }}>
                        {revealed ? 'Masquer' : 'Révéler'}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-2">
                    <motion.div whileTap={{scale:0.98}}>
                      <Button variant="destructive" onClick={()=>grade(2)}>Difficile</Button>
                    </motion.div>
                    <motion.div whileTap={{scale:0.98}}>
                      <Button variant="secondary" onClick={()=>grade(3)}>Bien</Button>
                    </motion.div>
                    <motion.div whileTap={{scale:0.98}}>
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={()=>grade(5)}>Facile</Button>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
