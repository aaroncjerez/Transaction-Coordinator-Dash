import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Customers } from './components/pages/Customers';
import { Projects } from './components/pages/Projects';
import { Analytics } from './components/pages/Analytics';
import { Settings } from './components/pages/Settings';

const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('/dashboard');

  const renderContent = () => {
    switch(currentPath) {
        case '/dashboard': return <Dashboard />;
        case '/customers': return <Customers />;
        case '/projects': return <Projects />;
        case '/analytics': return <Analytics />;
        case '/settings': return <Settings />;
        case '/logout': 
            // Simple visual feedback for demo
            setCurrentPath('/dashboard'); 
            alert('Logged out (demo)');
            return <Dashboard />;
        default: return <Dashboard />;
    }
  }

  return (
    <Layout currentPath={currentPath} onNavigate={setCurrentPath}>
      {renderContent()}
    </Layout>
  );
};

export default App;
