import { Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'

export default function App() {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    </div>
  )
}
