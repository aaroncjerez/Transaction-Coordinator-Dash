import React, { useState, useEffect } from 'react';
import { Key, Database, RefreshCw, CheckCircle, XCircle, Cloud, AlertTriangle } from 'lucide-react';
import { getSetting, setSetting, getAllSettings, getAllFubFileSyncStatuses, getDealsWithFubLinks, triggerFubFileSync, getFubPersonSyncStatus, triggerFubPersonSync } from '../lib/database';
import { Button } from '../components/ui/Button';
import { TopBar } from '../components/TopBar';
import { useOpenCommandPalette } from '../components/Layout';
import { cn } from '../lib/utils';

interface ApiKeyConfig {
  key: string;
  label: string;
  placeholder: string;
  envFallback: string;
}

const API_KEYS: ApiKeyConfig[] = [
  { key: 'fub_api_key', label: 'Follow Up Boss API Key', placeholder: 'fub_...', envFallback: 'FUB_API_KEY' },
  { key: 'fub_account_name', label: 'FUB Account Name', placeholder: 'jerezland', envFallback: 'FUB_ACCOUNT_NAME' },
  { key: 'anthropic_api_key', label: 'Anthropic API Key', placeholder: 'sk-ant-...', envFallback: 'ANTHROPIC_API_KEY' },
];

export const Settings: React.FC = () => {
  const openCommandPalette = useOpenCommandPalette();
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [keyStatuses, setKeyStatuses] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fubSyncStatuses, setFubSyncStatuses] = useState<any[]>([]);
  const [fubLinkedDeals, setFubLinkedDeals] = useState<any[]>([]);
  const [fubSyncing, setFubSyncing] = useState(false);
  const [fubPersonSync, setFubPersonSync] = useState<any>(null);
  const [fubPersonSyncing, setFubPersonSyncing] = useState(false);

  useEffect(() => {
    loadSettings();
    loadFubStatus();
    loadFubPersonSyncStatus();
    const interval = setInterval(() => { loadFubStatus(); loadFubPersonSyncStatus(); }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const allSettings = await getAllSettings();
      const statuses: Record<string, boolean> = {};
      for (const s of allSettings) {
        statuses[s.key] = s.hasValue;
      }
      setKeyStatuses(statuses);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  };

  const loadFubPersonSyncStatus = async () => {
    try {
      const status = await getFubPersonSyncStatus();
      setFubPersonSync(status);
    } catch (e) {
      console.error('Failed to load FUB person sync status:', e);
    }
  };

  const handleFubPersonSyncNow = async () => {
    setFubPersonSyncing(true);
    try {
      const result = await triggerFubPersonSync();
      await loadFubPersonSyncStatus();
      setToast(`FUB person sync: ${result.newDeals} new, ${result.updatedDeals} updated`);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      console.error('FUB person sync failed:', e);
      setToast('FUB person sync failed');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setFubPersonSyncing(false);
    }
  };

  const loadFubStatus = async () => {
    try {
      const [statuses, deals] = await Promise.all([
        getAllFubFileSyncStatuses(),
        getDealsWithFubLinks(),
      ]);
      setFubSyncStatuses(statuses || []);
      setFubLinkedDeals(deals || []);
    } catch (e) {
      console.error('Failed to load FUB status:', e);
    }
  };

  const handleFubSyncAll = async () => {
    setFubSyncing(true);
    try {
      await triggerFubFileSync();
      await loadFubStatus();
      setToast('FUB file sync triggered');
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      console.error('FUB sync failed:', e);
      setToast('FUB sync failed');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setFubSyncing(false);
    }
  };

  const handleSave = async (settingKey: string) => {
    if (!inputValue.trim()) return;
    setSaving(true);
    try {
      await setSetting(settingKey, inputValue.trim());
      setKeyStatuses(prev => ({ ...prev, [settingKey]: true }));
      setEditingKey(null);
      setInputValue('');
      setToast('API key saved successfully');
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      console.error('Failed to save setting:', e);
      setToast('Failed to save API key');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ---- Section wrapper ----
  const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-gray-500">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  );

  // ---- Stat box ----
  const StatBox: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
    <div>
      <p className="text-micro text-gray-500 font-medium">{label}</p>
      <p className={cn('text-lg font-bold', color || 'text-gray-900')}>{value}</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* TopBar */}
      <TopBar
        title="Settings"
        subtitle="API keys, sync, and preferences"
        onSearchClick={openCommandPalette}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-md border bg-white border-emerald-200 text-emerald-700 text-sm font-medium z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            {toast}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-8">
          {/* API Keys Section */}
          <Section icon={<Key size={16} />} title="API Keys">
            <p className="text-caption text-gray-500 mb-3">
              API keys are stored locally in SQLite. They override .env file values.
            </p>
            <div className="space-y-2">
              {API_KEYS.map(config => (
                <div key={config.key} className="bg-white rounded-card border border-gray-200 shadow-xs p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {keyStatuses[config.key] ? (
                        <CheckCircle size={14} className="text-emerald-500" />
                      ) : (
                        <XCircle size={14} className="text-gray-300" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{config.label}</p>
                        <p className="text-micro text-gray-400">
                          {keyStatuses[config.key] ? 'Configured' : `Not set (fallback: ${config.envFallback})`}
                        </p>
                      </div>
                    </div>

                    {editingKey !== config.key && (
                      <button
                        onClick={() => { setEditingKey(config.key); setInputValue(''); }}
                        className="text-caption text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        {keyStatuses[config.key] ? 'Update' : 'Set'}
                      </button>
                    )}
                  </div>

                  {editingKey === config.key && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="password"
                        autoFocus
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-subtle focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                        placeholder={config.placeholder}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { setEditingKey(null); setInputValue(''); } }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSave(config.key)}
                        disabled={!inputValue.trim() || saving}
                        isLoading={saving}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingKey(null); setInputValue(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* FUB Person Sync Section */}
          <Section icon={<RefreshCw size={16} />} title="FUB Person Sync">
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4 space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <StatBox label="Total Deals" value={fubPersonSync?.totalDeals ?? '\u2014'} />
                <StatBox label="Synced" value={fubPersonSync?.synced ?? '\u2014'} color="text-emerald-600" />
                <StatBox label="Errors" value={fubPersonSync?.errors ?? '\u2014'} />
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-gray-100">
                <p className="text-micro text-gray-400">
                  Background sync polls FUB every 30 seconds. Deals auto-created from qualifying stages.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFubPersonSyncNow}
                  disabled={fubPersonSyncing}
                  isLoading={fubPersonSyncing}
                >
                  <RefreshCw size={12} className="mr-1.5" />
                  Sync Now
                </Button>
              </div>
            </div>
          </Section>

          {/* FUB File Sync Section */}
          <Section icon={<Cloud size={16} />} title="FUB File Sync">
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <StatBox label="Linked Deals" value={fubLinkedDeals.length} />
                <StatBox label="Synced" value={fubSyncStatuses.filter(s => s.last_status === 'synced').length} color="text-emerald-600" />
                <StatBox label="Pending" value={fubSyncStatuses.filter(s => s.last_status === 'pending' || s.last_status === 'syncing').length} />
                <StatBox label="Mismatched" value={fubSyncStatuses.filter(s => s.last_status === 'mismatch' || s.last_status === 'error').length} color="text-amber-600" />
              </div>

              {fubSyncStatuses.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-micro text-gray-500 font-medium mb-1">Last Sync</p>
                  <p className="text-caption text-gray-700">
                    {(() => {
                      const lastSynced = fubSyncStatuses
                        .filter(s => s.last_synced_at)
                        .sort((a: any, b: any) => (b.last_synced_at || '').localeCompare(a.last_synced_at || ''))[0];
                      return lastSynced?.last_synced_at
                        ? new Date(lastSynced.last_synced_at).toLocaleString()
                        : 'Never';
                    })()}
                  </p>
                </div>
              )}

              {fubSyncStatuses.some(s => s.last_status === 'error') && (
                <div className="flex items-start gap-2 bg-red-50 rounded-md p-3 border border-red-200">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="text-micro text-red-700">
                    {fubSyncStatuses.filter(s => s.last_status === 'error').length} deal(s) have sync errors.
                    {fubSyncStatuses.find(s => s.last_status === 'error')?.last_error && (
                      <span className="block mt-1 text-red-500">
                        Latest: {fubSyncStatuses.find(s => s.last_status === 'error')?.last_error}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between border-t border-gray-100">
                <p className="text-micro text-gray-400">
                  Background sync runs every 5 minutes for deals linked to FUB.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFubSyncAll}
                  disabled={fubSyncing || fubLinkedDeals.length === 0}
                  isLoading={fubSyncing}
                >
                  <RefreshCw size={12} className="mr-1.5" />
                  Sync All Now
                </Button>
              </div>
            </div>
          </Section>

          {/* Database Info */}
          <Section icon={<Database size={16} />} title="Database">
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
              <p className="text-caption text-gray-600">
                SQLite database with versioned migrations. Data is stored locally in the app's user data directory.
              </p>
              <p className="text-micro text-gray-400 mt-2">
                Location: ~/Library/Application Support/&lt;app-name&gt;/tc-dash.db
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};
