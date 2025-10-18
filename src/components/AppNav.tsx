import { useState, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils"; // shadcn helper (ou remplace par clsx si besoin)
import {
  Home,
  BookOpen,
  Repeat,
  BarChart2,
  User,
  Sparkles,
  Award,
} from "lucide-react";

type LinkItem = {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const LINKS: LinkItem[] = [
  { to: "/", label: "Today", icon: Home },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/review", label: "Review", icon: Repeat },
  { to: "/stats", label: "Stats", icon: BarChart2 },
  { to: "/badges", label: "Badges", icon: Award },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/sm2playground", label: "SM-2", icon: Sparkles },
];

export default function AppNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // referme le menu à chaque navigation
  useMemo(() => setOpen(false), [location.pathname]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[#1b2c46] bg-[#0b1a2a]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0b1a2a]/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-3 sm:px-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-amber-400 text-[#0b1a2a] font-black">
              CF
            </div>
            <span className="hidden text-sm font-semibold tracking-wide text-white sm:inline">
              Coran<span className="text-amber-400">Focus</span>
            </span>
          </div>

          {/* Liens desktop */}
          <nav className="hidden gap-1 sm:flex">
            {LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-amber-400/10 text-amber-300"
                      : "text-white/80 hover:text-white"
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Burger mobile */}
          <button
            aria-label="Ouvrir le menu"
            onClick={() => setOpen((v) => !v)}
            className="relative h-9 w-10 sm:hidden"
          >
            {/* 3 barres animées */}
            <span className="sr-only">Menu</span>
            <motion.span
              animate={open ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
              className="absolute left-1/2 top-[9px] h-[2px] w-6 -translate-x-1/2 rounded bg-amber-300"
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            />
            <motion.span
              animate={open ? { opacity: 0 } : { opacity: 1 }}
              className="absolute left-1/2 top-[17px] h-[2px] w-6 -translate-x-1/2 rounded bg-amber-300"
            />
            <motion.span
              animate={open ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
              className="absolute left-1/2 top-[25px] h-[2px] w-6 -translate-x-1/2 rounded bg-amber-300"
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            />
          </button>
        </div>
      </header>

      {/* Décalage du contenu sous la barre */}
      <div className="h-14" />

      {/* Drawer mobile */}
      <AnimatePresence>
        {open && (
          <>
            {/* Voile */}
            <motion.div
              key="overlay"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            {/* Panneau */}
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="fixed inset-y-0 left-0 z-50 w-[82%] max-w-[320px] border-r border-[#1b2c46] bg-[#0b1a2a] shadow-2xl"
            >
              <div className="flex h-14 items-center justify-between px-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-amber-400 text-[#0b1a2a] font-black">
                    CF
                  </div>
                  <span className="text-sm font-semibold tracking-wide text-white">
                    Coran<span className="text-amber-400">Focus</span>
                  </span>
                </div>
                <button
                  aria-label="Fermer"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-amber-300 hover:bg-amber-400/10"
                >
                  Fermer
                </button>
              </div>

              <nav className="mt-2 space-y-1 px-2 pb-6">
                {LINKS.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to;
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition",
                        active
                          ? "bg-amber-400/10 text-amber-300"
                          : "text-white/85 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon
                        size={18}
                        className={active ? "text-amber-300" : "text-white/70"}
                      />
                      <span>{label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
