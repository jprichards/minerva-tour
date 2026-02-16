'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Save, Image, ExternalLink, Hash, Eye, EyeOff, CheckCircle, XCircle, Loader2, MessageSquare } from 'lucide-react';
import type { SlackConfig, SlackEventType } from '@/types/database';

const SLACK_EVENT_LABELS: Record<SlackEventType, string> = {
  tee_time: 'New Tee Times',
  score_in_progress: 'In-Progress Scores',
  round_complete: 'Completed Rounds',
  score_edit: 'Score Edits',
  retroactive: 'Retroactive Scores',
};

const DEFAULT_SLACK_EVENTS: Record<SlackEventType, boolean> = {
  tee_time: true,
  score_in_progress: true,
  round_complete: true,
  score_edit: true,
  retroactive: true,
};

export default function AdminSettingsPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [googlePhotosUrl, setGooglePhotosUrl] = useState('');
  const [rulesUrl, setRulesUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Slack config state
  const [slackBotToken, setSlackBotToken] = useState('');
  const [slackChannelId, setSlackChannelId] = useState('');
  const [slackChannelName, setSlackChannelName] = useState('');
  const [slackEvents, setSlackEvents] = useState<Record<SlackEventType, boolean>>(DEFAULT_SLACK_EVENTS);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [showToken, setShowToken] = useState(false);
  const [slackStatus, setSlackStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

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

      // Fetch Slack config
      const { data: slackData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'slack_config')
        .single();
      if (slackData?.value) {
        const config = slackData.value as unknown as SlackConfig;
        if (config.bot_token) setSlackBotToken(config.bot_token);
        if (config.channel_id) setSlackChannelId(config.channel_id);
        if (config.channel_name) setSlackChannelName(config.channel_name);
        if (config.events) setSlackEvents({ ...DEFAULT_SLACK_EVENTS, ...config.events });
        if (config.bot_token && config.channel_id) setSlackStatus('connected');
      }

      setLoading(false);
    };
    fetchSettings();
  }, [supabase]);

  const handleLoadChannels = async () => {
    if (!slackBotToken.trim()) {
      showToast('Enter a Bot Token first.', 'error');
      return;
    }
    setLoadingChannels(true);
    try {
      const res = await fetch('/api/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: slackBotToken }),
      });
      const data = await res.json();
      if (res.ok && data.channels) {
        setSlackChannels(data.channels);
        setSlackStatus('connected');
        if (data.channels.length > 0 && !slackChannelId) {
          setSlackChannelId(data.channels[0].id);
          setSlackChannelName('#' + data.channels[0].name);
        }
      } else {
        setSlackStatus('error');
        showToast(data.error || 'Failed to load channels.', 'error');
      }
    } catch {
      setSlackStatus('error');
      showToast('Failed to connect to Slack.', 'error');
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleTestConnection = async () => {
    if (!slackBotToken || !slackChannelId) {
      showToast('Configure token and channel first.', 'error');
      return;
    }
    setTestingConnection(true);
    try {
      const res = await fetch('/api/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: slackBotToken, channel_id: slackChannelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSlackStatus('connected');
        showToast('Test message sent to Slack!', 'success');
      } else {
        setSlackStatus('error');
        showToast(data.error || 'Test failed.', 'error');
      }
    } catch {
      setSlackStatus('error');
      showToast('Failed to send test message.', 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleChannelChange = (channelId: string) => {
    setSlackChannelId(channelId);
    const ch = slackChannels.find((c) => c.id === channelId);
    if (ch) setSlackChannelName('#' + ch.name);
  };

  const toggleSlackEvent = (eventType: SlackEventType) => {
    setSlackEvents((prev) => ({ ...prev, [eventType]: !prev[eventType] }));
  };

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

      // Save Slack config
      const slackConfig: SlackConfig = {
        bot_token: slackBotToken,
        channel_id: slackChannelId,
        channel_name: slackChannelName,
        events: slackEvents,
      };
      await supabase.from('app_settings').upsert({
        key: 'slack_config',
        value: slackConfig as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });

      logAuditEvent('update_settings', 'app_settings', undefined, {
        google_photos_url: googlePhotosUrl,
        rules_url: rulesUrl,
        slack_channel: slackChannelName,
        slack_events: slackEvents,
      });

      showToast('Settings saved!', 'success');
    } catch {
      showToast('Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">App Settings</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          <div className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          <div className="h-32 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Google Photos URL */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-green-600" />
              <label className="text-sm font-medium text-[var(--text-primary)]">Google Photos Album URL</label>
            </div>
            <input
              type="url"
              value={googlePhotosUrl}
              onChange={(e) => setGooglePhotosUrl(e.target.value)}
              placeholder="https://photos.google.com/share/..."
              className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
            <p className="text-xs text-[var(--text-faint)]">
              This link will appear on the home page for all members.
            </p>
          </div>

          {/* Tour Rules URL */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-blue-600" />
              <label className="text-sm font-medium text-[var(--text-primary)]">Tour Rules URL</label>
            </div>
            <input
              type="url"
              value={rulesUrl}
              onChange={(e) => setRulesUrl(e.target.value)}
              placeholder="https://minervatour.wordpress.com/rules/"
              className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
            />
            <p className="text-xs text-[var(--text-faint)]">
              Link to the tour rules page.
            </p>
          </div>

          {/* Slack Integration */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                <label className="text-sm font-medium text-[var(--text-primary)]">Slack Integration</label>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                slackStatus === 'connected' ? 'bg-green-100 text-green-700' :
                slackStatus === 'error' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {slackStatus === 'connected' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                {slackStatus === 'error' && <XCircle className="w-3 h-3 inline mr-1" />}
                {slackStatus === 'connected' ? 'Connected' : slackStatus === 'error' ? 'Error' : 'Not configured'}
              </span>
            </div>

            <p className="text-xs text-[var(--text-faint)]">
              Post score updates, tee times, and round results to a Slack channel. Create a Slack App at{' '}
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-minerva-600 underline">
                api.slack.com/apps
              </a>
              , install it to your workspace, and paste the Bot User OAuth Token below.
            </p>

            {/* Bot Token */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Bot Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={slackBotToken}
                  onChange={(e) => {
                    setSlackBotToken(e.target.value);
                    setSlackStatus('disconnected');
                    setSlackChannels([]);
                  }}
                  placeholder="xoxb-..."
                  className="w-full px-3 py-2.5 pr-10 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-minerva-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Load Channels Button */}
            <button
              type="button"
              onClick={handleLoadChannels}
              disabled={loadingChannels || !slackBotToken.trim()}
              className="w-full flex items-center justify-center gap-2 py-2 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition-colors"
            >
              {loadingChannels ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Hash className="w-4 h-4" />
              )}
              {loadingChannels ? 'Loading channels...' : 'Load Channels'}
            </button>

            {/* Channel Selector */}
            {slackChannels.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Channel</label>
                <select
                  value={slackChannelId}
                  onChange={(e) => handleChannelChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
                >
                  {slackChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Already configured channel (no channels loaded yet) */}
            {slackChannels.length === 0 && slackChannelName && slackStatus === 'connected' && (
              <div className="text-xs text-[var(--text-muted)]">
                Current channel: <span className="font-medium">{slackChannelName}</span>
              </div>
            )}

            {/* Test Connection */}
            {slackBotToken && slackChannelId && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="w-full flex items-center justify-center gap-2 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                {testingConnection ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
                {testingConnection ? 'Sending...' : 'Send Test Message'}
              </button>
            )}

            {/* Event Toggles */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Notify on</label>
              <div className="space-y-2">
                {(Object.keys(SLACK_EVENT_LABELS) as SlackEventType[]).map((eventType) => (
                  <label key={eventType} className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-[var(--text-primary)]">{SLACK_EVENT_LABELS[eventType]}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={slackEvents[eventType]}
                      onClick={() => toggleSlackEvent(eventType)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        slackEvents[eventType] ? 'bg-minerva-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        slackEvents[eventType] ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-minerva-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-minerva-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
