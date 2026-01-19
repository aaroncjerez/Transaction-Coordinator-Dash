import React from 'react';
import { MOCK_PROJECTS } from '../../constants';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Plus, Calendar, MoreVertical, Paperclip } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Projects: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 hidden sm:block">Track progress and manage team deliverables.</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_PROJECTS.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <Badge variant={
                  project.status === 'in_progress' ? 'default' : 
                  project.status === 'completed' ? 'success' : 
                  project.status === 'paused' ? 'warning' : 'secondary'
                }>
                  {project.status.replace('_', ' ')}
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mt-2 -mr-2">
                  <MoreVertical className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{project.name}</h3>
              <p className="text-sm text-gray-500 mb-6 flex-1">{project.description}</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Progress</span>
                  <span className="font-medium text-gray-900">{project.completion}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      project.completion === 100 ? "bg-emerald-500" : "bg-primary"
                    )} 
                    style={{ width: `${project.completion}%` }}
                  ></div>
                </div>

                <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {[...Array(Math.min(project.members, 4))].map((_, i) => (
                      <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {String.fromCharCode(65 + i)}
                      </div>
                    ))}
                    {project.members > 4 && (
                      <div className="h-8 w-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                        +{project.members - 4}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center text-xs text-gray-400 gap-3">
                     <div className="flex items-center">
                        <Paperclip className="h-3 w-3 mr-1" /> 2
                     </div>
                     <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" /> {new Date(project.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                     </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
           {/* Add New Placeholder */}
           <button className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-600 transition-all h-full min-h-[300px]">
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-indigo-100">
                <Plus className="h-6 w-6" />
              </div>
              <span className="font-medium">Create New Project</span>
           </button>
        </div>
      </main>
    </div>
  );
};
