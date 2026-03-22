"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useContactStore } from '@/stores/contact-store';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/stores/toast-store';
import { SettingsSection } from './settings-section';
import { Plus, Pencil, Trash2, Check, X, BookUser, ChevronDown, UserPlus } from 'lucide-react';
import type { AddressBook, AddressBookRights } from '@/lib/jmap/types';
import { IJMAPClient } from '@/lib/jmap/client-interface';

type SharePermission = 'read_only' | 'can_write';

const SHARE_PERMISSION_RIGHTS: Record<SharePermission, AddressBookRights> = {
  read_only: {
    mayRead: true, mayWrite: false, mayShare: false, mayDelete: false,
  },
  can_write: {
    mayRead: true, mayWrite: true, mayShare: false, mayDelete: false,
  },
};

function inferPermission(rights: AddressBookRights): SharePermission {
  if (rights.mayWrite) return 'can_write';
  return 'read_only';
}

function AddressBookSharePanel({
  addressBookId,
  shareWith,
  onUpdate,
  client,
}: {
  addressBookId: string;
  shareWith: Record<string, AddressBookRights> | null | undefined;
  onUpdate: (id: string, shareWith: Record<string, AddressBookRights>) => Promise<void>;
  client: IJMAPClient;
}) {
  const t = useTranslations('contacts.management');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newPermission, setNewPermission] = useState<SharePermission>('can_write');
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
      await onUpdate(addressBookId, updated);
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
      await onUpdate(addressBookId, updated);
    } finally {
      setLoadingPrincipal(null);
    }
  };

  const handleChangePermission = async (principal: string, permission: SharePermission) => {
    setLoadingPrincipal(principal);
    try {
      const updated = { ...shares, [principal]: SHARE_PERMISSION_RIGHTS[permission] };
      await onUpdate(addressBookId, updated);
    } finally {
      setLoadingPrincipal(null);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-md border border-border bg-muted/30 space-y-3">
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
                    <option value="can_write">{t('share_can_write')}</option>
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
            <option value="can_write">{t('share_can_write')}</option>
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

function AddressBookEditForm({
  initial,
  onSave,
  onCancel,
  isLoading,
}: {
  initial?: { name: string };
  onSave: (data: { name: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const t = useTranslations('contacts.management');
  const [name, setName] = useState(initial?.name || '');

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
            if (e.key === 'Enter' && isValid) onSave({ name: name.trim() });
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={t('name_placeholder')}
          className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
          disabled={isLoading}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => isValid && onSave({ name: name.trim() })}
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

export function AddressBookManagementSettings() {
  const t = useTranslations('contacts.management');
  const { client } = useAuthStore();
  const { addressBooks, fetchAddressBooks, createAddressBook, updateAddressBook, deleteAddressBook } = useContactStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    if (client && addressBooks.length === 0) {
      fetchAddressBooks(client);
    }
  }, [client, addressBooks.length, fetchAddressBooks]);

  const handleCreate = async (data: { name: string }) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await createAddressBook(client, { name: data.name });
      setIsCreating(false);
      toast.success(t('addressbook_created'));
    } catch {
      toast.error(t('error_create'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (id: string, data: { name: string }) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await updateAddressBook(client, id, { name: data.name });
      setEditingId(null);
      toast.success(t('addressbook_updated'));
    } catch {
      toast.error(t('error_update'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!client) return;
    setIsLoading(true);
    try {
      await deleteAddressBook(client, id);
      setDeletingId(null);
      toast.success(t('addressbook_deleted'));
    } catch {
      toast.error(t('error_delete'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleShareUpdate = async (id: string, shareWith: Record<string, AddressBookRights>) => {
    if (!client) return;
    try {
      await updateAddressBook(client, id, { shareWith } as Partial<AddressBook>);
      toast.success(t('share_updated'));
    } catch {
      toast.error(t('share_error'));
      throw new Error('Failed to update sharing');
    }
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="space-y-2">
        {addressBooks.map((book) => {
          if (editingId === book.id) {
            return (
              <AddressBookEditForm
                key={book.id}
                initial={{ name: book.name }}
                onSave={(data) => handleUpdate(book.id, data)}
                onCancel={() => setEditingId(null)}
                isLoading={isLoading}
              />
            );
          }

          if (deletingId === book.id) {
            return (
              <div key={book.id} className="flex items-center gap-3 py-2.5 px-3 bg-destructive/5 rounded-md border border-destructive/20">
                <Trash2 className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-foreground flex-1">
                  {t('confirm_delete', { name: book.name })}
                </p>
                <button
                  onClick={() => handleDelete(book.id)}
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

          const isSharing = sharingId === book.id;
          const canShare = !book.isShared && book.myRights?.mayShare !== false;
          const canEdit = !book.isShared || book.myRights?.mayWrite === true;
          const canDelete = !book.isShared && book.myRights?.mayDelete !== false;

          return (
            <div key={book.id}>
              <div className="flex items-center gap-3 py-2.5 px-3 rounded-md border border-border bg-background group">
                <BookUser className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {book.name}
                    {book.isShared && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({book.accountName || t('shared')})
                      </span>
                    )}
                    {book.isDefault && (
                      <span className="ml-2 text-xs text-primary font-normal">{t('default')}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => setSharingId(isSharing ? null : book.id)}
                      className={`p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ${isSharing ? 'bg-muted text-foreground opacity-100' : ''}`}
                      title={t('share')}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingId(book.id)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t('edit')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeletingId(book.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isSharing && client && (
                <AddressBookSharePanel
                  addressBookId={book.id}
                  shareWith={book.shareWith}
                  onUpdate={handleShareUpdate}
                  client={client}
                />
              )}
            </div>
          );
        })}

        {isCreating ? (
          <AddressBookEditForm
            onSave={handleCreate}
            onCancel={() => setIsCreating(false)}
            isLoading={isLoading}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors w-full"
          >
            <Plus className="w-4 h-4" />
            {t('add_addressbook')}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}
