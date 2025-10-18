import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Learn from './pages/Learn.jsx'
import Review from './pages/Review.jsx'
import Stats from './pages/Stats.jsx'
import Profile from './pages/Profile.jsx'
import Login from "./pages/Login.jsx"
import Badges from "./pages/Badges.jsx";
import SurahBaqara from "./pages/SurahBaqara.jsx"
import ReviewSM2 from "./pages/ReviewSM2.jsx"
import SurahPicker from "./pages/SurahPicker.jsx";
import PlanSurah from "./pages/PlanSurah.jsx";
import AppNav from "@/components/AppNav";
import { Toaster } from "sonner"
import Sm2Playground from './pages/Sm2Playground.jsx'
import LearnSession from "./pages/LearnSession.jsx"
import SurahList from './pages/SurahList.jsx'
import InProgress from './pages/InProgress.jsx'

const Tab = ({ to, label }) => (
<NavLink to={to} className={({isActive}) => `flex-1 text-center py-3 ${isActive? 'text-brand-green font-semibold':'text-slate-500'}`}>{label}</NavLink>
)


export default function App(){
const location = useLocation()
return (
<div className="min-h-screen flex flex-col">
<div className="flex-1 p-4 pb-20">
    <AppNav />
<Routes location={location}>

<Route path="/learn" element={<Learn />} />
<Route path="/stats" element={<Stats />} />
<Route path="/profile" element={<Profile />} />
<Route path="/" element={<Dashboard />} />
<Route path="/learn/in-progress" element={<InProgress />} />


<Route path="/review" element={<ReviewSM2 />} />
<Route path="/login" element={<Login />} />
<Route path="/learn/session" element={<LearnSession />} />

<Route path="/plan" element={<PlanSurah />} />
<Route path="/surahs" element={<SurahList />} />
<Route path="/badges" element={<Badges />} />

</Routes>
</div>

<Toaster richColors position="top-center" />
</div>
)
}