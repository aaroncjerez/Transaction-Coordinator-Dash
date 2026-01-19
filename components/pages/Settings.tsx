import React from 'react';
import { Button } from '../ui/Button';
import { User, Bell, Shield, Key } from 'lucide-react';

export const Settings: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your account preferences and workspace settings.</p>
      </header>

      <main className="p-6 max-w-4xl space-y-6">
        
        {/* Profile Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2 text-primary" /> Profile Information
                </h2>
            </div>
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">First Name</label>
                        <input type="text" defaultValue="John" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none" />
                    </div>
                     <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Last Name</label>
                        <input type="text" defaultValue="Doe" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none" />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Email Address</label>
                    <input type="email" defaultValue="john@nexus.com" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none" />
                </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <Button>Save Changes</Button>
            </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Bell className="h-5 w-5 mr-2 text-primary" /> Notifications
                </h2>
            </div>
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-900">Email Alerts</p>
                        <p className="text-xs text-gray-500">Receive daily summaries and critical alerts.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                </div>
                 <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-900">Push Notifications</p>
                        <p className="text-xs text-gray-500">Get real-time updates on your mobile device.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                </div>
            </div>
        </div>
         
         <div className="flex justify-end">
            <Button variant="destructive" className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 shadow-none">
                Delete Account
            </Button>
         </div>

      </main>
    </div>
  );
};
