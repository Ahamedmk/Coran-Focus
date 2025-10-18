import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge as ShadBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { LogOut, Edit3, Award, BookOpen, Flame, CheckCircle } from "lucide-react";

const NAVY = "#0B1535";
const GOLD = "#D4AF37";

export default function Profil() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [kpis, setKpis] = useState({
    total_ayahs_memorized: 0,
    completed_segments: 0,
    streak: 0,
  });

  const [badges, setBadges] = useState([]); // {code,title,description,awarded_at}

  const [pace, setPace] = useState(() => {
    const v = Number(localStorage.getItem("cf_default_pace") || 2);
    return Number.isFinite(v) && v > 0 ? v : 2;
  });
  const [savingPace, setSavingPace] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Auth user
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setErr("Pas connecté");
          setLoading(false);
          return;
        }
        setUser(auth.user);
        setDisplayName(
          auth.user.user_metadata?.full_name ||
          auth.user.user_metadata?.name ||
          auth.user.email?.split("@")[0] ||
          "Utilisateur"
        );

        // KPIs via vue + streak local
        const [{ data: stats }, { data: revs }] = await Promise.all([
          supabase.from("user_progress_stats").select("*").eq("user_id", auth.user.id).maybeSingle(),
          supabase.from("review_logs").select("reviewed_at").order("reviewed_at", { ascending: true }),
        ]);

        const reviewsPerDay = (revs || []).reduce((m, r) => {
          const k = new Date(r.reviewed_at).toISOString().slice(0,10);
          m.set(k, (m.get(k)||0)+1); return m;
        }, new Map());
        const streak = (() => {
          if (reviewsPerDay.size === 0) return 0;
          const setDays = new Set(reviewsPerDay.keys());
          const cur = new Date(); cur.setHours(0,0,0,0);
          let s = 0;
          while (setDays.has(cur.toISOString().slice(0,10))) {
            s++; cur.setDate(cur.getDate()-1);
          }
          return s;
        })();

        setKpis({
          total_ayahs_memorized: stats?.total_ayahs_memorized ?? (revs?.length ?? 0),
          completed_segments: stats?.completed_segments ?? 0,
          streak,
        });

        // Badges (récents d’abord)
        const { data: ub } = await supabase
          .from("user_badges")
          .select("badge_code, created_at")
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false })
          .limit(6);

        if (!ub || ub.length === 0) {
          setBadges([]);
        } else {
          // enrichir avec le catalogue
          const codes = ub.map((x) => x.badge_code);
          const { data: cats } = await supabase
            .from("badges")
            .select("code, title, description, color")
            .in("code", codes);

          const map = new Map((cats || []).map((c) => [c.code, c]));
          setBadges(
            ub.map((x) => ({
              code: x.badge_code,
              title: map.get(x.badge_code)?.title ?? x.badge_code,
              description: map.get(x.badge_code)?.description ?? "",
              color: map.get(x.badge_code)?.color ?? "gold",
              awarded_at: x.created_at,
            }))
          );
        }
      } catch (e) {
        console.error(e);
        setErr(e.message || "Erreur");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const initials = useMemo(() => {
    const s = displayName?.trim() || "";
    const parts = s.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "C") + (parts[1]?.[0] || "F");
  }, [displayName]);

  const saveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      // 1) tenter user_profiles
      const { error: upErr } = await supabase
        .from("user_profiles")
        .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });
      if (upErr?.code === "42P01") {
        // table absente -> fallback metadata
        const { error: aerr } = await supabase.auth.updateUser({
          data: { full_name: displayName },
        });
        if (aerr) throw aerr;
      } else if (upErr) {
        throw upErr;
      }
      toast.success("Nom mis à jour");
    } catch (e) {
      toast.error("Impossible de mettre à jour le nom", { description: e.message });
    } finally {
      setSavingName(false);
    }
  };

  const savePace = async () => {
    setSavingPace(true);
    try {
      // si tu as une table user_settings (user_id, default_pace int)
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, default_pace: pace }, { onConflict: "user_id" });
      if (error?.code === "42P01") {
        // pas de table -> fallback localStorage
        localStorage.setItem("cf_default_pace", String(pace));
      } else if (error) {
        throw error;
      }
      toast.success("Rythme par défaut enregistré");
    } catch (e) {
      toast.error("Échec de l’enregistrement", { description: e.message });
    } finally {
      setSavingPace(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/login");
  };

  return (
    <div className="space-y-6">
      {/* Header profil */}
      <Card className="shadow-sm" style={{ borderColor: GOLD }}>
        <CardContent className="flex items-center gap-4 py-5">
          {/* Avatar simple (initiales) */}
          <div
            className="grid h-16 w-16 place-items-center rounded-full font-bold text-xl"
            style={{ backgroundColor: NAVY, color: GOLD, boxShadow: `0 0 0 2px ${GOLD} inset` }}
          >
            {loading ? "…" : initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold tracking-tight" style={{ color: NAVY }}>
                {loading ? <Skeleton className="h-6 w-40" /> : displayName}
              </h1>
              <ShadBadge className="bg-amber-100 text-amber-700 border border-amber-200">CoranFocus</ShadBadge>
            </div>
            <div className="text-sm text-slate-500 truncate">
              {loading ? <Skeleton className="h-4 w-64" /> : user?.email}
            </div>
          </div>
          <Button variant="outline" onClick={signOut} className="hidden sm:flex">
            <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Versets mémorisés" value={kpis.total_ayahs_memorized} icon={<BookOpen className="h-4 w-4" />} />
        <KpiCard title="Segments terminés" value={kpis.completed_segments} icon={<CheckCircle className="h-4 w-4" />} />
        <KpiCard title="Streak (jours)" value={kpis.streak} icon={<Flame className="h-4 w-4" />} />
      </div>

      {/* Éditions rapides */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>Modifier le nom</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
            <Button onClick={saveName} disabled={savingName}>
              <Edit3 className="h-4 w-4 mr-2" /> {savingName ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ color: NAVY }}>Rythme par défaut (pages/jour)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              value={pace}
              onChange={(e)=>setPace(Math.max(1, Number(e.target.value||1)))}
              className="max-w-[120px] text-center"
            />
            <Button onClick={savePace} disabled={savingPace}>
              {savingPace ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <span className="text-xs text-slate-500">Utilisé comme valeur préremplie lors d’un nouveau programme.</span>
          </CardContent>
        </Card>
      </div>

      {/* Badges récents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <Award className="h-4 w-4 text-amber-500" /> Badges récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : badges.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun badge pour l’instant. Continue tes révisions 💪</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {badges.map((b) => (
                <motion.div
                  key={b.code}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl p-3 border bg-white"
                  style={{ borderColor: b.color === "gold" ? GOLD : "#e2e8f0" }}
                  title={b.description}
                >
                  <div className="text-sm font-semibold truncate" style={{ color: NAVY }}>{b.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Obtenu le {new Date(b.awarded_at).toLocaleDateString()}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Button variant="outline" onClick={()=>window.location.assign("/badges")}>
              Voir tous les badges
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bouton déconnexion (mobile) */}
      <div className="sm:hidden">
        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
        </Button>
      </div>
    </div>
  );
}

/* --- Sous-composant KPI --- */
function KpiCard({ title, value, icon }) {
  return (
    <Card className="shadow-sm" style={{ borderColor: "#F6E7B2" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2" style={{ color: NAVY }}>
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-bold" style={{ color: GOLD }}>
        {typeof value === "number" ? value : <Skeleton className="h-8 w-20" />}
      </CardContent>
    </Card>
  );
}
