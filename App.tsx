import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Pipeline } from './pages/Pipeline';
import { DealDetail } from './pages/DealDetail';
import { Tasks } from './pages/Tasks';
import { Archive } from './pages/Archive';
import { Settings } from './pages/Settings';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Pipeline />} />
          <Route path="/deals/:id" element={<DealDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
