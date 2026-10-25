import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/ui'
import { APP_NAME } from './config'
import Groups, { GroupPage } from './pages/Groups'
import Home from './pages/Home'
import Join from './pages/Join'
import NewPlan from './pages/NewPlan'
import PlanPage from './pages/PlanPage'
import Plans from './pages/Plans'

const TABS = [
  { to: '/', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { to: '/plans', label: 'Plans', icon: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z' },
  { to: '/groups', label: 'Groups', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2.4.6 4 2.8 4 6' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Nav() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] px-4 text-base font-semibold ${
      isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-muted'
    }`
  return (
    <>
      {/* laptop: left sidebar */}
      <nav aria-label="Main" className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-2 border-r border-line bg-surface p-4 md:flex">
        <span className="px-4 pb-4 pt-2 text-lg font-bold">{APP_NAME}</span>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={link}>
            <Icon d={t.icon} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      {/* phone: bottom bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-semibold ${isActive ? 'text-accent' : 'text-ink-soft'}`}
          >
            <Icon d={t.icon} />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  const loc = useLocation()
  // The step-by-step flows are full screen; the tab bar would only be a way to lose your place
  const inFlow = loc.pathname.startsWith('/new') || loc.pathname.endsWith('/answer')
  return (
    <ToastProvider>
      {!inFlow && <Nav />}
      <main className={`w-full px-4 pt-4 ${inFlow ? 'pb-12' : 'pb-28 md:pb-12 md:pl-64'}`}>
        <div className="mx-auto w-full max-w-xl">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<NewPlan />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/g/:id" element={<GroupPage />} />
            <Route path="/p/:id" element={<PlanPage />} />
            <Route path="/p/:id/answer" element={<Join />} />
          </Routes>
        </div>
      </main>
    </ToastProvider>
  )
}
