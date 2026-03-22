"use client";

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCalendarStore } from '@/stores/calendar-store';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/stores/toast-store';
import { SettingsSection } from './settings-section';
import { Plus, Pencil, Trash2, Check, X, Calendar as CalendarIcon, Copy, Link, Upload, Globe, RefreshCw, Eraser, Users, UserPlus, ChevronDown, Share2, LogOut, RotateCcw } from 'lucide-react';
import type { Calendar } from '@/lib/jmap/types';
import { cn, formatDateTime } from '@/lib/utils';
import { CalendarRights } from '@/lib/jmap/types';
import { IJMAPClient } from '@/lib/jmap/client-interface';
import { ICalImportModal } from '@/components/calendar/ical-import-modal';
import { ICalSubscriptionModal } from '@/components/calendar/ical-subscription-modal';
import { useSettingsStore } from '@/stores/settings-store';

const CALENDAR_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#6366f1", // indigo
  "#a855f7", // purple
  "#e11d48", // rose
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#d946ef", // fuchsia
];

function CalendarColorPicker({
  value,
  onChange,
  allowCustom,
}: {
  value: string;
  onChange: (color: string) => void;
  allowCustom?: boolean;
}) {
  const selectedIsPreset = CALENDAR_COLORS.includes(value);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CALENDAR_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "w-6 h-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === color && "ring-2 ring-offset-2 ring-offset-background ring-foreground"
          )}
          style={{ backgroundColor: color }}
          aria-label={color}
        />
      ))}
      {allowCustom && (
        <label
          className={cn(
            "relative w-6 h-6 rounded-full cursor-pointer transition-transform hover:scale-110 overflow-hidden border-2 border-dashed border-muted-foreground/40",
            !selectedIsPreset && value && "ring-2 ring-offset-2 ring-offset-background ring-foreground"
          )}
          style={!selectedIsPreset && value ? { backgroundColor: value } : undefined}
          title="Custom color"
        >
          <input
            type="color"
            value={value || "#3b82f6"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          {(selectedIsPreset || !value) && (
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs font-bold">+</span>
          )}
        </label>
      )}
    </div>
  );
}

type SharePermission = 'read_only' | 'can_edit';

const SHARE_PERMISSION_RIGHTS: Record<SharePermission, CalendarRights> = {
  read_only: {
    mayReadFreeBusy: true, mayReadItems: true, mayWriteAll: false,
    mayWriteOwn: false, mayUpdatePrivate: false, mayRSVP: true,
    mayDelete: false,
  },
  can_edit: {
    mayReadFreeBusy: true, mayReadItems: true, mayWriteAll: true,
    mayWriteOwn: true, mayUpdatePrivate: true, mayRSVP: true,
    mayDelete: false,
  },
};

function inferPermission(rights: CalendarRights): SharePermission {
  if (rights.mayWriteAll) return 'can_edit';
  return 'read_only';
}

function CalendarSharePanel({
  calendarId,
  shareWith,
  onUpdate,
  client,
}: {
  calendarId: string;
  shareWith: Record<string, CalendarRights> | null;
  onUpdate: (calendarId: string, shareWith: Record<string, CalendarRights>) => Promise<void>;
  client: IJMAPClient;
}) {
  const t = useTranslations('calendar.management');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newPermission, setNewPermission] = useState<SharePermission>('can_edit');
  const [isAdding, setIsAdding] = useState(false);
  const [loadingPrincipal, setLoadingPrincipal] = useState<string | null>(null);
  const [principalNames, setPrincipalNames] = useState<Record<string, { name: string; email: string | null }>>({});

  const shares = shareWith || {};

  useEffect(() => {
    const ids = Object.keys(shares);
    if (ids.length === 0) return;
    client.resolvePrincipals(ids).then(setPrincipalNames);
  }, [shareWith]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    const identifier = newIdentifier.trim();
    if (!identifier) return;
    setIsAdding(true);
    try {
      const resolvedId = await client.lookupAccountIdByIdentifier(identifier);
      const accountId = resolvedId ?? identifier;
      const updated = { ...shares, [accountId]: SHARE_PERMISSION_RIGHTS[newPermission] };
      await onUpdate(calendarId, updated);
      setNewIdentifier('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (principal: string) => {
    setLoadingPrincipal(principal);
    try {
      const updated = { ...shares };
      delete updated[principal];
      await onUpdate(calendarId, updated);
    } finally {
      setLoadingPrincipal(null);
    }
  };

  const handleChangePermission = async (principal: string, permission: SharePermission) => {
    setLoadingPrincipal(principal);
    try {
      const updated = { ...shares, [principal]: SHARE_PERMISSION_RIGHTS[permission] };
      await onUpdate(calendarId, updated);
    } finally {
      setLoadingPrincipal(null);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-md border border-border bg-muted/30 space-y-3">
      {/* Current shares */}
      {Object.keys(shares).length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('share_no_shares')}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('share_with_label')}</p>
          {Object.entries(shares).map(([principal, rights]) => {
            const perm = inferPermission(rights);
            const isLoading = loadingPrincipal === principal;
            const resolved = principalNames[principal];
            const displayName = resolved?.name || principal;
            const displayEmail = resolved?.email;
            return (
              <div key={principal} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm block truncate">{displayName}</span>
                  {displayEmail && displayEmail !== displayName && (
                    <span className="text-xs text-muted-foreground block truncate">{displayEmail}</span>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={perm}
                    onChange={(e) => handleChangePermission(principal, e.target.value as SharePermission)}
                    disabled={isLoading}
                    className="text-xs py-1 pl-2 pr-6 rounded border border-border bg-background text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="read_only">{t('share_read_only')}</option>
                    <option value="can_edit">{t('share_can_edit')}</option>
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(principal)}
                  disabled={isLoading}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  title={t('share_remove')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new share */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <UserPlus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={newIdentifier}
          onChange={(e) => setNewIdentifier(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') setNewIdentifier('');
          }}
          placeholder={t('share_email_placeholder')}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={isAdding}
        />
        <div className="relative">
          <select
            value={newPermission}
            onChange={(e) => setNewPermission(e.target.value as SharePermission)}
            disabled={isAdding}
            className="text-xs py-1 pl-2 pr-6 rounded border border-border bg-background text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="read_only">{t('share_read_only')}</option>
            <option value="can_edit">{t('share_can_edit')}</option>
            <option value="full_access">{t('share_full_access')}</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAdding || !newIdentifier.trim()}
          className="px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {t('share_add')}
        </button>
      </div>
    </div>
  );
}

function CalendarEditForm({
  initial,
  onSave,
  onCancel,
  isLoading,
}: {
  initial?: { name: string; color: string };
  onSave: (data: { name: string; color: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const t = useTranslations('calendar.management');
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || '#3b82f6');

  const isValid = name.trim().length > 0;

  return (
    <div className="space-y-3 p-3 rounded-md border border-primary/30 bg-accent/30">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isValid) onSave({ name: name.trim(), color });
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={t('name_placeholder')}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
          disabled={isLoading}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('color')}
        </label>
        <CalendarColorPicker value={color} onChange={setColor} allowCustom />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => isValid && onSave({ name: name.trim(), color })}
          disabled={isLoading || !isValid}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {initial ? t('save') : t('create')}
        </button>
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs bg-muted text-foreground rounded-md hover:bg-accent"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

export { CalendarColorPicker, CALENDAR_COLORS };

export function CalendarManagementSettings() {
  const t = useTranslations('calendar.management');
  const { client, serverUrl, username } = useAuthStore();
  const { calendars, updateCalendar, createCalendar, removeCalendar, dropCalendar, clearCalendarEvents, fetchCalendars, icalSubscriptions, removeICalSubscription, refreshICalSubscription, isSubscriptionCalendar } = useCalendarStore();

  const [discoveredCalDavUrls, setDiscoveredCalDavUrls] = useState<Record<string, string | null>>({});
  const [wellKnownCalDavUrl, setWellKnownCalDavUrl] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null);
  const [refreshingSubId, setRefreshingSubId] = useState<string | null>(null);
  const [sharingCalendarId, setSharingCalendarId] = useState<string | null>(null);
  const [unsubscribingId, setUnsubscribingId] = useState<string | null>(null);
  const [showUnsubscribed, setShowUnsubscribed] = useState(false);
  const [unsubscribedCalendars, setUnsubscribedCalendars] = useState<Calendar[]>([]);
  const [loadingUnsubscribed, setLoadingUnsubscribed] = useState(false);
  const [resubscribingId, setResubscribingId] = useState<string | null>(null);
  const tImport = useTranslations('calendar.import');
  const tSub = useTranslations('calendar.subscription');
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Load calendars if not yet loaded
  useEffect(() => {
    if (client && calendars.length === 0) {
      fetchCalendars(client);
    }
  }, [client, calendars.length, fetchCalendars]);

  useEffect(() => {
    if (!client || !serverUrl || !username) {
      setDiscoveredCalDavUrls({});
      setWellKnownCalDavUrl(null);
      return;
    }

    const primaryKey = username;
    const accounts = new Map<string, string[]>();
    accounts.set(primaryKey, [username]);

    for (const calendar of calendars) {
      if (!calendar.isShared) continue;
      const key = calendar.accountId || calendar.accountName || calendar.id;
      const candidates = accounts.get(key) || [];
      if (calendar.accountId) candidates.push(calendar.accountId);
      if (calendar.accountName) candidates.push(calendar.accountName);
      accounts.set(key, candidates);
    }

    const controller = new AbortController();

    fetch('/api/caldav/discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': client.getAuthHeader(),
        'X-JMAP-Server-URL': serverUrl,
        'X-JMAP-Username': username,
      },
      body: JSON.stringify({
        accounts: Array.from(accounts.entries()).map(([key, candidates]) => ({ key, candidates })),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`CalDAV discovery failed: ${response.status}`);
        return response.json() as Promise<{
          wellKnownUrl?: string;
          accounts?: Record<string, { url: string | null }>;
        }>;
      })
      .then((payload) => {
        setWellKnownCalDavUrl(payload.wellKnownUrl || null);
        const next: Record<string, string | null> = {};
        for (const [key, value] of Object.entries(payload.accounts || {})) {
          next[key] = value?.url || null;
        }
        setDiscoveredCalDavUrls(next);
      })
      .catch(() => {
        const fallbackWellKnown = new URL('/.well-known/caldav', serverUrl).toString();
        setDiscoveredCalDavUrls({});
        setWellKnownCalDavUrl(fallbackWellKnown);
      });

    return () => controller.abort();
  }, [client, calendars, serverUrl, username]);

  const handleRefreshSubscription = async (subId: string) => {
    if (!client) return;
    setRefreshingSubId(subId);
    try {
      await refreshICalSubscription(client, subId);
      toast.success(tSub('refresh_success'));
    } catch {
      toast.error(tSub('refresh_error'));
    } finally {
      setRefreshingSubId(null);
    }
  };

  const handleDeleteSubscription = async (subId: string) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await removeICalSubscription(client, subId);
      setDeletingSubId(null);
      toast.success(tSub('deleted'));
    } catch {
      toast.error(tSub('delete_error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Close color picker on click outside
  useEffect(() => {
    if (!colorPickerId) return;
    const handleClick = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColorPickerId(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [colorPickerId]);

  const handleCreate = async (data: { name: string; color: string }) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await createCalendar(client, {
        name: data.name,
        color: data.color,
        isVisible: true,
        isSubscribed: true,
      });
      setIsCreating(false);
      toast.success(t('calendar_created'));
    } catch {
      toast.error(t('error_create'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (calendarId: string, data: { name: string; color: string }) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await updateCalendar(client, calendarId, { name: data.name, color: data.color });
      setEditingId(null);
      toast.success(t('calendar_updated'));
    } catch {
      toast.error(t('error_update'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleColorChange = async (calendarId: string, color: string) => {
    if (!client) return;
    try {
      await updateCalendar(client, calendarId, { color });
      toast.success(t('color_updated'));
    } catch {
      toast.error(t('error_update'));
    }
    setColorPickerId(null);
  };

  const handleDelete = async (calendarId: string) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await removeCalendar(client, calendarId);
      setDeletingId(null);
      toast.success(t('calendar_deleted'));
    } catch {
      toast.error(t('error_delete'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async (calendarId: string) => {
    if (!client) return;
    setIsLoading(true);
    try {
      const cal = calendars.find(c => c.id === calendarId);
      if (!cal) return;
      // Per RFC 9670 (JMAP Sharing), isSubscribed is a per-user property that a
      // sharee can set without needing mayAdmin. Send to the owner's accountId.
      const realId = cal.originalId || calendarId;
      const ownerAccountId = cal.accountId;
      await client.updateCalendar(realId, { isSubscribed: false }, ownerAccountId);
      dropCalendar(calendarId);
      setUnsubscribingId(null);
      toast.success(t('unsubscribed'));
    } catch {
      toast.error(t('error_unsubscribe'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadUnsubscribed = async () => {
    if (!client) return;
    setLoadingUnsubscribed(true);
    try {
      const cals = await client.getUnsubscribedSharedCalendars();
      setUnsubscribedCalendars(cals);
    } finally {
      setLoadingUnsubscribed(false);
    }
  };

  const handleToggleUnsubscribed = () => {
    const next = !showUnsubscribed;
    setShowUnsubscribed(next);
    if (next && unsubscribedCalendars.length === 0) handleLoadUnsubscribed();
  };

  const handleResubscribe = async (cal: Calendar) => {
    if (!client) return;
    setResubscribingId(cal.id);
    try {
      const realId = cal.originalId || cal.id;
      const ownerAccountId = cal.accountId;
      await client.updateCalendar(realId, { isSubscribed: true }, ownerAccountId);
      setUnsubscribedCalendars(prev => prev.filter(c => c.id !== cal.id));
      await fetchCalendars(client);
      toast.success(t('resubscribed'));
    } catch {
      toast.error(t('error_resubscribe'));
    } finally {
      setResubscribingId(null);
    }
  };

  const handleShareUpdate = async (calendarId: string, shareWith: Record<string, CalendarRights>) => {
    if (!client) return;
    try {
      await updateCalendar(client, calendarId, { shareWith });
      toast.success(t('share_updated'));
    } catch {
      toast.error(t('share_error'));
      throw new Error('Failed to update sharing');
    }
  };

  const handleClear = async (calendarId: string) => {
    if (!client) return;
    setIsLoading(true);
    try {
      const count = await clearCalendarEvents(client, calendarId);
      setClearingId(null);
      toast.success(t('events_cleared', { count }));
    } catch {
      toast.error(t('error_clear'));
    } finally {
      setIsLoading(false);
    }
  };

  const buildCalDavUrl = (calendarId: string) => {
    if (!serverUrl || !username) return null;
    const calendar = calendars.find((entry) => entry.id === calendarId);
    if (!calendar) return null;
    const accountKey = calendar.isShared ? (calendar.accountId || calendar.accountName || calendar.id) : username;
    return discoveredCalDavUrls[accountKey] || wellKnownCalDavUrl;
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('url_copied'));
    } catch {
      // Fallback for non-HTTPS contexts
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success(t('url_copied'));
    }
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="space-y-2">
        {calendars.filter(cal => !isSubscriptionCalendar(cal.id)).map((cal) => {
          const color = cal.color || '#3b82f6';

          if (editingId === cal.id) {
            return (
              <CalendarEditForm
                key={cal.id}
                initial={{ name: cal.name, color }}
                onSave={(data) => handleUpdate(cal.id, data)}
                onCancel={() => setEditingId(null)}
                isLoading={isLoading}
              />
            );
          }

          if (deletingId === cal.id) {
            return (
              <div key={cal.id} className="flex items-center gap-3 py-2.5 px-3 bg-destructive/5 rounded-md border border-destructive/20">
                <Trash2 className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-foreground flex-1">
                  {t('confirm_delete', { name: cal.name })}
                </p>
                <button
                  onClick={() => handleDelete(cal.id)}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
                >
                  {t('delete')}
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-3 py-1 text-xs bg-muted text-foreground rounded-md hover:bg-accent"
                >
                  {t('cancel')}
                </button>
              </div>
            );
          }

          if (clearingId === cal.id) {
            return (
              <div key={cal.id} className="flex items-center gap-3 py-2.5 px-3 bg-amber-500/5 rounded-md border border-amber-500/20">
                <Eraser className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-foreground flex-1">
                  {t('confirm_clear', { name: cal.name })}
                </p>
                <button
                  onClick={() => handleClear(cal.id)}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {t('clear_events')}
                </button>
                <button
                  onClick={() => setClearingId(null)}
                  className="px-3 py-1 text-xs bg-muted text-foreground rounded-md hover:bg-accent"
                >
                  {t('cancel')}
                </button>
              </div>
            );
          }

          const isSharing = sharingCalendarId === cal.id;
          const canShare = !cal.isShared && cal.myRights?.mayAdmin !== false;

          // Unsubscribe confirm state for shared calendars
          if (cal.isShared && unsubscribingId === cal.id) {
            return (
              <div key={cal.id} className="flex items-center gap-3 py-2.5 px-3 bg-destructive/5 rounded-md border border-destructive/20">
                <LogOut className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-foreground flex-1">
                  {t('confirm_unsubscribe', { name: cal.name })}
                </p>
                <button
                  onClick={() => handleUnsubscribe(cal.id)}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
                >
                  {t('unsubscribe')}
                </button>
                <button
                  onClick={() => setUnsubscribingId(null)}
                  className="px-3 py-1 text-xs bg-muted text-foreground rounded-md hover:bg-accent"
                >
                  {t('cancel')}
                </button>
              </div>
            );
          }

          return (
            <div key={cal.id} className={cn(
              "rounded-md border bg-background",
              cal.isShared ? "border-blue-500/30 bg-blue-500/5" : "border-border"
            )}>
            <div className="flex items-center gap-3 py-2.5 px-3 group">
              {/* Color swatch */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setColorPickerId(colorPickerId === cal.id ? null : cal.id)}
                  className="w-5 h-5 rounded-full shrink-0 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  style={{ backgroundColor: color }}
                  title={t('change_color')}
                />
                {colorPickerId === cal.id && (
                  <div
                    ref={colorPickerRef}
                    className="absolute left-0 top-full mt-2 z-50 bg-background border border-border rounded-lg shadow-lg p-3 w-56"
                  >
                    <CalendarColorPicker
                      value={color}
                      onChange={(c) => handleColorChange(cal.id, c)}
                      allowCustom
                    />
                  </div>
                )}
              </div>

              {cal.isShared
                ? <Share2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                : <CalendarIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }

              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{cal.name}</span>
                {cal.isShared && cal.accountName && (
                  <span className="text-xs text-blue-500/80 truncate block">
                    {t('shared_by', { name: cal.accountName })}
                  </span>
                )}
                {!cal.isShared && (() => {
                  const caldavUrl = buildCalDavUrl(cal.id);
                  if (!caldavUrl) return null;
                  return (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Link className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground truncate" title={caldavUrl}>
                        {caldavUrl}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleCopyUrl(caldavUrl); }}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        title={t('copy_url')}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })()}
              </div>

              {cal.isDefault && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {t('default')}
                </span>
              )}

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {cal.isShared ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingId(cal.id)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t('edit')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setClearingId(cal.id)}
                      className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      title={t('clear_events')}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnsubscribingId(cal.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title={t('unsubscribe')}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    {canShare && (
                      <button
                        type="button"
                        onClick={() => setSharingCalendarId(isSharing ? null : cal.id)}
                        className={cn(
                          "p-1.5 rounded-md transition-colors",
                          isSharing
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                        title={t('share')}
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(cal.id)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t('edit')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setClearingId(cal.id)}
                      className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      title={t('clear_events')}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                    {!cal.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDeletingId(cal.id)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title={t('delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {isSharing && canShare && client && (
              <div className="px-3 pb-3">
                <CalendarSharePanel
                  calendarId={cal.id}
                  shareWith={cal.shareWith}
                  onUpdate={handleShareUpdate}
                  client={client}
                />
              </div>
            )}
            </div>
          );
        })}

        {isCreating ? (
          <CalendarEditForm
            onSave={handleCreate}
            onCancel={() => setIsCreating(false)}
            isLoading={isLoading}
          />
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 flex-1 py-2.5 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-dashed border-border transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('add_calendar')}
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 py-2.5 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-dashed border-border transition-colors"
            >
              <Upload className="w-4 h-4" />
              {tImport('title')}
            </button>
            <button
              type="button"
              onClick={() => setShowSubscriptionModal(true)}
              className="flex items-center gap-2 py-2.5 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-dashed border-border transition-colors"
            >
              <Globe className="w-4 h-4" />
              {tSub('title')}
            </button>
          </div>
        )}
      </div>

      {/* iCal Subscriptions */}
      {icalSubscriptions.length > 0 && (
        <div className="mt-6 space-y-2">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            {tSub('section_title')}
          </h4>
          {icalSubscriptions.map((sub) => {
            if (deletingSubId === sub.id) {
              return (
                <div key={sub.id} className="flex items-center gap-3 py-2.5 px-3 bg-destructive/5 rounded-md border border-destructive/20">
                  <Trash2 className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-sm text-foreground flex-1">
                    {tSub('confirm_delete', { name: sub.name })}
                  </p>
                  <button
                    onClick={() => handleDeleteSubscription(sub.id)}
                    disabled={isLoading}
                    className="px-3 py-1 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {t('delete')}
                  </button>
                  <button
                    onClick={() => setDeletingSubId(null)}
                    className="px-3 py-1 text-xs bg-muted text-foreground rounded-md hover:bg-accent"
                  >
                    {t('cancel')}
                  </button>
                </div>
              );
            }

            return (
              <div
                key={sub.id}
                className="flex items-center gap-3 py-2.5 px-3 rounded-md border border-border bg-background group"
              >
                <span
                  className="w-5 h-5 rounded-full shrink-0"
                  style={{ backgroundColor: sub.color }}
                />
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{sub.name}</span>
                  <span className="text-xs text-muted-foreground truncate block" title={sub.url}>
                    {sub.url}
                  </span>
                  {sub.lastRefreshed && (
                    <span className="text-xs text-muted-foreground">
                      {tSub('last_refreshed', { time: formatDateTime(sub.lastRefreshed, timeFormat, { month: 'short', day: 'numeric', year: 'numeric' }) })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleRefreshSubscription(sub.id)}
                    disabled={refreshingSubId === sub.id}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    title={tSub('refresh')}
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", refreshingSubId === sub.id && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingSubId(sub.id)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title={tSub('unsubscribe')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unsubscribed shared calendars — collapsed by default */}
      <div className="mt-4">
        <button
          type="button"
          onClick={handleToggleUnsubscribed}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showUnsubscribed && "rotate-180")} />
          {t('unsubscribed_section')}
          {loadingUnsubscribed && <RefreshCw className="w-3 h-3 animate-spin" />}
        </button>

        {showUnsubscribed && (
          <div className="mt-2 space-y-1.5">
            {unsubscribedCalendars.length === 0 && !loadingUnsubscribed && (
              <p className="text-xs text-muted-foreground px-1">{t('unsubscribed_empty')}</p>
            )}
            {unsubscribedCalendars.map((cal) => (
              <div key={cal.id} className="flex items-center gap-3 py-2 px-3 rounded-md border border-border bg-muted/30">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cal.color || '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cal.name}</p>
                  {cal.accountName && (
                    <p className="text-xs text-muted-foreground truncate">{cal.accountName}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleResubscribe(cal)}
                  disabled={resubscribingId === cal.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
                  title={t('resubscribe')}
                >
                  <RotateCcw className={cn("w-3 h-3", resubscribingId === cal.id && "animate-spin")} />
                  {t('resubscribe')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showImportModal && client && (
        <ICalImportModal
          calendars={calendars}
          client={client}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showSubscriptionModal && client && (
        <ICalSubscriptionModal
          client={client}
          onClose={() => setShowSubscriptionModal(false)}
        />
      )}
    </SettingsSection>
  );
}
