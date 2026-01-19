import React, { useState, useMemo } from 'react';
import { 
  ArrowDown, 
  ArrowUp, 
  MoreHorizontal, 
  Search, 
  Filter, 
  Download,
  Trash2,
  Edit2,
  Check
} from 'lucide-react';
import { User, SortConfig, FilterConfig, UserStatus } from '../types';
import { cn, formatDate, formatTimeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface DataTableProps {
  data: User[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const DataTable: React.FC<DataTableProps> = ({ data, isLoading }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'lastActive', direction: 'desc' });
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({ search: '', status: 'all' });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Sorting Handler
  const handleSort = (key: keyof User) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Selection Handler
  const toggleSelectAll = () => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map(u => u.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  // Derived Data
  const filteredData = useMemo(() => {
    return data.filter((user) => {
      const matchesSearch = user.name.toLowerCase().includes(filterConfig.search.toLowerCase()) || 
                            user.email.toLowerCase().includes(filterConfig.search.toLowerCase());
      const matchesStatus = filterConfig.status === 'all' || user.status === filterConfig.status;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, filterConfig, sortConfig]);

  const allSelected = filteredData.length > 0 && selectedRows.size === filteredData.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        {/* Bulk Actions (Contextual) */}
        {selectedRows.size > 0 ? (
          <div className="flex items-center space-x-2 bg-indigo-50 text-indigo-900 px-3 py-2 rounded-lg w-full sm:w-auto animate-in fade-in duration-200">
            <span className="text-sm font-semibold">{selectedRows.size} selected</span>
            <div className="h-4 w-px bg-indigo-200 mx-2" />
            <Button size="sm" variant="ghost" className="text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100">
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        ) : (
          /* Search & Filter */
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                className="pl-9 pr-4 py-2 w-full h-9 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={filterConfig.search}
                onChange={(e) => setFilterConfig(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="relative">
                <select 
                    className="h-9 pl-3 pr-8 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={filterConfig.status}
                    onChange={(e) => setFilterConfig(prev => ({...prev, status: e.target.value as UserStatus | 'all'}))}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                </select>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2">
             <Button variant="outline" size="sm" className="hidden sm:flex">
                <Download className="h-4 w-4 mr-2" />
                Export
            </Button>
        </div>
      </div>

      {/* Table Area */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 w-12">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('name')}>
                <div className="flex items-center space-x-1">
                  <span>User</span>
                  {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </div>
              </th>
               <th className="px-4 py-3 cursor-pointer group hidden md:table-cell" onClick={() => handleSort('status')}>
                <div className="flex items-center space-x-1">
                  <span>Status</span>
                  {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </div>
              </th>
              <th className="px-4 py-3 cursor-pointer group hidden md:table-cell" onClick={() => handleSort('role')}>
                <div className="flex items-center space-x-1">
                  <span>Role</span>
                  {sortConfig.key === 'role' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </div>
              </th>
              <th className="px-4 py-3 cursor-pointer group text-right" onClick={() => handleSort('projects')}>
                 <div className="flex items-center justify-end space-x-1">
                  <span>Projects</span>
                  {sortConfig.key === 'projects' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </div>
              </th>
              <th className="px-4 py-3 cursor-pointer group text-right hidden lg:table-cell" onClick={() => handleSort('lastActive')}>
                 <div className="flex items-center justify-end space-x-1">
                  <span>Last Active</span>
                  {sortConfig.key === 'lastActive' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </div>
              </th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
               // Skeleton Rows
               Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-4"><div className="h-4 w-4 bg-gray-200 rounded"></div></td>
                  <td className="px-4 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-full bg-gray-200"></div>
                        <div className="space-y-1">
                            <div className="h-3 w-24 bg-gray-200 rounded"></div>
                            <div className="h-2 w-32 bg-gray-100 rounded"></div>
                        </div>
                      </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell"><div className="h-5 w-16 bg-gray-200 rounded-full"></div></td>
                  <td className="px-4 py-4 hidden md:table-cell"><div className="h-3 w-12 bg-gray-200 rounded"></div></td>
                  <td className="px-4 py-4 text-right"><div className="h-3 w-8 bg-gray-200 rounded ml-auto"></div></td>
                  <td className="px-4 py-4 text-right hidden lg:table-cell"><div className="h-3 w-20 bg-gray-200 rounded ml-auto"></div></td>
                  <td className="px-4 py-4"></td>
                </tr>
               ))
            ) : filteredData.length === 0 ? (
                <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="mx-auto h-12 w-12 text-gray-300 mb-3">
                             <Search className="h-full w-full" />
                        </div>
                        <h3 className="text-gray-900 font-medium">No users found</h3>
                        <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters.</p>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-4"
                            onClick={() => {
                                setFilterConfig({ search: '', status: 'all' });
                            }}
                        >
                            Clear filters
                        </Button>
                    </td>
                </tr>
            ) : (
                filteredData.map((user) => (
                <tr 
                    key={user.id} 
                    className={cn(
                        "group hover:bg-gray-50 transition-colors cursor-pointer", 
                        selectedRows.has(user.id) ? "bg-indigo-50/50 hover:bg-indigo-50/80" : ""
                    )}
                >
                    <td className="px-4 py-3">
                    <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        checked={selectedRows.has(user.id)}
                        onChange={() => toggleSelectRow(user.id)}
                        onClick={(e) => e.stopPropagation()}
                    />
                    </td>
                    <td className="px-4 py-3">
                        <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 flex items-center justify-center font-bold text-xs mr-3 border border-indigo-50">
                                {user.name.charAt(0)}
                            </div>
                            <div>
                                <div className="font-medium text-gray-900">{user.name}</div>
                                <div className="text-xs text-gray-500">{user.email}</div>
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                        <Badge variant={
                            user.status === 'active' ? 'success' : 
                            user.status === 'inactive' ? 'secondary' : 'warning'
                        }>
                            {user.status}
                        </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell capitalize">
                        {user.role}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {user.projects}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs hidden lg:table-cell">
                        {formatTimeAgo(user.lastActive)}
                    </td>
                    <td className="px-4 py-3 text-right relative">
                         <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
                             <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Edit2 className="h-4 w-4 text-gray-500" />
                             </Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4 text-gray-500" />
                             </Button>
                         </div>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

       {/* Pagination (Visual Only for Demo) */}
       <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div>Showing 1 to {Math.min(filteredData.length, 10)} of {filteredData.length} entries</div>
          <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled>Previous</Button>
              <Button variant="outline" size="sm" disabled={filteredData.length <= 10}>Next</Button>
          </div>
       </div>
    </div>
  );
};
