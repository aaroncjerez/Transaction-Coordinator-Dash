import React, { useState } from 'react';
import { MOCK_CUSTOMERS } from '../../constants';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Search, Filter, Download, Plus, MoreHorizontal, Mail } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Customers: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = MOCK_CUSTOMERS.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Manage your client relationships and accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" /> Add Customer
          </Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  className="pl-9 pr-4 py-2 w-full h-9 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4 text-gray-500" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Total Spent</th>
                  <th className="px-6 py-3">Last Order</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold mr-3">
                          {customer.company.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{customer.company}</div>
                          <div className="text-xs text-gray-500">{customer.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        customer.status === 'active' ? 'success' : 
                        customer.status === 'churned' ? 'destructive' : 'warning'
                      }>
                        {customer.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{customer.spent}</td>
                    <td className="px-6 py-4 text-gray-500">{customer.lastOrder}</td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <Button variant="ghost" size="icon" className="h-8 w-8">
                           <Mail className="h-4 w-4 text-gray-500" />
                         </Button>
                         <Button variant="ghost" size="icon" className="h-8 w-8">
                           <MoreHorizontal className="h-4 w-4 text-gray-500" />
                         </Button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
