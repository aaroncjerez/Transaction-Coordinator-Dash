import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Deals } from './pages/Deals';
import { DealDetail } from './pages/DealDetail';

import { Dashboard } from './pages/Dashboard';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/tasks" element={<div className="p-4">Tasks View (Coming Soon)</div>} />
          <Route path="/analytics" element={<div className="p-4">Analytics View (Coming Soon)</div>} />
          <Route path="/settings" element={<div className="p-4">Settings View (Coming Soon)</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
