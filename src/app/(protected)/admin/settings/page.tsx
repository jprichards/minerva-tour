'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { ArrowLeft, Save, Image, ExternalLink, Hash, Eye, EyeOff, CheckCircle, XCircle, Loader2, MessageSquare, Bot } from 'lucide-react';
import type { SlackConfig, SlackEventType, AIConfig } from '@/types/database';

const SLACK_EVENT_LABELS: Record<SlackEventType, string> = {
  tee_time: 'New Tee Times',
  score_in_progress: 'In-Progress Scores',
  round_complete: 'Completed Rounds',
  score_edit: 'Score Edits',
  retroactive: 'Retroactive Scores',
  feedback_submitted: 'Feedback Submissions',
};

const SCORE_EVENT_TYPES: SlackEventType[] = ['tee_time', 'score_in_progress', 'round_complete', 'score_edit', 'retroactive'];

const DEFAULT_SLACK_EVENTS: Record<SlackEventType, boolean> = {
  tee_time: true,
  score_in_progress: true,
  round_complete: true,
  score_edit: true,
  retroactive: true,
  feedback_submitted: true,
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
  const [feedbackChannelId, setFeedbackChannelId] = useState('');
  const [feedbackChannelName, setFeedbackChannelName] = useState('');
  const [recapChannelId, setRecapChannelId] = useState('');
  const [recapChannelName, setRecapChannelName] = useState('');
  const [recapImagesInThread, setRecapImagesInThread] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [slackStatus, setSlackStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // AI config state
  const [aiEndpoint, setAiEndpoint] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [aiMaxTokens, setAiMaxTokens] = useState(700);
  const [showAiKey, setShowAiKey] = useState(false);

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
        if (config.feedback_channel_id) setFeedbackChannelId(config.feedback_channel_id);
        if (config.feedback_channel_name) setFeedbackChannelName(config.feedback_channel_name);
        if (config.recap_channel_id) setRecapChannelId(config.recap_channel_id);
        if (config.recap_channel_name) setRecapChannelName(config.recap_channel_name);
        if (config.recap_images_in_thread) setRecapImagesInThread(config.recap_images_in_thread);
        if (config.events) setSlackEvents({ ...DEFAULT_SLACK_EVENTS, ...config.events });
        if (config.bot_token && config.channel_id) setSlackStatus('connected');
      }

      // Fetch AI config (may not exist yet)
      const { data: aiData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_config')
        .maybeSingle();
      if (aiData?.value) {
        const config = aiData.value as unknown as AIConfig;
        if (config.api_endpoint) setAiEndpoint(config.api_endpoint);
        if (config.api_key) setAiApiKey(config.api_key);
        if (config.model) setAiModel(config.model);
        if (config.system_prompt) setAiSystemPrompt(config.system_prompt);
        if (config.max_tokens) setAiMaxTokens(config.max_tokens);
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

  const handleFeedbackChannelChange = (channelId: string) => {
    setFeedbackChannelId(channelId);
    const ch = slackChannels.find((c) => c.id === channelId);
    if (ch) setFeedbackChannelName('#' + ch.name);
  };

  const handleRecapChannelChange = (channelId: string) => {
    setRecapChannelId(channelId);
    const ch = slackChannels.find((c) => c.id === channelId);
    if (ch) setRecapChannelName('#' + ch.name);
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
        feedback_channel_id: feedbackChannelId || undefined,
        feedback_channel_name: feedbackChannelName || undefined,
        recap_channel_id: recapChannelId || undefined,
        recap_channel_name: recapChannelName || undefined,
        recap_images_in_thread: recapImagesInThread,
      };
      await supabase.from('app_settings').upsert({
        key: 'slack_config',
        value: slackConfig as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });

      // Save AI config
      if (aiEndpoint || aiApiKey || aiModel) {
        const aiConfig: AIConfig = {
          api_endpoint: aiEndpoint,
          api_key: aiApiKey,
          model: aiModel,
          system_prompt: aiSystemPrompt,
          max_tokens: aiMaxTokens,
        };
        await supabase.from('app_settings').upsert({
          key: 'ai_config',
          value: aiConfig as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        });
      }

      logAuditEvent('update_settings', 'app_settings', undefined, {
        google_photos_url: googlePhotosUrl,
        rules_url: rulesUrl,
        slack_channel: slackChannelName,
        slack_events: slackEvents,
        ai_model: aiModel,
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

            {/* Score Event Toggles */}
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Score &amp; Tee Time Notifications</p>
              <div className="space-y-2">
                {SCORE_EVENT_TYPES.map((eventType) => (
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

            {/* Feedback Notifications */}
            <div className="border-t border-[var(--border-light)] pt-5 space-y-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Feedback Notifications</p>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-[var(--text-primary)]">{SLACK_EVENT_LABELS.feedback_submitted}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={slackEvents.feedback_submitted}
                  onClick={() => toggleSlackEvent('feedback_submitted')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    slackEvents.feedback_submitted ? 'bg-minerva-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    slackEvents.feedback_submitted ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </label>

              {slackChannels.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Feedback Channel</label>
                  <select
                    value={feedbackChannelId}
                    onChange={(e) => handleFeedbackChannelChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
                  >
                    <option value="">Same as score channel</option>
                    {slackChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>#{ch.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--text-faint)] mt-1">
                    Choose a separate channel for feedback, or leave as default to use the score channel.
                  </p>
                </div>
              )}

              {slackChannels.length === 0 && feedbackChannelName && (
                <div className="text-xs text-[var(--text-muted)]">
                  Feedback channel: <span className="font-medium">{feedbackChannelName}</span>
                </div>
              )}
            </div>

            {/* Recap Channel */}
            <div className="border-t border-[var(--border-light)] pt-5 space-y-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Event Recap Channel</p>
              <p className="text-xs text-[var(--text-faint)]">
                Where AI-generated event recaps with standings images are posted. Defaults to the main score channel if not set.
              </p>

              {slackChannels.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Recap Channel</label>
                  <select
                    value={recapChannelId}
                    onChange={(e) => handleRecapChannelChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
                  >
                    <option value="">Same as score channel</option>
                    {slackChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>#{ch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {slackChannels.length === 0 && recapChannelName && (
                <div className="text-xs text-[var(--text-muted)]">
                  Recap channel: <span className="font-medium">{recapChannelName}</span>
                </div>
              )}

              <label className="flex items-center justify-between cursor-pointer pt-2">
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">Post images in thread</span>
                  <p className="text-xs text-[var(--text-faint)]">Standings images go in a thread reply instead of inline, keeping the channel cleaner.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={recapImagesInThread}
                  onClick={() => setRecapImagesInThread(!recapImagesInThread)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    recapImagesInThread ? 'bg-minerva-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    recapImagesInThread ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </label>
            </div>
          </div>

          {/* AI Configuration */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-orange-600" />
              <label className="text-sm font-medium text-[var(--text-primary)]">AI Recap Configuration</label>
            </div>

            <p className="text-xs text-[var(--text-faint)]">
              Configure an OpenAI-compatible API for generating event recaps. Grok models are recommended for this prompt&apos;s tone &mdash; try grok-3 first.
            </p>

            {/* API Endpoint */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">API Endpoint</label>
              <input
                type="url"
                value={aiEndpoint}
                onChange={(e) => setAiEndpoint(e.target.value)}
                placeholder="https://api.x.ai/v1/chat/completions"
                className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-minerva-500"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showAiKey ? 'text' : 'password'}
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="xai-... or sk-..."
                  className="w-full px-3 py-2.5 pr-10 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-minerva-500"
                />
                <button
                  type="button"
                  onClick={() => setShowAiKey(!showAiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Model</label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="grok-3"
                className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
              />
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Max Tokens</label>
              <input
                type="number"
                value={aiMaxTokens}
                onChange={(e) => setAiMaxTokens(parseInt(e.target.value) || 700)}
                min={100}
                max={4000}
                className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500"
              />
              <p className="text-xs text-[var(--text-faint)] mt-1">
                Controls max recap length. 700 = ~300-450 words.
              </p>
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">System Prompt</label>
              <textarea
                value={aiSystemPrompt}
                onChange={(e) => setAiSystemPrompt(e.target.value)}
                rows={8}
                placeholder="Paste your system prompt here..."
                className="w-full px-3 py-2.5 bg-[var(--bg-page)] border border-[var(--border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-minerva-500 resize-y"
              />
              <p className="text-xs text-[var(--text-faint)] mt-1">
                The AI personality and instructions. This is sent as the system message with every recap generation.
              </p>
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
