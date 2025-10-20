// src/pages/Learn.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

/**
 * Construit une URL audio EveryAyah à partir d'un numéro de sourate (1..114)
 * et d'un numéro de verset à l'intérieur de la sourate.
 */
function guessAyahAudioUrl(surahNumber, ayahNumberInSurah, reciter = "Alafasy_64kbps") {
  if (!surahNumber || !ayahNumberInSurah) return null;
  const s = String(surahNumber).padStart(3, "0");
  const a = String(ayahNumberInSurah).padStart(3, "0");
  return `https://everyayah.com/data/${reciter}/${s}${a}.mp3`;
}

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Merge util pour associer page_number (depuis ayah_pages) aux ayahs.
 */
function attachPages(ayahs, ayahPages) {
  const pageById = new Map(ayahPages.map((r) => [r.ayah_id, r.page_number]));
  return ayahs.map((a) => ({
    ...a,
    page_number: pageById.get(a.id) ?? null,
  }));
}

export default function Learn() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [segment, setSegment] = useState(null); // segment du jour
  const [ayahs, setAyahs] = useState([]); // liste d’ayahs enrichies (page_number)
  const [playing, setPlaying] = useState(null); // ayah_id en cours de lecture

  // --------- Charger le segment du jour + ses ayahs
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        // 1) Dernier programme de l’utilisateur (RLS: user_id = auth.uid())
        const { data: progRows, error: progErr } = await supabase
          .from("study_programs")
          .select("id, pace_type, pace_value, start_date")
          .order("created_at", { ascending: false })
          .limit(1);

        if (progErr) throw progErr;
        const program = progRows?.[0];
        if (!program) {
          setErr("Aucun programme trouvé. Crée-en un depuis Planifier.");
          return;
        }

        // 2) Segment du jour (planned_date = aujourd’hui)
        const today = todayISO();
        const { data: segRows, error: segErr } = await supabase
          .from("program_segments")
          .select(
            "id, program_id, planned_date, completed_at, day_index, ayah_from_id, ayah_to_id, page_from, page_to"
          )
          .eq("program_id", program.id)
          .eq("planned_date", today)
          .order("day_index", { ascending: true })
          .limit(1);

        if (segErr) throw segErr;
        const seg = segRows?.[0];
        if (!seg) {
          setErr("Rien à apprendre aujourd’hui.");
          return;
        }

        // 3) Récupérer la liste d’ayahs pour ce segment
        let ayahList = [];
        if (seg.ayah_from_id && seg.ayah_to_id) {
          // Mode "versets" (ID → ID)
          const { data: arows, error: aerr } = await supabase
            .from("ayahs")
            .select("id, surah_id") // on reste minimal : ces colonnes existent
            .gte("id", seg.ayah_from_id)
            .lte("id", seg.ayah_to_id)
            .order("id", { ascending: true });
          if (aerr) throw aerr;

          const ids = (arows || []).map((r) => r.id);
          let apRows = [];
          if (ids.length) {
            const { data: apr, error: aperr } = await supabase
              .from("ayah_pages")
              .select("ayah_id, page_number")
              .in("ayah_id", ids);

            if (aperr) throw aperr;
            apRows = apr || [];
          }
          ayahList = attachPages(arows || [], apRows);
        } else if (seg.page_from && seg.page_to) {
          // Mode "pages"
          const { data: apRows, error: apErr } = await supabase
            .from("ayah_pages")
            .select("ayah_id, page_number")
            .gte("page_number", seg.page_from)
            .lte("page_number", seg.page_to)
            .order("ayah_id", { ascending: true });
          if (apErr) throw apErr;

          const ids = (apRows || []).map((r) => r.ayah_id);
          let arows = [];
          if (ids.length) {
            const { data: ax, error: axErr } = await supabase
              .from("ayahs")
              .select("id, surah_id")
              .in("id", ids);
            if (axErr) throw axErr;

            // Remettre dans l’ordre des pages (puis ayah_id)
            const byId = new Map(ax.map((r) => [r.id, r]));
            arows = apRows.map((p) => byId.get(p.ayah_id)).filter(Boolean);
            ayahList = attachPages(arows, apRows);
          } else {
            ayahList = [];
          }
        } else {
          // Segment incomplet
          ayahList = [];
        }

        if (!cancelled) {
          setSegment(seg);
          setAyahs(ayahList);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || "Erreur de chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // --------- Titre du segment
  const title = useMemo(() => {
    if (!segment) return "";
    if (segment.page_from && segment.page_to) {
      return `Pages ${segment.page_from}–${segment.page_to}`;
    }
    if (segment.ayah_from_id && segment.ayah_to_id) {
      return ayahs?.length ? `Versets 1–${ayahs.length}` : `Versets (plage)`;
    }
    return "Segment du jour";
  }, [segment, ayahs]);

  // --------- Lecture audio
  async function playAyah(a, idx) {
    try {
      setPlaying(a.id);
      const url = guessAyahAudioUrl(a.surah_id, idx + 1); // idx+1 = n° du verset dans CE segment
      if (!url) return;

      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => setPlaying(null);
    } catch {
      setPlaying(null);
    }
  }

  // --------- Marquer le segment comme terminé
  async function completeSegment() {
    if (!segment) return;
    const { error } = await supabase
      .from("program_segments")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", segment.id);

    if (error) {
      setErr(error.message || "Impossible de marquer comme terminé.");
      return;
    }
    // Recharge simple
    window.location.reload();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
        <button
  onClick={() => navigate("/learn/surahs")}
  className="rounded-lg bg-slate-900 text-yellow-300 px-3 py-2 hover:opacity-90"
>
  Toutes les sourates
</button>
      <h1 className="text-4xl font-black tracking-tight mb-6">Apprentissage</h1>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="text-gray-500">Chargement…</div>
      ) : !segment ? (
        <div className="text-gray-500">Aucun segment aujourd’hui.</div>
      ) : (
        <>
          <div className="mb-4 rounded-xl border bg-white/70 p-4 shadow-sm">
            <div className="text-lg font-semibold">{title}</div>
            <div className="text-sm text-gray-500">
              {segment.planned_date ? `Prévu le ${segment.planned_date}` : ""}
              {segment.completed_at ? " • Terminé" : ""}
            </div>
          </div>

          {ayahs.length === 0 ? (
            <div className="rounded-xl border bg-white/70 p-4 text-gray-500">
              Aucun verset pour ce segment.
            </div>
          ) : (
            <div className="space-y-3">
              {ayahs.map((a, idx) => (
                <div
                  key={a.id}
                  className="rounded-xl border bg-white/70 p-4 shadow-sm flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="font-semibold">Verset {idx + 1}</div>
                    <div className="text-sm text-gray-400">
                      Sourate {a.surah_id}
                      {a.page_number ? ` • Page ${a.page_number}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => playAyah(a, idx)}
                      className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
                    >
                      {playing === a.id ? "Lecture…" : "Écouter"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={completeSegment}
              className="inline-flex items-center rounded-lg bg-[#0f172a] px-4 py-2 font-semibold text-[#f1c40f] shadow-sm hover:opacity-95"
            >
              Marquer comme appris
            </button>
          </div>
        </>
      )}
    </div>
  );
}
