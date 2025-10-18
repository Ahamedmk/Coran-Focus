// src/pages/InProgress.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const pad2 = (n) => String(n).padStart(2, "0");
const tzDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const palette = {
  primary: "bg-[#0b1b2b] text-white",
  gold: "text-[#D4AF37]",
  goldBg: "bg-[#D4AF37]",
};

// petit “tick” au clic
const useTick = () => {
  const ref = useRef(null);
  useEffect(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) ref.current = new Ctx();
    return () => {
      try {
        ref.current?.close();
      } catch {}
    };
  }, []);
  return () => {
    if (!ref.current) return;
    const ctx = ref.current;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.start(t);
    o.stop(t + 0.1);
  };
};

export default function InProgress() {
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState([]); // {id, program_id, planned_date, page_from, page_to, completed_at}
  const [programs, setPrograms] = useState(new Map()); // id -> {title}
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const tick = useTick();
  const navigate = useNavigate();
  const today = tzDate();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Programmes (pour titres)
      const p = await supabase
        .from("study_programs")
        .select("id, title")
        .order("created_at", { ascending: true });
      if (p.error) throw p.error;
      const pMap = new Map(p.data?.map((x) => [x.id, { title: x.title }]));
      setPrograms(pMap);

      // 2) Segments non terminés
      const s = await supabase
        .from("program_segments")
        .select("id, program_id, planned_date, page_from, page_to, completed_at")
        .is("completed_at", null)
        .order("planned_date", { ascending: true })
        .order("id", { ascending: true });
      if (s.error) throw s.error;

      setSegments(s.data || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur");
      toast.error(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Décoration + filtre + tri
  const decorated = useMemo(() => {
    const lowerQ = q.trim().toLowerCase();
    const add = segments.map((seg) => {
      const prog = programs.get(seg.program_id) || {};
      return {
        ...seg,
        program_title: prog.title || "Programme",
        status:
          seg.planned_date < today
            ? "late"
            : seg.planned_date === today
            ? "today"
            : "next",
      };
    });
    const filtered = lowerQ
      ? add.filter(
          (s) =>
            (s.program_title || "").toLowerCase().includes(lowerQ) ||
            String(s.page_from).includes(lowerQ) ||
            String(s.page_to).includes(lowerQ) ||
            s.planned_date.includes(lowerQ)
        )
      : add;

    // tri: late → today → next, puis date
    filtered.sort((a, b) => {
      const rank = (st) => (st === "late" ? 0 : st === "today" ? 1 : 2);
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (a.planned_date !== b.planned_date)
        return a.planned_date.localeCompare(b.planned_date);
      return a.id - b.id;
    });

    return filtered;
  }, [segments, programs, q, today]);

  const stats = useMemo(() => {
    const late = decorated.filter((s) => s.status === "late").length;
    const todayCount = decorated.filter((s) => s.status === "today").length;
    const next = decorated.filter((s) => s.status === "next").length;
    return { late, today: todayCount, next, total: decorated.length };
  }, [decorated]);

  const current = decorated[0]; // plus urgent

  const progressPct = useMemo(() => {
    if (!current) return 0;
    const sameProgram = segments.filter(
      (s) => s.program_id === current.program_id
    );
    const done = 0; // simple placeholder (on peut affiner si besoin)
    const total = sameProgram.length;
    return Math.round(total ? (done / total) * 100 : 0);
  }, [current, segments]);

  const onStart = (segId) => {
    tick();
    navigate(`/learn/session?seg=${segId}`);
  };

  const completeSegment = async (segId) => {
    try {
      // Optimisme UI
      setSegments((prev) => prev.filter((s) => s.id !== segId));
      const { error } = await supabase.rpc(
        "complete_segment_and_init_sm2",
        { p_segment_id: segId }
      );
      if (error) throw error;
      toast.success("Segment terminé ✓");
      tick();
      fetchAll();
    } catch (e) {
      toast.error(e.message || "Impossible de terminer");
      fetchAll();
    }
  };

  const reschedule = async (segId, days) => {
    try {
      const base = new Date();
      base.setDate(base.getDate() + days);
      const newDate = tzDate(base);
      const { error } = await supabase
        .from("program_segments")
        .update({ planned_date: newDate })
        .eq("id", segId);
      if (error) throw error;
      toast.success(`Replanifié au ${newDate}`);
      tick();
      fetchAll();
    } catch (e) {
      toast.error(e.message || "Replanification impossible");
    }
  };

  // pagination
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return decorated.slice(start, start + pageSize);
  }, [decorated, page]);
  const totalPages = Math.max(1, Math.ceil(decorated.length / pageSize));

  const cardVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.98 },
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Apprentissage en cours
            </h1>
            <p className="text-sm text-slate-600">{today}</p>
          </div>
          <Badge className={`${palette.goldBg} text-[#0b1b2b]`}>Focus</Badge>
        </div>
      </motion.div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {/* Résumé */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">En retard</p>
            <p className="text-2xl font-bold">{stats.late}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Aujourd’hui</p>
            <p className="text-2xl font-bold">{stats.today}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">À venir</p>
            <p className="text-2xl font-bold">{stats.next}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Segment prioritaire */}
      <Section title="Prioritaire">
        {loading && <SkeletonRow />}
        {!loading && !current && (
          <Card className="border-dashed">
            <CardContent className="text-sm text-slate-500 py-6">
              Rien en attente. Crée un programme depuis{" "}
              <span className="font-medium">Sourates</span> 🙂
            </CardContent>
          </Card>
        )}
        {!loading && current && (
          <Card className="overflow-hidden">
            <CardHeader className={`${palette.primary}`}>
              <CardTitle className="flex items-center gap-2 justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                      current.status === "late"
                        ? "bg-red-500/20 text-red-600"
                        : current.status === "today"
                        ? "bg-emerald-500/20 text-emerald-600"
                        : "bg-slate-600/20 text-slate-200"
                    }`}
                  >
                    {current.status === "late"
                      ? "En retard"
                      : current.status === "today"
                      ? "Aujourd’hui"
                      : "Bientôt"}
                  </span>
                  <span className={`${palette.gold} font-semibold`}>
                    {current.program_title}
                  </span>
                </span>
                <span className="text-sm opacity-80">
                  Pages {current.page_from}–{current.page_to}
                </span>
              </CardTitle>
              <CardDescription className="text-slate-200">
                Prévu le {current.planned_date}
              </CardDescription>
            </CardHeader>
            <CardContent className="py-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">
                    Avancement programme
                  </span>
                  <span className="text-sm font-medium">{progressPct}%</span>
                </div>
                <Progress value={progressPct} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="bg-[#0b1b2b] hover:bg-[#0e2238]"
                  onClick={() => onStart(current.id)}
                >
                  Commencer
                </Button>
                <Button variant="outline" onClick={() => completeSegment(current.id)}>
                  Terminer
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost">Replanifier</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => reschedule(current.id, 1)}>
                      Demain (J+1)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => reschedule(current.id, 3)}>
                      Dans 3 jours (J+3)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => reschedule(current.id, 7)}>
                      Dans 1 semaine (J+7)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        )}
      </Section>

      {/* Liste compacte + recherche + pagination */}
      <Section
        title="Tous les segments"
        right={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Rechercher (titre, page, date...)"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              className="h-9 w-64"
            />
          </div>
        }
      >
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              <HeaderRow />
              <AnimatePresence initial={false} mode="popLayout">
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
                {!loading &&
                  paged.map((row) => (
                    <motion.div
                      key={row.id}
                      variants={cardVariants}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      transition={{ duration: 0.15 }}
                    >
                      <Row
                        row={row}
                        onStart={() => onStart(row.id)}
                        onDone={() => completeSegment(row.id)}
                        onResched={(d) => reschedule(row.id, d)}
                      />
                    </motion.div>
                  ))}
                {!loading && paged.length === 0 && (
                  <div className="px-4 py-6 text-sm text-slate-500">
                    Aucun segment.
                  </div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        {/* Pagination simple */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <span className="text-sm text-slate-500">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Préc.
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suiv.
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function HeaderRow() {
  return (
    <div className="grid grid-cols-12 px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
      <div className="col-span-4">Programme</div>
      <div className="col-span-2">Pages</div>
      <div className="col-span-2">Prévu</div>
      <div className="col-span-2">Statut</div>
      <div className="col-span-2 text-right">Actions</div>
    </div>
  );
}

function Row({ row, onStart, onDone, onResched }) {
  return (
    <>
      <div className="grid grid-cols-12 items-center px-4 py-3">
        <div className="col-span-4">
          <div className="font-medium">{row.program_title}</div>
          <div className="text-xs text-slate-500">Segment #{row.id}</div>
        </div>
        <div className="col-span-2">
          <span className="text-sm">
            p. {row.page_from}–{row.page_to}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-sm">{row.planned_date}</span>
        </div>
        <div className="col-span-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full
            ${
              row.status === "late"
                ? "bg-red-500/10 text-red-700"
                : row.status === "today"
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-slate-500/10 text-slate-700"
            }`}
          >
            {row.status === "late"
              ? "En retard"
              : row.status === "today"
              ? "Aujourd’hui"
              : "À venir"}
          </span>
        </div>
        <div className="col-span-2">
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              className="bg-[#0b1b2b] hover:bg-[#0e2238]"
              onClick={onStart}
            >
              Commencer
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  Plus
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDone}>Terminer</DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={() => onResched(1)}>
                  Replanifier J+1
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onResched(3)}>
                  Replanifier J+3
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onResched(7)}>
                  Replanifier J+7
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <Separator />
    </>
  );
}

function SkeletonRow() {
  return (
    <div className="px-4 py-3 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
      <div className="h-3 bg-slate-100 rounded w-1/3" />
    </div>
  );
}
