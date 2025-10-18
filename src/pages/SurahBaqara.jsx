import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'


// Affiche la sourate Al-Baqarah (id=2) avec pagination par page mushaf
// Requiert tables: ayahs (surah_id, number_in_surah, text_ar) + ayah_pages (ayah_id -> page_number)


const PAGE_MIN = 2 // Al-Fatiha est page 1, Al-Baqarah commence typiquement page 2
const PAGE_MAX = 604


export default function SurahBaqara(){
const [loading, setLoading] = useState(true)
const [error, setError] = useState('')
const [data, setData] = useState([]) // { id, n, text_ar, page_number }
const [page, setPage] = useState(PAGE_MIN)
const [fontSize, setFontSize] = useState(28)


useEffect(() => {
const load = async () => {
setLoading(true); setError('')
const { data, error } = await supabase
.from('ayahs')
.select('id, number_in_surah, text_ar, ayah_pages(page_number)')
.eq('surah_id', 2)
.order('number_in_surah', { ascending: true })
if(error){ setError(error.message) }
else {
const rows = (data||[]).map(a=>({
id: a.id,
n: a.number_in_surah,
text_ar: a.text_ar,
page_number: a.ayah_pages?.page_number ?? null
}))
setData(rows)
// si la page actuelle n'a pas d'ayah (dataset partiel), fallback à la première page présente
const firstPageWithAyah = rows.find(r=>r.page_number)?.page_number || PAGE_MIN
setPage(p=> p || firstPageWithAyah)
}
setLoading(false)
}
load()
}, [])

const pages = useMemo(() => {
const map = new Map()
for(const r of data){
const k = r.page_number ?? -1
if(!map.has(k)) map.set(k, [])
map.get(k).push(r)
}
return map
}, [data])


const ayahsOnPage = pages.get(page) || []
const canPrev = page > PAGE_MIN
const canNext = page < PAGE_MAX


const goPrev = () => setPage(p => Math.max(PAGE_MIN, p-1))
const goNext = () => setPage(p => Math.min(PAGE_MAX, p+1))
const goTo = (val) => {
const num = Number(val)
if(Number.isFinite(num)) setPage(Math.min(PAGE_MAX, Math.max(PAGE_MIN, num)))
}

return (
<div className="space-y-4">
<div className="flex items-end justify-between">
<div>
<h1 className="text-2xl font-bold">Al-Baqara (البقرة)</h1>
<p className="text-slate-500 text-sm">Page {page}</p>
</div>
<div className="flex items-center gap-2">
<label className="text-sm text-slate-600">Taille</label>
<input
type="range" min={20} max={40} step={1}
value={fontSize}
onChange={e=>setFontSize(Number(e.target.value))}
className="w-28 accent-emerald-600"
/>
</div>
</div>

<div className="flex items-center gap-2">
<Button variant="outline" disabled={!canPrev} onClick={goPrev}>Page précédente</Button>
<input
className="w-24 px-3 py-2 rounded-lg border text-center"
inputMode="numeric" pattern="[0-9]*"
defaultValue={page}
onKeyDown={(e)=>{ if(e.key==='Enter'){ goTo(e.currentTarget.value) } }}
onBlur={(e)=> goTo(e.currentTarget.value)}
/>
<Button variant="outline" disabled={!canNext} onClick={goNext}>Page suivante</Button>
</div>

{error && (
<Card className="border-red-200 bg-red-50">
<CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
</Card>
)}


{loading && (
<Card>
<CardContent className="py-10 text-center text-slate-500">Chargement…</CardContent>
</Card>
)}

{!loading && ayahsOnPage.length === 0 && (
<Card>
<CardContent className="py-10 text-center text-slate-500">
Aucune donnée pour cette page dans votre import. Essayez une autre page.
</CardContent>
</Card>
)}


{!loading && ayahsOnPage.length > 0 && (
<Card>
<CardContent className="space-y-3 py-5">
<div dir="rtl" className="space-y-3">
{ayahsOnPage.map(a => (
<p key={a.id} style={{ fontSize: fontSize }} className="leading-relaxed font-['Noto Naskh Arabic']">
<span className="text-emerald-700 mx-2 text-base align-middle">{a.n}</span>
{a.text_ar}
</p>
))}
</div>
</CardContent>
</Card>
)}
</div>
)
}