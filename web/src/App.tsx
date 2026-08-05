import { BrowserRouter, Route, Routes } from 'react-router'
import { MapsProvider } from './components/MapsProvider'
import { AuthProvider } from './lib/auth'
import { AuthGate } from './components/AuthGate'
import { OfflineBanner } from './components/OfflineBanner'
import { Analytics } from './components/Analytics'
import { TripList } from './routes/TripList'
import { PlaceDrawer } from './routes/PlaceDrawer'
import { DayPlanner } from './routes/DayPlanner'
import { PasteImport } from './routes/PasteImport'
import { Destinations } from './routes/Destinations'
import { Share } from './routes/Share'
import { Packing } from './routes/Packing'
import { Documents } from './routes/Documents'
import { Debug } from './routes/Debug'

export default function App() {
  return (
    <AuthProvider>
      <MapsProvider>
        <BrowserRouter>
          <Analytics />
          <OfflineBanner />
          <Routes>
            {/* 환경 점검은 로그인 없이도 봐야 한다 — 설정이 틀렸을 때 확인할 곳 */}
            <Route path="/debug" element={<Debug />} />
            <Route
              path="*"
              element={
                <AuthGate>
                  <Routes>
                    <Route path="/" element={<TripList />} />
                    <Route path="/trip/:tripId" element={<PlaceDrawer />} />
                    <Route path="/trip/:tripId/plan" element={<DayPlanner />} />
                    <Route path="/trip/:tripId/import" element={<PasteImport />} />
                    <Route path="/trip/:tripId/cities" element={<Destinations />} />
                    <Route path="/trip/:tripId/share" element={<Share />} />
                    <Route path="/trip/:tripId/packing" element={<Packing />} />
                    <Route path="/trip/:tripId/docs" element={<Documents />} />
                  </Routes>
                </AuthGate>
              }
            />
          </Routes>
        </BrowserRouter>
      </MapsProvider>
    </AuthProvider>
  )
}
