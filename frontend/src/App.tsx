import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Book from './components/Book'
import { ToastProvider } from './components/ui'
import { APP_TABS } from './config'
import About, { AboutRight } from './pages/About'
import Groups, { GroupPage } from './pages/Groups'
import Home, { HomeRight } from './pages/Home'
import PlanBook from './pages/PlanBook'
import Plans from './pages/Plans'
import SettingsPage, { applySettings, readSettings } from './pages/Settings'
import { HomeRight as PlansRight } from './pages/Home'

/** Home, Plans, Groups, Settings and About are pages of the same book, with the app sections as tabs. */
function AppBook({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  const loc = useLocation()
  const nav = useNavigate()
  const active = APP_TABS.find((t) => t.key !== '/' && loc.pathname.startsWith(t.key))?.key ?? (loc.pathname.startsWith('/g/') ? '/groups' : '/')
  return (
    <Book tabs={APP_TABS} active={active} onTab={(k) => nav(k)} turnKey={loc.pathname}
      headLeft="Nobody Plans" headRight={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      left={left} right={right} />
  )
}

function OldAnswerLink() {
  const { id } = useParams()
  return <Navigate to={`/p/${id}?tab=who`} replace />
}

export default function App() {
  useEffect(() => applySettings(readSettings()), [])
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<AppBook left={<Home />} right={<HomeRight />} />} />
        <Route path="/plans" element={<AppBook left={<Plans />} right={<PlansRight />} />} />
        <Route path="/groups" element={<AppBook left={<Groups />} />} />
        <Route path="/g/:id" element={<AppBook left={<GroupPage />} />} />
        <Route path="/settings" element={<AppBook left={<SettingsPage />} right={<AboutRight />} />} />
        <Route path="/about" element={<AppBook left={<About />} right={<AboutRight />} />} />
        <Route path="/new" element={<PlanBook />} />
        <Route path="/p/:id" element={<PlanBook />} />
        <Route path="/p/:id/answer" element={<OldAnswerLink />} />
      </Routes>
    </ToastProvider>
  )
}
