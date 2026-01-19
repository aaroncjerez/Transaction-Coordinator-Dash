import React from 'react';
import { CHART_DATA, MOCK_METRICS } from '../../constants';
import { RevenueChart, ActivityChart } from '../Charts';
import { Button } from '../ui/Button';
import { Download, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Analytics: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Deep dive into your performance metrics.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" /> Oct 2023
            </Button>
            <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" /> Report
            </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
         {/* Detailed Stats */}
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             {MOCK_METRICS.map((metric, i) => (
                 <div key={i} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                     <p className="text-sm font-medium text-gray-500">{metric.label}</p>
                     <div className="mt-2 flex items-end gap-2">
                         <h3 className="text-2xl font-bold text-gray-900">{metric.value}</h3>
                         <span className={cn("text-xs font-semibold mb-1 flex items-center", metric.trendDirection === 'up' ? "text-emerald-600" : "text-red-600")}>
                             {metric.trendDirection === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                             {Math.abs(metric.trend)}%
                         </span>
                     </div>
                 </div>
             ))}
         </div>

         {/* Big Charts */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">Revenue Growth</h3>
                <RevenueChart data={CHART_DATA} />
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6">User Engagement</h3>
                <ActivityChart data={CHART_DATA} />
            </div>
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm col-span-2">
                 <h3 className="text-lg font-bold text-gray-900 mb-4">Regional Performance</h3>
                 <div className="space-y-4">
                     {['North America', 'Europe', 'Asia Pacific', 'South America'].map((region, i) => (
                         <div key={region} className="flex items-center">
                             <span className="w-32 text-sm text-gray-600">{region}</span>
                             <div className="flex-1 bg-gray-100 rounded-full h-2 mx-4">
                                 <div className="bg-indigo-500 h-2 rounded-full" style={{width: `${85 - (i * 20)}%`}}></div>
                             </div>
                             <span className="w-12 text-right text-sm font-medium text-gray-900">{85 - (i * 20)}%</span>
                         </div>
                     ))}
                 </div>
             </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                 <h3 className="text-lg font-bold text-gray-900 mb-4">Device Usage</h3>
                 <div className="flex items-center justify-center h-48">
                     <div className="text-center">
                        <div className="text-4xl font-bold text-indigo-600">68%</div>
                        <div className="text-sm text-gray-500 mt-1">Desktop</div>
                     </div>
                     <div className="h-full w-px bg-gray-100 mx-6"></div>
                      <div className="text-center">
                        <div className="text-4xl font-bold text-gray-800">32%</div>
                        <div className="text-sm text-gray-500 mt-1">Mobile</div>
                     </div>
                 </div>
             </div>
         </div>
      </main>
    </div>
  );
};
