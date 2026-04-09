import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import TrackPage from './TrackPage'
import RatePage from './RatePage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/track/:requestId" element={<TrackPage />} />
        <Route path="/rate/:requestId/:token" element={<RatePage />} />
        <Route path="*" element={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="text-center">
              <h1 className="text-xl font-bold text-[#E31837]">Durante Equipment</h1>
              <p className="text-gray-500 mt-2">Enter a tracking URL to view your service request status.</p>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
