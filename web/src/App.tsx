import { BrowserRouter, Route, Routes } from 'react-router'
import { MapsProvider } from './components/MapsProvider'
import { TripList } from './routes/TripList'
import { PlaceDrawer } from './routes/PlaceDrawer'
import { DayPlanner } from './routes/DayPlanner'
import { PasteImport } from './routes/PasteImport'
import { Destinations } from './routes/Destinations'
import { Debug } from './routes/Debug'

export default function App() {
  return (
    <MapsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TripList />} />
          <Route path="/trip/:tripId" element={<PlaceDrawer />} />
          <Route path="/trip/:tripId/plan" element={<DayPlanner />} />
          <Route path="/trip/:tripId/import" element={<PasteImport />} />
          <Route path="/trip/:tripId/cities" element={<Destinations />} />
          <Route path="/debug" element={<Debug />} />
        </Routes>
      </BrowserRouter>
    </MapsProvider>
  )
}
