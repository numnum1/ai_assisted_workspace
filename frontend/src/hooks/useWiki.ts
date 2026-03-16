import { useState, useCallback } from 'react';
import type { WikiType, WikiEntry } from '../types.ts';
import { wikiApi } from '../api.ts';

export interface EditingWikiEntry {
  type: WikiType;
  entry: WikiEntry;
}

export interface WikiState {
  types: WikiType[];
  currentType: WikiType | null;
  entries: WikiEntry[];
  editingEntry: EditingWikiEntry | null;
  loadTypes: () => Promise<void>;
  enterType: (typeId: string) => Promise<void>;
  goBack: () => void;
  createType: (name: string) => Promise<void>;
  deleteType: (typeId: string) => Promise<void>;
  createEntry: (name: string) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  openEntry: (entry: WikiEntry) => void;
  saveEntry: (values: Record<string, string>) => Promise<void>;
  closeEntry: () => void;
}

export function useWiki(): WikiState {
  const [types, setTypes] = useState<WikiType[]>([]);
  const [currentType, setCurrentType] = useState<WikiType | null>(null);
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<EditingWikiEntry | null>(null);

  const loadTypes = useCallback(async () => {
    const data = await wikiApi.listTypes();
    setTypes(data);
  }, []);

  const loadEntries = useCallback(async (typeId: string) => {
    const data = await wikiApi.listEntries(typeId);
    setEntries(data);
  }, []);

  const enterType = useCallback(async (typeId: string) => {
    const type = await wikiApi.getType(typeId);
    setCurrentType(type);
    await loadEntries(typeId);
  }, [loadEntries]);

  const goBack = useCallback(() => {
    setCurrentType(null);
    setEntries([]);
  }, []);

  const createType = useCallback(async (name: string) => {
    await wikiApi.createType(name);
    const data = await wikiApi.listTypes();
    setTypes(data);
  }, []);

  const deleteType = useCallback(async (typeId: string) => {
    await wikiApi.deleteType(typeId);
    const data = await wikiApi.listTypes();
    setTypes(data);
    if (currentType?.id === typeId) {
      setCurrentType(null);
      setEntries([]);
    }
  }, [currentType]);

  const createEntry = useCallback(async (name: string) => {
    if (!currentType) return;
    await wikiApi.createEntry(currentType.id, name);
    await loadEntries(currentType.id);
  }, [currentType, loadEntries]);

  const deleteEntry = useCallback(async (entryId: string) => {
    if (!currentType) return;
    await wikiApi.deleteEntry(currentType.id, entryId);
    await loadEntries(currentType.id);
  }, [currentType, loadEntries]);

  const openEntry = useCallback((entry: WikiEntry) => {
    if (!currentType) return;
    setEditingEntry({ type: currentType, entry });
  }, [currentType]);

  const saveEntry = useCallback(async (values: Record<string, string>) => {
    if (!editingEntry) return;
    const updated = await wikiApi.updateEntry(editingEntry.type.id, editingEntry.entry.id, values);
    setEditingEntry(prev => prev ? { ...prev, entry: updated } : null);
    if (currentType) {
      await loadEntries(currentType.id);
    }
  }, [editingEntry, currentType, loadEntries]);

  const closeEntry = useCallback(() => {
    setEditingEntry(null);
  }, []);

  return {
    types,
    currentType,
    entries,
    editingEntry,
    loadTypes,
    enterType,
    goBack,
    createType,
    deleteType,
    createEntry,
    deleteEntry,
    openEntry,
    saveEntry,
    closeEntry,
  };
}
