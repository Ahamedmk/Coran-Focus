import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

export default function SurahPicker(){
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("surah_stats")
        .select("*");
      if (!error) setRows(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return rows;
    return rows.filter(r =>
      String(r.surah_id).includes(s) ||
      (r.name_ar && r.name_ar.includes(s)) ||
      (r.name_en && r.name_en.toLowerCase().includes(s.toLowerCase()))
    );
  }, [rows, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Choisir une sourate</h1>
        <Badge variant="secondary">{rows.length} sourates</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Raccourcis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {/* Baqara (2) -> plan prérempli */}
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => navigate(`/plan?surah=2`)}
          >
            Commencer Al-Baqarah (2)
          </Button>

          {/* Tu peux ajouter d’autres raccourcis ici si tu veux */}
          {/* <Button variant="outline" onClick={() => navigate('/plan?surah=1')}>Al-Fatiha (1)</Button> */}
        </CardContent>
      </Card>

      <Input
        placeholder="Rechercher (ID, nom arabe, anglais)…"
        value={q}
        onChange={(e)=>setQ(e.target.value)}
      />

      {loading && <Card><CardContent className="py-8 text-center text-slate-500">Chargement…</CardContent></Card>}

      {!loading && filtered.map(s => (
        <Card key={s.surah_id} className="hover:bg-slate-50 transition">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-slate-500">#{s.surah_id}</span>
              <span className="font-semibold">{s.name_ar}</span>
              <span className="text-slate-500">/ {s.name_en}</span>
              <Badge className="ml-auto" variant="secondary">
                {s.ayah_count} ayahs · {s.page_count} pages
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Pages {s.first_page}–{s.last_page}
            </div>
            <Button onClick={() => navigate(`/plan?surah=${s.surah_id}`)}>
              Planifier
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
