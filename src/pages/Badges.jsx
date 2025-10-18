// src/pages/Badges.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge as ShadBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Lock, RefreshCw, Sparkles } from "lucide-react";

const NIGHT = "#0b1220";
const GOLD  = "#e7c24f";

export default function Badges() {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);             // table badges
  const [mine, setMine] = useState({});                   // {code: {awarded_at, ...}}
  const [justAwarded, setJustAwarded] = useState([]);     // codes revenus par la RPC
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
    const [{ data: cats, error: e1 }, { data: ub, error: e2 }] = await Promise.all([
   supabase
     .from("badges")
     .select("*")
     .order("category", { ascending: true })
     .order("tier", { ascending: true }),
+   // on trie par created_at (colonne réellement présente)
+   supabase
     .from("user_badges")
     .select("*")
     .order("created_at", { ascending: false }),
]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map = {};
      (ub || []).forEach((b) => {
   map[b.badge_code] = {
     ...b,
     // "awarded_at" si présent, sinon "created_at", sinon autre nom éventuel
     awarded_at: b.awarded_at ?? b.created_at ?? b.inserted_at ?? null,
   };
});
      setCatalog(cats || []);
      setMine(map);
    } catch (e) {
      setError(e.message);
      toast.error("Impossible de charger les badges", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byCategory = useMemo(() => {
    const groups = new Map();
    for (const b of catalog) {
      if (!groups.has(b.category)) groups.set(b.category, []);
      groups.get(b.category).push(b);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const onRefresh = async () => {
    setJustAwarded([]);
    const id = toast.loading("Vérification des badges…");
    try {
      const { data, error } = await supabase.rpc("award_badges_for_me");
      if (error) throw error;

      const newly = (data?.awarded_now || []).map((row) => row.badge_code || row.code || row.slug) // sûreté
        .filter(Boolean);

      await load();
      setJustAwarded(newly);
      if (newly.length > 0) {
        toast.success(`🎉 ${newly.length} badge${newly.length > 1 ? "s" : ""} débloqué${newly.length > 1 ? "s" : ""} !`);
      } else {
        toast.info("Rien de nouveau pour l’instant.");
      }
    } catch (e) {
      toast.error("Échec de l’actualisation", { description: e.message });
    } finally {
      toast.dismiss(id);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Badges</h1>
          <p className="text-sm text-muted-foreground">Tes distinctions</p>
        </div>
        <Button onClick={onRefresh} className="bg-[--night] hover:opacity-90"
          style={{ ["--night"]: NIGHT }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualiser
        </Button>
      </header>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {byCategory.map(([cat, items]) => (
            <section key={cat} className="space-y-3">
              <div className="flex items-center gap-2">
                <ShadBadge
                  className="rounded-full text-xs"
                  style={{ backgroundColor: NIGHT, color: GOLD, borderColor: GOLD, borderWidth: 1 }}
                >
                  {labelCategory(cat)}
                </ShadBadge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {items.map((b) => {
                    const awarded = !!mine[b.code];
                    const isNew = justAwarded.includes(b.code);

                    return (
                      <motion.div
                        key={b.code}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <BadgeCard
                          badge={b}
                          awarded={awarded}
                          isNew={isNew}
                          awardedAt={mine[b.code]?.awarded_at}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- sous-composant ---------- */

function BadgeCard({ badge, awarded, isNew, awardedAt }) {
  // style commun
  const base = awarded
    ? "bg-[--night] text-white"
    : "bg-muted/40 text-muted-foreground";

  const borderStyle = awarded
    ? { borderColor: GOLD, boxShadow: `0 0 0 1px ${GOLD} inset, 0 8px 24px rgba(231,194,79,.15)` }
    : {};

  return (
    <Card className={`rounded-2xl ${base}`} style={{ ["--night"]: NIGHT, ...borderStyle }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {awarded ? (
              <Trophy size={18} color={GOLD} />
            ) : (
              <Lock size={18} className="opacity-70" />
            )}
            <span>{badge.title}</span>
          </CardTitle>

          {awarded && (
            <ShadBadge variant="secondary" className="bg-transparent border" style={{ borderColor: GOLD, color: GOLD }}>
              Palier {badge.tier}
            </ShadBadge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex items-center justify-between py-3">
        <div className="text-sm opacity-90">
          <p className="">{badge.description}</p>
          {awardedAt && (
            <p className="text-xs mt-1 opacity-75">
              Obtenu le {new Date(awardedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        <AnimatePresence>
          {isNew && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="ml-3"
              title="Nouveau badge !"
            >
              <Sparkles size={22} color={GOLD} />
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

/* ---------- helpers ---------- */

function labelCategory(cat) {
  switch (cat) {
    case "memorization": return "Mémorisation";
    case "review":       return "Révision";
    case "program":      return "Programme";
    default:             return cat ?? "Autres";
  }
}
