import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { Award, BookOpen, CalendarCheck2, ChevronRight, RefreshCcw, Sparkles } from "lucide-react";

// Utilitaires
const tzDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const Section = ({ title, right, children }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {right}
    </div>
    {children}
  </section>
);

const Empty = ({ text }) => (
  <Card className="border-dashed">
    <CardContent className="py-6 text-sm text-muted-foreground">{text}</CardContent>
  </Card>
);

// ——————————————————————————————————————————————————————
// Dashboard
// ——————————————————————————————————————————————————————
export default function Dashboard() {
  const navigate = useNavigate();
  const today = tzDate();

  // States
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);          // { total_ayahs_memorized, completed_segments, since_date, avg_interval }
  const [streak, setStreak] = useState(0);           // nb jours d’affilée (si dispo)
  const [todayItems, setTodayItems] = useState([]);  // vue today_queue
  const [sm2Due, setSm2Due] = useState(0);           // items SM-2 dus
  const [spark, setSpark] = useState([]);            // données sparkline (7 derniers jours)
  const [badges, setBadges] = useState([]);          // 0..6 derniers badges

  // Loader principal
  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        // 1) Profil simple (email pour header)
        const { data: { user } } = await supabase.auth.getUser();
        setMe(user);

        // 2) Stats utilisateur (vue conseillée : public.user_progress_stats)
        const { data: s1 } = await supabase
          .from("user_progress_stats")
          .select("*")
          .limit(1)
          .maybeSingle(); // si la vue n’existe pas encore, s1 = null
        setStats(s1 ?? null);

        // 3) Streak (si vue/fonction existe ; sinon fallback 0)
        const { data: s2 } = await supabase
          .from("review_logs")
          .select("reviewed_at")
          .order("reviewed_at", { ascending: false })
          .limit(30);
        // mini calcul streak local (grossier)
        setStreak(calcLocalStreak(s2 || []));

        // 4) Aujourd’hui (to learn + plan-review) — via la table/ vue today_queue
        const { data: tdy } = await supabase.from("today_queue").select("*");
        setTodayItems(tdy || []);

        // 5) SM-2 dûs aujourd’hui
        const dueResp = await supabase
          .from("user_memorization")
          .select("*", { count: "exact", head: true })
          .lte("due_at", today);
        setSm2Due(dueResp?.length ?? (dueResp?.count ?? 0)); // head:true → use count

        // 6) Sparkline (7 derniers jours de révisions) depuis review_logs
        const { data: logs } = await supabase
          .from("review_logs")
          .select("reviewed_at")
          .gte("reviewed_at", new Date(Date.now() - 7 * 86400000).toISOString());
        setSpark(buildSpark(logs || []));

        // 7) Derniers badges
        const { data: ub } = await supabase
          .from("user_badges")
          .select("badge_code, earned_at")
          .order("earned_at", { ascending: false })
          .limit(6);
        if (ub?.length) {
          const codes = ub.map((x) => x.badge_code);
          const { data: meta } = await supabase
            .from("badges")
            .select("code, title, description, color, icon")
            .in("code", codes);
          const dict = new Map((meta || []).map((m) => [m.code, m]));
          setBadges(
            ub.map((x) => ({
              code: x.badge_code,
              earnedAt: x.earned_at,
              title: dict.get(x.badge_code)?.title ?? x.badge_code,
              color: dict.get(x.badge_code)?.color ?? "gold",
              icon: dict.get(x.badge_code)?.icon ?? "award",
            }))
          );
        }
      } catch (e) {
        console.error(e);
        setErr(e.message || "Erreur");
        toast.error("Erreur chargement Dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  

  const learn = useMemo(() => todayItems.filter((i) => i.kind === "learn"), [todayItems]);
  const planReviews = useMemo(() => todayItems.filter((i) => i.kind === "plan-review"), [todayItems]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Assalamu alaykum</h1>
            <p className="text-muted-foreground text-sm">{today}</p>
          </div>
          <Badge className="bg-[#0a1b2a] text-[#f3c979]">CoranFocus</Badge>
        </div>
      </motion.div>

      {err && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{err}</CardContent>
        </Card>
      )}

      {/* KPI rapides */}
      <Section title="Progression">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            title="Versets mémorisés"
            value={stats?.total_ayahs_memorized ?? 0}
            icon={<BookOpen className="h-4 w-4" />}
          />
          <KpiCard
            title="Segments terminés"
            value={stats?.completed_segments ?? 0}
            icon={<CalendarCheck2 className="h-4 w-4" />}
          />
          <KpiCard title="Streak (jours)" value={streak} icon={<Sparkles className="h-4 w-4" />} />
          <KpiCard title="SM-2 à réviser" value={sm2Due} icon={<RefreshCcw className="h-4 w-4" />} />
        </div>

        {/* Sparkline (7 jours) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activité 7 derniers jours</CardTitle>
          </CardHeader>
          <CardContent className="h-24">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spark}>
                  <Tooltip
                    cursor={{ stroke: "#334155", strokeDasharray: 2 }}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#f3c979"
                    strokeWidth={2}
                    dot={{ r: 2, stroke: "#0a1b2a", fill: "#f3c979" }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </Section>

      <Separator />

      {/* À apprendre aujourd’hui */}
      <Section title="À apprendre aujourd’hui">
        {loading && <Skeleton className="h-24 w-full" />}
        {!loading && learn.length === 0 && <Empty text="Rien à apprendre aujourd’hui" />}
        {!loading &&
          learn.map((l) => (
            <Card key={l.ref_id} className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pages {l.page_from}–{l.page_to}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Aujourd’hui</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => navigate(`/learn/session?seg=${l.ref_id}`)}>
                    Commencer
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </Section>

      {/* Révisions planifiées */}
      <Section
        title="Révisions planifiées"
        right={<Badge variant="secondary">{planReviews.length}</Badge>}
      >
        {loading && <Skeleton className="h-20 w-full" />}
        {!loading && planReviews.length === 0 && <Empty text="Aucune révision programmée" />}
        {!loading &&
          planReviews.map((r) => (
            <Card key={r.ref_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Révision programmée</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Règles J+3 / J+7 / J+30</span>
                <Button variant="outline" onClick={() => navigate("/review")}>
                  Réviser
                </Button>
              </CardContent>
            </Card>
          ))}
      </Section>

      {/* Derniers badges */}
      <Section title="Derniers badges">
        {loading && <Skeleton className="h-24 w-full" />}
        {!loading && badges.length === 0 && <Empty text="Aucun badge pour le moment" />}
        {!loading && badges.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((b) => (
              <Card key={b.code} className="border-[#f3c979]/40">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{b.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Obtenu le {new Date(b.earnedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className="bg-[#0a1b2a] text-[#f3c979]">{b.icon}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Actions rapides */}
      <Section title="Actions rapides">
        <div className="grid grid-cols-2 gap-3">
          <Button className="bg-[#0a1b2a] text-[#f3c979] hover:bg-[#0a1b2a]/90" onClick={() => navigate("/review")}>
            Lancer SM-2
          </Button>
          <Button variant="outline" onClick={() => navigate("/surahs")}>
            Planifier une sourate
          </Button>
        </div>
      </Section>
    </div>
  );
}

// ——————————————————————————————————————————————————————
// Composants internes
// ——————————————————————————————————————————————————————
function KpiCard({ title, value, icon }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value ?? 0}</p>
        </div>
        <div className="rounded-xl bg-[#0a1b2a] p-2 text-[#f3c979]">{icon}</div>
      </CardContent>
    </Card>
  );
}

// Streak local très simple : compte les jours consécutifs où il y a ≥1 log
function calcLocalStreak(logs) {
  if (!logs?.length) return 0;
  const days = new Set(logs.map((l) => new Date(l.reviewed_at).toDateString()));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (days.has(d.toDateString())) streak++;
    else break;
  }
  return streak;
}

// Construit une sparkline pour les 7 derniers jours
function buildSpark(logs) {
  const base = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    base.push({ day: d.toLocaleDateString(), key: d.toDateString(), count: 0 });
  }
  logs.forEach((l) => {
    const k = new Date(l.reviewed_at).toDateString();
    const found = base.find((x) => x.key === k);
    if (found) found.count += 1;
  });
  return base;
}
