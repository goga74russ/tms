'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Loader2, Plus, RotateCcw, Save, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface RepairPartCatalogItem {
  id: string;
  code?: string;
  name: string;
  category: string;
  unit: string;
  suggestedUnitCost: number;
  aliases?: string[];
  isArchived?: boolean;
}

interface CatalogFormState {
  code: string;
  name: string;
  category: string;
  unit: string;
  suggestedUnitCost: string;
  aliasesText: string;
}

function emptyForm(): CatalogFormState {
  return { code: '', name: '', category: '', unit: '', suggestedUnitCost: '', aliasesText: '' };
}

function formatMoney(value: number) {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formFromItem(item: RepairPartCatalogItem): CatalogFormState {
  return {
    code: item.code || '',
    name: item.name || '',
    category: item.category || '',
    unit: item.unit || '',
    suggestedUnitCost: String(item.suggestedUnitCost ?? ''),
    aliasesText: (item.aliases || []).join(', '),
  };
}

function parseAliases(value: string) {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function RepairCatalogManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<RepairPartCatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<CatalogFormState>(emptyForm());

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  async function loadItems(query = search, archived = includeArchived) {
    if (!open) return;

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      params.set('limit', '200');
      if (archived) params.set('includeArchived', '1');

      const result = await api.get<{ data: RepairPartCatalogItem[] }>(`/repairs/parts/catalog?${params.toString()}`);
      setItems(result.data || []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void loadItems(search, includeArchived);
    }, 250);
    return () => clearTimeout(timer);
  }, [open, search, includeArchived]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setIncludeArchived(false);
    setSelectedId(null);
    setForm(emptyForm());
    void loadItems('', false);
  }, [open]);

  function selectItem(item: RepairPartCatalogItem) {
    setSelectedId(item.id);
    setForm(formFromItem(item));
    setError('');
  }

  function startCreate() {
    setSelectedId(null);
    setForm(emptyForm());
    setError('');
  }

  async function handleSave() {
    const payload = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      category: form.category.trim(),
      unit: form.unit.trim(),
      suggestedUnitCost: Number(form.suggestedUnitCost || 0),
      aliases: parseAliases(form.aliasesText),
    };

    if (!payload.name || !payload.category || !payload.unit) {
      setError('Заполните название, категорию и единицу измерения');
      return;
    }
    if (Number.isNaN(payload.suggestedUnitCost) || payload.suggestedUnitCost < 0) {
      setError('Укажите корректную стоимость');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = selectedId
        ? await api.put<{ data: RepairPartCatalogItem }>(`/repairs/parts/catalog/${selectedId}`, payload)
        : await api.post<{ data: RepairPartCatalogItem }>('/repairs/parts/catalog', payload);

      const item = result.data;
      setItems((prev) => {
        const next = prev.filter((current) => current.id !== item.id);
        return [item, ...next].sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'));
      });
      setSelectedId(item.id);
      setForm(formFromItem(item));
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить позицию');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!selectedItem) return;

    setSaving(true);
    setError('');
    try {
      const result = selectedItem.isArchived
        ? await api.put<{ data: RepairPartCatalogItem }>(`/repairs/parts/catalog/${selectedItem.id}`, { isArchived: false })
        : await api.delete<{ data: RepairPartCatalogItem }>(`/repairs/parts/catalog/${selectedItem.id}`);

      const item = result.data;
      setItems((prev) => prev.map((current) => (current.id === item.id ? item : current)));
      setSelectedId(item.id);
      setForm(formFromItem(item));
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Не удалось изменить архивный статус');
    } finally {
      setSaving(false);
    }
  }

  const activeCount = items.filter((item) => !item.isArchived).length;
  const archivedCount = items.filter((item) => item.isArchived).length;

  return (
    <Dialog open={open} onClose={onClose} title="Каталог запчастей">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по названию, коду, категории, alias..."
                  className="pl-9"
                />
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                />
                Архив
              </label>
              <Button type="button" variant="outline" onClick={startCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Новая позиция
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-600">Всего: {items.length}</span>
              <span className="rounded-full bg-success-50 px-2 py-1 text-success-700">Активные: {activeCount}</span>
              <span className="rounded-full bg-warning-50 px-2 py-1 text-warning-700">Архив: {archivedCount}</span>
            </div>

            <div className="max-h-[560px] space-y-2 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-neutral-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-500">Ничего не найдено</div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                      selectedId === item.id
                        ? 'border-brand-300 bg-brand-50'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                    } ${item.isArchived ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-neutral-900">{item.name}</p>
                        <p className="text-xs text-neutral-500">
                          {item.code ? `${item.code} · ` : ''}
                          {item.category} · {item.unit}
                        </p>
                        {item.aliases?.length ? (
                          <p className="mt-1 text-[11px] text-neutral-400">Alias: {item.aliases.slice(0, 3).join(', ')}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-neutral-900">{formatMoney(item.suggestedUnitCost)} ₽</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${item.isArchived ? 'bg-warning-100 text-warning-700' : 'bg-success-100 text-success-700'}`}>
                          {item.isArchived ? 'Архив' : 'Активно'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {selectedItem ? 'Редактирование' : 'Создание'}
                </p>
                <h3 className="text-base font-semibold text-neutral-900">{selectedItem ? selectedItem.name : 'Новая позиция каталога'}</h3>
              </div>
              {selectedItem ? (
                <button
                  type="button"
                  onClick={handleArchiveToggle}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {selectedItem.isArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  {selectedItem.isArchived ? 'Восстановить' : 'Архивировать'}
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Код</label>
                  <Input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="oil-filter" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Стоимость</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.suggestedUnitCost}
                    onChange={(e) => setForm((prev) => ({ ...prev, suggestedUnitCost: e.target.value }))}
                    placeholder="650"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Название</label>
                <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Масляный фильтр" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Категория</label>
                  <Input value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Фильтры" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Единица</label>
                  <Input value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} placeholder="шт" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Alias / синонимы</label>
                <textarea
                  value={form.aliasesText}
                  onChange={(e) => setForm((prev) => ({ ...prev, aliasesText: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  placeholder="filter oil, масляный фильтр"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                <span>Можно быстро отредактировать и сразу использовать в планировании ремонта.</span>
                <span>{selectedItem?.isArchived ? 'Архивная позиция' : 'Активная позиция'}</span>
              </div>

              {error && <p className="text-sm text-danger-600">{error}</p>}

              <div className="flex justify-end gap-3 border-t border-neutral-100 pt-3">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Отмена
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" />
                  {selectedItem ? 'Сохранить' : 'Создать'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
