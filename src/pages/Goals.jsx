import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const NIGHT = "#0b1b2b";
const GOLD  = "#d4af37";

const GoalRow = ({ type, current, onSave }) => {
  const [target, setTarget] = useState(current?.target ?? "");
  const pct = Math.max(0, Math.min(100, Number(current?.pct || 0)));
  const value = current?.value ?? 0;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label(type)}</CardTitle>
          <Badge className="bg-[--night] text-[--gold]" style={{["--night"]:NIGHT,["--gold"]:GOLD}}>
            {value}/{target || "—"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={target}
            onChange={(e)=>setTarget(e.target.value)}
            className="max-w-[120px]"
            placeholder="Objectif"
          />
          <Button
            onClick={() => {
              const t = Number(target);
              if (!Number.isFinite(t) || t <= 0) {
                toast.error("Entre une valeur > 0");
                return;
              }
              onSave(type, "daily", t);
            }}
            className="bg-[--night] hover:opacity-90"
            style={{["--night"]:NIGHT}}
          >
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // [{goal_type, period, target, value, pct}]

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("current_goals_with_progress");
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      toast.error("Impossible de charger les objectifs", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const onSave = async (goal_type, period, target) => {
    const id = toast.loading("Enregistrement…");
    try {
      const { error } = await supabase.rpc("set_goal", { p_goal_type: goal_type, p_period: period, p_target: target });
      if (error) throw error;
      toast.success("Objectif mis à jour");
      await load();
    } catch (e) {
      toast.error("Échec", { description: e.message });
    } finally {
      toast.dismiss(id);
    }
  };

  useEffect(() => { load(); }, []);

  // Map pour accès rapide par type
  const byType = useMemo(() => {
    const m = new Map();
    (rows || []).forEach(r => m.set(r.goal_type, r));
    return m;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Objectifs</h1>
          <p className="text-sm text-slate-600">Fixe ton rythme quotidien. Motivation = progression.</p>
        </div>
        <Badge className="bg-[--night] text-[--gold]" style={{["--night"]:NIGHT,["--gold"]:GOLD}}>
          CoranFocus
        </Badge>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <GoalRow type="verses"   current={byType.get("verses")}   onSave={onSave} />
          <GoalRow type="segments" current={byType.get("segments")} onSave={onSave} />
          <GoalRow type="reviews"  current={byType.get("reviews")}  onSave={onSave} />
        </div>
      )}
    </div>
  );
}

function label(t){
  switch(t){
    case "verses": return "Versets / jour";
    case "segments": return "Segments / jour";
    case "reviews": return "Révisions / jour";
    default: return t;
  }
}
