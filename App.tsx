import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { KPIs } from './pages/KPIs';
import { Settings } from './pages/Settings';
import { AIDialer } from './pages/AIDialer';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/kpis" replace />} />
          <Route path="/kpis" element={<KPIs />} />
          <Route path="/dialer" element={<AIDialer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/kpis" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
