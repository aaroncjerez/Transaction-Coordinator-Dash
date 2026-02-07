import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Deals } from './pages/Deals';
import { DealDetail } from './pages/DealDetail';
import { DailyReview } from './pages/DailyReview';

import { Tasks } from './pages/Tasks';
import { Dashboard } from './pages/Dashboard';
import { MarketResearch } from './pages/MarketResearch';
import { Settings } from './pages/Settings';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/market" element={<MarketResearch />} />
          <Route path="/daily" element={<DailyReview />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/analytics" element={<div className="p-4">Analytics View (Coming Soon)</div>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
