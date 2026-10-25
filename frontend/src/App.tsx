import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useOutlet, useParams } from 'react-router-dom'
import Book from './components/Book'
import { ToastProvider } from './components/ui'
import { APP_TABS } from './config'
import About, { AboutRight } from './pages/About'
import Groups, { GroupPage } from './pages/Groups'
import Home, { HomeRight } from './pages/Home'
import PlanBook from './pages/PlanBook'
import Plans from './pages/Plans'
import SettingsPage, { applySettings, readSettings } from './pages/Settings'

const RIGHT: Record<string, React.ReactNode> = {
  '/': <HomeRight />,
  '/plans': <HomeRight />,
  '/settings': <AboutRight />,
  '/about': <AboutRight />,
}

/** Home, Plans, Groups, Settings and About are pages of ONE book that stays mounted, so moving between them
 *  turns a page instead of swapping the whole book. */
function AppLayout() {
  const outlet = useOutlet() // a snapshot of this page, so the turning leaf can still show it
  const loc = useLocation()
  const nav = useNavigate()
  const active = APP_TABS.find((t) => t.key !== '/' && loc.pathname.startsWith(t.key))?.key ?? (loc.pathname.startsWith('/g/') ? '/groups' : '/')
  return (
    <Book tabs={APP_TABS} active={active} onTab={(k) => nav(k)}
      headLeft="Nobody Plans" headRight={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      left={outlet} right={RIGHT[active]} />
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
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/g/:id" element={<GroupPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<About />} />
        </Route>
        <Route path="/new" element={<PlanBook />} />
        <Route path="/p/:id" element={<PlanBook />} />
        <Route path="/p/:id/answer" element={<OldAnswerLink />} />
      </Routes>
    </ToastProvider>
  )
}
