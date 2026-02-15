'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Save, Image, ExternalLink } from 'lucide-react';

export default function AdminSettingsPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [googlePhotosUrl, setGooglePhotosUrl] = useState('');
  const [rulesUrl, setRulesUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: photosData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'google_photos_url')
        .single();
      if (photosData?.value?.url) setGooglePhotosUrl(photosData.value.url);

      const { data: rulesData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'rules_url')
        .single();
      if (rulesData?.value?.url) setRulesUrl(rulesData.value.url);

      setLoading(false);
    };
    fetchSettings();
  }, [supabase]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('app_settings').upsert({
        key: 'google_photos_url',
        value: { url: googlePhotosUrl },
        updated_at: new Date().toISOString(),
      });
      await supabase.from('app_settings').upsert({
        key: 'rules_url',
        value: { url: rulesUrl },
        updated_at: new Date().toISOString(),
      });

      logAuditEvent('update_settings', 'app_settings', undefined, {
        google_photos_url: googlePhotosUrl,
        rules_url: rulesUrl,
      });

      showToast('Settings saved!', 'success');
    } catch (e) {
      showToast('Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">App Settings</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-green-600" />
              <label className="text-sm font-medium text-gray-900">Google Photos Album URL</label>
            </div>
            <input
              type="url"
              value={googlePhotosUrl}
              onChange={(e) => setGooglePhotosUrl(e.target.value)}
              placeholder="https://photos.google.com/share/..."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-400">
              This link will appear on the home page for all members.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-blue-600" />
              <label className="text-sm font-medium text-gray-900">Tour Rules URL</label>
            </div>
            <input
              type="url"
              value={rulesUrl}
              onChange={(e) => setRulesUrl(e.target.value)}
              placeholder="https://minervatour.wordpress.com/rules/"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-400">
              Link to the tour rules page.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-emerald-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
