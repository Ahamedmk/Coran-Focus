import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZES = [10, 20, 30];

export default function SurahList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // URL state (conserve la page dans l’URL)
  const pageFromUrl = Number(params.get("page") || 1);
  const sizeFromUrl = Number(params.get("size") || 20);
  const qFromUrl = params.get("q") || "";

  const [page, setPage] = useState(Math.max(1, pageFromUrl));
  const [pageSize, setPageSize] = useState(
    PAGE_SIZES.includes(sizeFromUrl) ? sizeFromUrl : 20
  );
  const [q, setQ] = useState(qFromUrl);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Sync URL
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    next.set("size", String(pageSize));
    if (q) next.set("q", q);
    else next.delete("q");
    setParams(next, { replace: true });
  }, [page, pageSize, q]); // eslint-disable-line

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setErr("");

      // filtre (or) : nom EN, nom AR, id
      const isNum = /^\d+$/.test(q.trim());
      const orFilter = q
        ? `name_en.ilike.%${q}%,name_ar.ilike.%${q}%,id.eq.${isNum ? Number(q) : -9999}`
        : undefined;

      // 1) COUNT
      let countQuery = supabase.from("surahs").select("id", {
        count: "exact",
        head: true,
      });
      if (orFilter) countQuery = countQuery.or(orFilter);

      const { count, error: countErr } = await countQuery;
      if (countErr) {
        setErr(countErr.message);
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      setTotal(count || 0);

      // si la page dépasse, on ramène à la dernière valide
      if (count && from >= count) {
        setPage(Math.max(1, Math.ceil(count / pageSize)));
        setLoading(false);
        return;
      }

      // 2) ROWS
      let dataQuery = supabase
        .from("surahs")
        .select("id, name_ar, name_en, ayah_count")
        .order("id", { ascending: true })
        .range(from, to);
      if (orFilter) dataQuery = dataQuery.or(orFilter);

      const { data, error } = await dataQuery;
      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        setRows(data || []);
      }
      setLoading(false);
    };

    fetchAll();
  }, [page, pageSize, q, from, to]);

  const onPrev = () => setPage((p) => Math.max(1, p - 1));
  const onNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Choisir une sourate</h1>
        <p className="text-slate-600 text-sm">Sélectionne la sourate que tu veux apprendre.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Rechercher (ex: 2, Al-Baqarah, البقرة…) "
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          className="sm:max-w-md"
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Par page</span>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="divide-y">
        {/* header compact */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-slate-500">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Nom (EN)</div>
          <div className="col-span-4 text-right sm:text-left">Nom (AR)</div>
          <div className="col-span-2 text-center">Versets</div>
          <div className="col-span-1 text-right">—</div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : err ? (
          <div className="px-4 py-6 text-sm text-red-600">{err}</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-slate-500">
            Aucune sourate trouvée {q ? `pour “${q}”` : ""}
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((s) => (
              <li
                key={s.id}
                className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-sm"
              >
                <div className="col-span-1 tabular-nums text-slate-500">{s.id}</div>
                <div className="col-span-4 truncate">{s.name_en}</div>
                <div className="col-span-4 truncate text-right sm:text-left font-arabic text-lg">
                  {s.name_ar}
                </div>
                <div className="col-span-2 text-center text-slate-600">
                  {s.ayah_count ?? 0}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => navigate(`/plan?surah=${s.id}`)}
                  >
                    Commencer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Page <span className="font-medium">{page}</span> / {totalPages} —{" "}
          <span className="font-medium">{total}</span> sourates
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
