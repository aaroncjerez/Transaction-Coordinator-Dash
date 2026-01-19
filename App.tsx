import React from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';

// Since we don't have a real router in this constrained env, we render the Dashboard directly.
// In a real Next.js app, this would be handled by page.tsx and layout.tsx
const App: React.FC = () => {
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
};

export default App;
