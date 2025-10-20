// src/pages/PlanSurah.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const PACE_OPTIONS = [
  { value: "verses_per_day", label: "Versets / jour" },
  { value: "pages_per_day", label: "Pages / jour" },
  { value: "time_per_day", label: "Temps / jour (min)" },
];

function todayISO() {
  const d = new Date();
  // yyyy-mm-dd
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export default function PlanSurah() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // ---- Query param "surah" -> nombre obligatoire
  const surahId = useMemo(() => {
    const v = Number(params.get("surah"));
    return Number.isFinite(v) ? v : NaN;
  }, [params]);

  // ---- UI state
  const [loading, setLoading] = useState(false);
  const [surah, setSurah] = useState(null);
  const [err, setErr] = useState("");

  // Form
  const [title, setTitle] = useState("");
  const [paceType, setPaceType] = useState("verses_per_day");
  const [paceValue, setPaceValue] = useState(5);
  const [startDate, setStartDate] = useState(todayISO());

  // ---- Charger la sourate (nom/ar, nb versets...)
  useEffect(() => {
    let cancelled = false;

    async function loadSurah() {
      setErr("");
      if (!Number.isFinite(surahId)) {
        setErr("Identifiant de sourate invalide.");
        return;
      }
      const { data, error } = await supabase
        .from("surahs")
        .select("id, name_en, name_ar, ayah_count")
        .eq("id", surahId)
        .single();

      if (!cancelled) {
        if (error) {
          setErr(error.message || "Impossible de charger la sourate.");
        } else {
          setSurah(data);
          // Pré-remplir le titre si vide
          setTitle((t) =>
            t?.trim()
              ? t
              : `Programme sourate ${data?.id ?? surahId}`
          );
        }
      }
    }

    loadSurah();
    return () => {
      cancelled = true;
    };
  }, [surahId]);

  // ---- Validation locale simple
  function validate() {
    if (!Number.isFinite(surahId)) return "Identifiant de sourate invalide.";
    if (!PACE_OPTIONS.some((o) => o.value === paceType))
      return "Type de rythme invalide.";
    const pace = Number(paceValue);
    if (!Number.isFinite(pace) || pace <= 0) return "Valeur du rythme invalide.";
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
      return "Date de début invalide.";
    return "";
  }

  // ---- Soumission
  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    const v = validate();
    if (v) {
      setErr(v);
      return;
    }

    setLoading(true);
    try {
      // conversions finales
      const payload = {
        p_target_type: "surah",                 // text
        p_surah_id: Number(surahId),           // integer
        p_pace_type: String(paceType),         // text
        p_pace_value: Number(paceValue),       // integer
        p_start_date: String(startDate),       // date (string yyyy-mm-dd)
        p_title: title?.trim() || null,        // text | null
      };

      // (Optionnel) debug
       console.log("RPC payload:", payload);

      const { data, error } = await supabase.rpc(
        "create_program_from_surah",
        payload
      );

      if (error) {
        setErr(error.message || "Erreur lors de la création du programme.");
        return;
      }

      // Rediriger vers Today (ou Stats), à toi d’ajuster
      navigate("/", { replace: true });
    } catch (e2) {
      setErr(e2.message || "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-4xl font-black tracking-tight mb-6">
        Planifier la sourate
      </h1>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border bg-white/70 p-4 shadow-sm">
        <div className="text-lg font-semibold">
          {surah ? (
            <>
              {surah.name_en} <span className="text-gray-400">({surah.name_ar})</span>
            </>
          ) : (
            "Chargement…"
          )}
        </div>
        <div className="text-sm text-gray-500">
          {surah?.ayah_count ?? "—"} versets
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="font-medium">Titre (optionnel)</label>
          <input
            type="text"
            placeholder={`Programme sourate ${surahId || ""}`}
            className="w-full rounded-lg border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="font-medium">Date de début</label>
            <input
              type="date"
              className="w-full rounded-lg border px-3 py-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="font-medium">Rythme</label>
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={paceType}
              onChange={(e) => setPaceType(e.target.value)}
            >
              {PACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-medium">
            Valeur ({PACE_OPTIONS.find((o) => o.value === paceType)?.label})
          </label>
          <input
            type="number"
            className="w-full rounded-lg border px-3 py-2"
            value={paceValue}
            min={1}
            step={1}
            onChange={(e) => setPaceValue(Number(e.target.value))}
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-lg bg-[#0f172a] px-4 py-2 font-semibold text-[#f1c40f] shadow-sm hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Création…" : "Commencer le programme"}
          </button>
        </div>
      </form>
    </div>
  );
}
