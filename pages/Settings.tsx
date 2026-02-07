import React, { useState, useEffect } from 'react';
import { Key, Database, RefreshCw, CheckCircle, XCircle, Loader2, Cloud, AlertTriangle } from 'lucide-react';
import { getSetting, setSetting, getAllSettings, getAllFubFileSyncStatuses, getDealsWithFubLinks, triggerFubFileSync, getFubPersonSyncStatus, triggerFubPersonSync } from '../lib/database';
import { Button } from '../components/ui/Button';

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

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md px-6 py-4 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure API keys, sync settings, and app preferences</p>
      </header>

      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg border bg-white border-emerald-100 text-emerald-700 text-sm font-medium z-50">
          {toast}
        </div>
      )}

      <main className="p-6 max-w-3xl mx-auto space-y-8">
        {/* API Keys Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            API keys are stored locally in SQLite. They override .env file values.
          </p>

          <div className="space-y-3">
            {API_KEYS.map(config => (
              <div key={config.key} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {keyStatuses[config.key] ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-300" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{config.label}</p>
                      <p className="text-xs text-gray-400">
                        {keyStatuses[config.key] ? 'Configured' : `Not set (fallback: ${config.envFallback})`}
                      </p>
                    </div>
                  </div>

                  {editingKey !== config.key && (
                    <button
                      onClick={() => { setEditingKey(config.key); setInputValue(''); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
        </section>

        {/* FUB Person Sync Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">FUB Person Sync</h2>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Deals</p>
                <p className="text-lg font-bold text-gray-900">{fubPersonSync?.totalDeals ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Synced</p>
                <p className="text-lg font-bold text-emerald-600">{fubPersonSync?.synced ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Errors</p>
                <p className="text-lg font-bold text-gray-900">{fubPersonSync?.errors ?? '-'}</p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Background sync polls FUB every 30 seconds. Deals auto-created from qualifying stages.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFubPersonSyncNow}
                disabled={fubPersonSyncing}
                isLoading={fubPersonSyncing}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Sync Now
              </Button>
            </div>
          </div>
        </section>

        {/* FUB File Sync Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Cloud className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">FUB File Sync</h2>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 font-medium">Linked Deals</p>
                <p className="text-lg font-bold text-gray-900">{fubLinkedDeals.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Synced</p>
                <p className="text-lg font-bold text-emerald-600">
                  {fubSyncStatuses.filter(s => s.last_status === 'synced').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Pending</p>
                <p className="text-lg font-bold text-gray-900">
                  {fubSyncStatuses.filter(s => s.last_status === 'pending' || s.last_status === 'syncing').length}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Mismatched</p>
                <p className="text-lg font-bold text-amber-600">
                  {fubSyncStatuses.filter(s => s.last_status === 'mismatch' || s.last_status === 'error').length}
                </p>
              </div>
            </div>

            {fubSyncStatuses.length > 0 && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium mb-2">Last Sync</p>
                <p className="text-sm text-gray-700">
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
              <div className="flex items-start gap-2 bg-red-50 rounded-md p-3 border border-red-100">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-red-700">
                  {fubSyncStatuses.filter(s => s.last_status === 'error').length} deal(s) have sync errors.
                  {fubSyncStatuses.find(s => s.last_status === 'error')?.last_error && (
                    <span className="block mt-1 text-red-500">
                      Latest: {fubSyncStatuses.find(s => s.last_status === 'error')?.last_error}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Background sync runs every 5 minutes for deals linked to FUB.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFubSyncAll}
                disabled={fubSyncing || fubLinkedDeals.length === 0}
                isLoading={fubSyncing}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Sync All Now
              </Button>
            </div>
          </div>
        </section>

        {/* Database Info */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Database</h2>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600">
              SQLite database with versioned migrations. Data is stored locally in the app's user data directory.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Location: ~/Library/Application Support/&lt;app-name&gt;/tc-dash.db
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
