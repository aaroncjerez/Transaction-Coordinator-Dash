import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Pipeline } from './pages/Pipeline';
import { DealDetail } from './pages/DealDetail';
import { Tasks } from './pages/Tasks';
import { Archive } from './pages/Archive';
import { Analytics } from './pages/Analytics';
import { KPIs } from './pages/KPIs';
import { Settings } from './pages/Settings';
import { Leads } from './pages/Leads';
import { AIDialer } from './pages/AIDialer';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/dialer" element={<AIDialer />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/kpis" element={<KPIs />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
