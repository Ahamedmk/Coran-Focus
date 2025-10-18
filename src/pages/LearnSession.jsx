import { useEffect, useMemo, useState,useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '../components/ui/button'
import { useNavigate } from "react-router-dom"
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'

const tzDate = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
}

export default function LearnSession(){
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [segment, setSegment] = useState(null)  // { id, page_from, page_to, program_id }
  const [ayahs, setAyahs] = useState([])        // { id, n, text_ar, page }
  const [fontSize, setFontSize] = useState(28)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)


  const today = tzDate()
  const navigate = useNavigate()

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


  // --- util: lire un paramètre d'URL (?seg=ID)
  const getSegFromQuery = () => {
    const sp = new URLSearchParams(window.location.search)
    const v = sp.get('seg')
    return v ? Number(v) : null
  }

  // Chargement du segment (priorité à ?seg=ID, sinon le plus ancien incomplet <= today)
  const loadSegment = async () => {
    setLoading(true); setError(''); setAyahs([]); setSegment(null)

    const segId = getSegFromQuery()
    let seg = null

    if (segId) {
      const { data, error } = await supabase
        .from('program_segments')
        .select('id, program_id, planned_date, page_from, page_to, completed_at')
        .eq('id', segId)
        .maybeSingle()
      if (error) { setError(error.message); setLoading(false); return }
      seg = data
    } else {
      const { data, error } = await supabase
        .from('program_segments')
        .select('id, program_id, planned_date, page_from, page_to, completed_at')
        .lte('planned_date', today)           // <= today pour éviter les soucis de fuseau
        .is('completed_at', null)
        .order('planned_date', { ascending: true })
        .order('day_index', { ascending: true })
        .limit(1)
      if (error) { setError(error.message); setLoading(false); return }
      seg = data?.[0] || null
    }

    if(!seg){ setLoading(false); return }
    setSegment(seg)

    const pages = Array.from({length: seg.page_to - seg.page_from + 1}, (_,k)=> seg.page_from + k)
    const { data: rows, error: e2 } = await supabase
      .from('ayahs')
      .select('id, surah_id, number_in_surah, text_ar, ayah_pages(page_number)')
      .in('ayah_pages.page_number', pages)
      .order('surah_id', { ascending: true })
      .order('number_in_surah', { ascending: true })

    if(e2){ setError(e2.message); setAyahs([]) }
    else {
      const mapped = (rows||[]).map(a => ({ id: a.id, n: a.number_in_surah, text_ar: a.text_ar, page: a.ayah_pages?.page_number ?? null }))
      setAyahs(mapped)
    }
    setLoading(false)
  }

  useEffect(()=>{ loadSegment() }, [])

  const pagesLabel = useMemo(() => {
    if(!segment) return ''
    return segment.page_from === segment.page_to ? `Page ${segment.page_from}` : `Pages ${segment.page_from}–${segment.page_to}`
  }, [segment])

 const onComplete = async () => {
  if (!segment) { toast.error("Aucun segment aujourd’hui"); return }
  try {
    setSaving(true)
    const { error } = await supabase.rpc("complete_segment_and_init_sm2", { p_segment_id: segment.id })
    if (error) throw error
    tick()
    toast.success("Segment marqué appris ✓")
    // Option A : aller directement réviser
    navigate("/review")
    // Option B (si tu préfères rester) : await loadSegment()
  } catch (e) {
    toast.error("Erreur : " + e.message)
  } finally {
    setSaving(false)
  }
}


  const totalAyahs = ayahs.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Session d'apprentissage</h1>
          <p className="text-slate-600 text-sm">{today}</p>
        </div>
        <Badge className="bg-emerald-600">Focus</Badge>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50"><CardContent className="py-3 text-sm text-red-700">{error}</CardContent></Card>
      )}

      {loading && (
        <Card><CardContent className="py-10 text-center text-slate-500">Chargement…</CardContent></Card>
      )}

      {!loading && !segment && (
        <Card>
          <CardContent className="py-10 text-center text-slate-500 space-y-3">
            <p>Pas de segment à apprendre aujourd'hui.</p>
            <p className="text-sm">Astuce: ajoute <code>?seg=ID</code> à l'URL pour ouvrir un segment précis.</p>
          </CardContent>
        </Card>
      )}

      {!loading && segment && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{pagesLabel}</CardTitle>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600">Taille</label>
                  <input type="range" min={20} max={40} step={1} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} className="w-28 accent-emerald-600" />
                  <Button variant="outline" size="sm" onClick={()=>setRevealed(v=>!v)}>
                    {revealed ? 'Masquer tashkîl' : 'Afficher tashkîl'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 py-5">
              <div dir="rtl" className="space-y-3">
                {ayahs.map((a) => (
                  <p key={a.id} style={{ fontSize: fontSize }} className="leading-relaxed font-['Noto Naskh Arabic']">
                    <span className="text-emerald-700 mx-2 text-base align-middle">{a.n}</span>
                    {a.text_ar}
                  </p>
                ))}
              </div>
              {totalAyahs === 0 && (
                <p className="text-slate-500 text-sm">Aucun verset chargé pour ces pages (vérifie ton import).</p>
              )}
            </CardContent>
          </Card>

         <div className="flex gap-2">
  <Button
    className="bg-emerald-600 hover:bg-emerald-700 flex-1"
    onClick={onComplete}
    disabled={!segment || saving || ayahs.length === 0}
  >
    {saving ? "Enregistrement..." : "Marquer appris"}
  </Button>
  <Button
    variant="outline"
    className="flex-1"
    onClick={() => navigate("/review")}
  >
    Aller réviser
  </Button>
</div>

        </>
      )}
    </div>
  )
}
