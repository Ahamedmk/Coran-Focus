import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const ymd = (d=new Date()) => {
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

export default function PlanSurah(){
  const [sp] = useSearchParams();
  const surah = Number(sp.get("surah") || 1);
  const [stat, setStat] = useState(null);
  const [pace, setPace] = useState(1);
  const [start, setStart] = useState(ymd());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("surah_stats")
        .select("*").eq("surah_id", surah).maybeSingle();
      if (!error) setStat(data);
      setLoading(false);
    };
    load();
  }, [surah]);

  const days = useMemo(() => {
    if (!stat) return 0;
    return Math.ceil(stat.page_count / Math.max(pace,1));
  }, [stat, pace]);

  const preview = useMemo(() => {
    if (!stat) return [];
    const res = [];
    let from = stat.first_page;
    let d=0;
    while (from <= stat.last_page){
      d++;
      const to = Math.min(from + pace - 1, stat.last_page);
      res.push({ day: d, from, to, date: addDays(start, d-1) });
      from = to + 1;
    }
    return res;
  }, [stat, pace, start]);

  function addDays(iso, add){
    const d = new Date(iso); d.setDate(d.getDate()+add);
    return ymd(d);
  }

  const createProgram = async () => {
    if (!stat) return;
    const { data, error } = await supabase.rpc("create_program_from_surah", {
      p_surah: stat.surah_id,
      p_pages_per_day: pace,
      p_start: start
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Programme créé !");
      navigate("/"); // page Today
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Planifier la sourate</h1>
        {stat && <Badge variant="secondary">#{stat.surah_id} · {stat.name_ar}</Badge>}
      </div>

      {loading && <Card><CardContent className="py-8 text-center text-slate-500">Chargement…</CardContent></Card>}

      {stat && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Paramètres</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-sm text-slate-600">Pages / jour</label>
                <Input type="number" min={1} max={10} value={pace}
                  onChange={e=>setPace(Math.max(1, Math.min(10, Number(e.target.value))))}/>
              </div>
              <div>
                <label className="text-sm text-slate-600">Date de début</label>
                <Input type="date" value={start} onChange={e=>setStart(e.target.value)} />
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-sm text-slate-600">
                  {stat.page_count} pages • {days} jours estimés
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aperçu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[280px] overflow-auto">
              {preview.map(row => (
                <div key={row.day} className="flex items-center justify-between text-sm border-b py-1">
                  <span>Jour {row.day}</span>
                  <span>Pages {row.from}–{row.to}</span>
                  <span className="text-slate-500">{row.date}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={()=>history.back()}>Annuler</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={createProgram}>
              Créer le programme
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
