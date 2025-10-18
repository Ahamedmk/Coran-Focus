import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// --- Utils ---------------------------------------------------------------
const tzDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}
const stripTashkil = (s='') => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '')

// simple hook localStorage
const useLocalStorage = (key, initial) => {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw!=null ? JSON.parse(raw) : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }, [key, v])
  return [v, setV]
}

export default function ReviewSM2(){
  // --- State -------------------------------------------------------------
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [queue, setQueue] = useState([]) // [{ ayah_id, due_at, text_ar, n, surah_id, surah_name? }]
  const [index, setIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [font, setFont] = useLocalStorage('rev.font', 38)
  const [showTashkil, setShowTashkil] = useLocalStorage('rev.tashkil', true)
  const [quizMode, setQuizMode] = useLocalStorage('rev.quiz', false)
  const [revealed, setRevealed] = useState(true)

  const navigate = useNavigate()
  const today = tzDate()

  // --- Beep feedback -----------------------------------------------------
  const audioRef = useRef(null)
  useEffect(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx) audioRef.current = new Ctx()
    return () => { try { audioRef.current?.close() } catch{} }
  }, [])
  const beep = (freq=660, dur=0.11, vol=0.22) => {
    if (!audioRef.current) return
    const ctx = audioRef.current
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type='sine'; o.frequency.value=freq
    o.connect(g); g.connect(ctx.destination)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t+0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur)
    o.start(t); o.stop(t+dur)
  }

  // --- Data loading (2-queries, robust) ---------------------------------
  const loadQueue = useCallback(async () => {
    setLoading(true); setError('')

    const { data: memos, error: e1 } = await supabase
      .from('user_memorization')
      .select('ayah_id, due_at')
      .lte('due_at', today)
      .order('due_at', { ascending: true })
      .limit(50)

    if (e1) { setError(e1.message); setLoading(false); return }
    if (!memos || memos.length === 0) {
      setQueue([]); setIndex(0); setLoading(false); return
    }

    const ids = [...new Set(memos.map(m => m.ayah_id))]
    const { data: ayahs, error: e2 } = await supabase
      .from('ayahs')
      .select('id, text_ar, number_in_surah, surah_id')
      .in('id', ids)

    if (e2) { setError(e2.message); setLoading(false); return }

    // Optionnel: nom de sourate si table disponible (best-effort, non bloquant)
    let surahMap = new Map()
    try {
      const surahIds = [...new Set(ayahs.map(a => a.surah_id))]
      if (surahIds.length) {
        const { data: surahs } = await supabase.from('surahs').select('id, name_ar, name_en').in('id', surahIds)
        if (surahs) surahMap = new Map(surahs.map(s => [s.id, s.name_ar || s.name_en]))
      }
    } catch {}

    const aMap = new Map(ayahs.map(a => [a.id, a]))
    const rows = memos.map(m => {
      const a = aMap.get(m.ayah_id) || {}
      return {
        ayah_id: m.ayah_id,
        due_at: m.due_at,
        text_ar: a.text_ar ?? '',
        n: a.number_in_surah ?? null,
        surah_id: a.surah_id ?? null,
        surah_name: surahMap.get(a.surah_id) || null,
      }
    })

    setQueue(rows)
    setIndex(0)
    setRevealed(!quizMode) // en quiz, on commence masqué
    setLoading(false)
  }, [today, quizMode])

  useEffect(() => { loadQueue() }, [loadQueue])

  const current = queue[index] || null
  const remaining = Math.max(queue.length - index, 0)
  const total = queue.length
  const done = total - remaining
  const progress = total === 0 ? 0 : (done / total) * 100

  // --- Actions -----------------------------------------------------------
  const goNext = () => {
    setIndex(i => {
      const ni = i + 1
      setRevealed(!quizMode)
      return ni
    })
  }

  const grade = async (quality) => {
    if (!current) return
    try {
      setSubmitting(true)
      const { error } = await supabase.rpc('review_sm2', { p_ayah_id: current.ayah_id, p_quality: quality })
      if (error) throw error

      beep( quality >= 4 ? 820 : quality >= 3 ? 720 : 520 )

      // auto-next sur bonnes notes pour le flow
      if (quality >= 4) {
        setTimeout(() => { goNext() }, 220)
      } else {
        goNext()
      }

      // Recharge si on vient de finir
      if (index + 1 >= queue.length) {
        await loadQueue()
      }
    } catch (e) {
      toast.error('Erreur: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Raccourcis clavier : 1..5, S(=2), Espace pour révéler
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ') { e.preventDefault(); setRevealed(v=>!v); return }
      const map = { '1':1, '2':2, '3':3, '4':4, '5':5, 's':2, 'S':2 }
      if (map[e.key]) { e.preventDefault(); grade(map[e.key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [grade])

  const header = useMemo(() => {
    if (!current) return 'Révision SM‑2'
    const parts = []
    if (current.surah_name) parts.push(current.surah_name)
    if (current.n) parts.push(`Verset ${current.n}`)
    return parts.join(' · ') || 'Verset'
  }, [current])

  // --- UI ----------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Révision SM‑2</h1>
          <p className="text-slate-600 text-sm">{remaining} restant(s)</p>
        </div>
        <Badge variant={remaining>0? 'default':'secondary'}>{remaining>0? 'Dû': 'OK'}</Badge>
      </div>

      {/* Barre de progression */}
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-right text-xs text-slate-500">{done}/{total}</div>

      {/* Options */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-600">Taille</span>
          <input type="range" min={24} max={56} value={font} onChange={e=>setFont(Number(e.target.value))} className="w-40" />
        </div>
        <button onClick={()=>setShowTashkil(v=>!v)} className="text-slate-600 hover:text-slate-900 underline">
          {showTashkil ? 'Masquer tashkîl' : 'Afficher tashkîl'}
        </button>
        <button onClick={()=>{ setQuizMode(v=>!v); setRevealed(!quizMode) }} className="text-slate-600 hover:text-slate-900 underline">
          {quizMode ? 'Quitter le mode quiz' : 'Activer le mode quiz'}
        </button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadQueue}>Réessayer</Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card><CardContent className="py-10 text-center text-slate-500">Chargement…</CardContent></Card>
      )}

      {!loading && !current && (
        <Card>
          <CardContent className="py-10 text-center text-slate-500 space-y-3">
            <p>Tout est révisé pour aujourd’hui ✅</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={()=>navigate('/')}>Retour</Button>
              <Button onClick={loadQueue} variant="secondary">Rafraîchir</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && current && (
        <AnimatePresence mode="popLayout">
          <motion.div key={current.ayah_id} initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-8}}>
            <Card>
              <CardHeader className="pb-0"><CardTitle className="text-base">{header}</CardTitle></CardHeader>
              <CardContent className="py-6">
                <div className="mb-3 flex justify-center">
                  {quizMode && (
                    <Button size="sm" variant="outline" onClick={()=>setRevealed(v=>!v)}>{revealed? 'Cacher' : 'Révéler'} (Espace)</Button>
                  )}
                </div>

                <div dir="rtl" className="leading-relaxed font-['Noto Naskh Arabic'] text-slate-900 text-center select-none"
                     style={{ fontSize: font, filter: quizMode && !revealed ? 'blur(8px)' : 'none', transition:'filter .15s ease' }}>
                  {showTashkil ? current.text_ar : stripTashkil(current.text_ar)}
                </div>

                {/* Boutons qualité */}
                <div className="mt-6 grid grid-cols-5 gap-2">
                  <Button disabled={submitting} variant="destructive" onClick={() => grade(1)}>1 Très difficile</Button>
                  <Button disabled={submitting} variant="secondary" onClick={() => grade(2)}>2 Difficile</Button>
                  <Button disabled={submitting} variant="outline" onClick={() => grade(3)}>3 Moyen</Button>
                  <Button disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => grade(4)}>4 Bien</Button>
                  <Button disabled={submitting} className="bg-emerald-700 hover:bg-emerald-800" onClick={() => grade(5)}>5 Facile</Button>
                </div>
                <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                  <span>Raccourcis : 1–5 · S = Passer (note 2) · Espace = Révéler</span>
                  <Button variant="ghost" size="sm" disabled={submitting} onClick={()=>grade(2)}>Passer</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
