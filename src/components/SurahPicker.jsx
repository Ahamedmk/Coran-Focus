import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllSurahs } from "../lib/surahsApi";

export default function SurahPicker() {
  const [all, setAll] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setErr(""); setLoading(true);
      try {
        const list = await getAllSurahs({ signal: ctrl.signal });
        setAll(list);
      } catch (e) {
        setErr(e?.message || "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((x) => {
      return (
        String(x.id).includes(s) ||
        x.name_en?.toLowerCase().includes(s) ||
        x.translated_name?.toLowerCase().includes(s) ||
        x.name_ar?.includes(q)
      );
    });
  }, [q, all]);

  function selectSurah(id) {
    navigate(`/plan?surah=${id}`);
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-3xl font-black mb-4">Choisir une sourate</h1>

      <input
        className="w-full rounded-lg border px-3 py-2 mb-4"
        placeholder="Rechercher (nom, n°, arabe)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {err && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div>Chargement…</div>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {filtered.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer"
              onClick={() => selectSurah(s.id)}
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  {s.id}. {s.translated_name || s.name_en}
                  <span className="text-gray-500 ml-2">{s.name_ar}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {Number.isFinite(s.verses) ? `${s.verses} versets` : "—"}
                  {s.revelation ? ` • ${s.revelation}` : ""}
                </div>
              </div>
              <button className="rounded-lg px-3 py-1 text-sm bg-slate-900 text-yellow-300">
                Planifier
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
