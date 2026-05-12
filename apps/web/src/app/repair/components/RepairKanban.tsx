// TODO(deprecate): The bespoke grid + drag-drop shell in this file is replaced
// by the generic <KanbanBoard> primitive from @/components/ui/kanban. The
// transition dialogs (Plan/Receive/Complete) remain owned here and will be
// extracted next round when the deprecated KanbanBoard is removed.
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, Trash2, Wrench, PackageOpen, Hammer, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/Combobox';
import { EmptyState } from '@/components/ui/empty-state';
import {
  KanbanBoard,
  KanbanColumn,
  KanbanCard,
  type KanbanTone,
} from '@/components/ui/kanban';
import { RepairCard } from './RepairCard';

interface RepairPart {
  name: string;
  quantity?: number;
  cost?: number;
  plannedQuantity?: number;
  estimatedUnitCost?: number;
  catalogId?: string;
  catalogName?: string;
  catalogCategory?: string;
  unit?: string;
  suggestedUnitCost?: number;
  received?: boolean;
  receivedQuantity?: number;
  actualUnitCost?: number;
  usedQuantity?: number;
}

interface RepairPartCatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  suggestedUnitCost: number;
}

interface RepairPartCatalogGroup {
  category: string;
  count: number;
  items: RepairPartCatalogItem[];
}

interface RepairPartCatalogMeta {
  total: number;
  categories: RepairPartCatalogGroup[];
  featured: RepairPartCatalogItem[];
  bundles: RepairPartCatalogBundle[];
  sourceTemplates: RepairPartCatalogBundle[];
}

interface RepairPartCatalogBundle {
  id: string;
  name: string;
  description: string;
  totalSuggestedCost: number;
  appliesTo?: Array<'all' | 'auto_inspection' | 'driver' | 'mechanic' | 'scheduled'>;
  items: Array<RepairPartCatalogItem & { quantity: number }>;
}

interface RepairPartsSummary {
  partCount: number;
  plannedQuantity: number;
  receivedQuantity: number;
  usedQuantity: number;
  plannedCost: number;
  receivedCost: number;
  usedCost: number;
  factCost: number;
  variance: number;
  variancePercent: number;
  plannedRate: number;
  receivedRate: number;
  usedRate: number;
}

type MergedRepairPart = RepairPart & {
  plannedCostTotal: number;
  receivedCostTotal: number;
  usedCostTotal: number;
};

const RECENT_CATALOG_STORAGE_KEY = 'tms.repair.recentParts';

interface Repair {
  id: string;
  vehicleId: string;
  status: string;
  description: string;
  priority: string;
  source: string;
  assignedTo?: string;
  workDescription?: string;
  totalCost: number | string;
  createdAt: string;
  photoUrls: string[];
  partsUsed?: RepairPart[];
  partsSummary?: RepairPartsSummary;
}

type RepairEmptyTone = 'warning' | 'brand' | 'success';

const COLUMNS: Array<{
  status: string;
  label: string;
  tone: KanbanTone;
  emptyIcon: LucideIcon;
  emptyDescription: string;
  emptyTone: RepairEmptyTone;
}> = [
  {
    status: 'created',
    label: 'Создана',
    tone: 'neutral',
    emptyIcon: Wrench,
    emptyDescription: 'Создайте первую заявку на ремонт',
    emptyTone: 'warning',
  },
  {
    status: 'waiting_parts',
    label: 'Ждёт з/ч',
    tone: 'warning',
    emptyIcon: PackageOpen,
    emptyDescription: 'Заявки, ожидающие поступления запчастей',
    emptyTone: 'brand',
  },
  {
    status: 'in_progress',
    label: 'В работе',
    tone: 'info',
    emptyIcon: Hammer,
    emptyDescription: 'Заявки в активной работе',
    emptyTone: 'brand',
  },
  {
    status: 'done',
    label: 'Готово',
    tone: 'success',
    emptyIcon: CheckCircle2,
    emptyDescription: 'Завершённые заявки появятся здесь',
    emptyTone: 'success',
  },
];

const REPAIR_STATE_TRANSITIONS: Record<string, string[]> = {
  created: ['waiting_parts'],
  waiting_parts: ['in_progress'],
  in_progress: ['done'],
  done: [],
};

function emptyPart(): RepairPart {
  return { name: '', plannedQuantity: 1, estimatedUnitCost: 0, received: false, receivedQuantity: 0, actualUnitCost: 0, usedQuantity: 0 };
}

function createPartFromCatalog(item: RepairPartCatalogItem): RepairPart {
  return normalizePart({
    ...emptyPart(),
    catalogId: item.id,
    catalogName: item.name,
    catalogCategory: item.category,
    unit: item.unit,
    suggestedUnitCost: item.suggestedUnitCost,
    name: item.name,
    estimatedUnitCost: item.suggestedUnitCost,
    cost: item.suggestedUnitCost,
  });
}

function normalizePart(part: RepairPart): RepairPart {
  const plannedQuantity = Number(part.plannedQuantity ?? part.quantity ?? 0);
  const suggestedUnitCost = part.suggestedUnitCost !== undefined ? Number(part.suggestedUnitCost) : undefined;
  const estimatedUnitCost = Number(part.estimatedUnitCost ?? part.cost ?? suggestedUnitCost ?? 0);
  const receivedQuantity = Number(part.receivedQuantity ?? 0);
  const actualUnitCost = Number(part.actualUnitCost ?? part.cost ?? estimatedUnitCost ?? 0);
  const usedQuantity = Number(part.usedQuantity ?? receivedQuantity ?? 0);
  return {
    name: part.name?.trim() || part.catalogName || '',
    quantity: plannedQuantity,
    cost: estimatedUnitCost,
    plannedQuantity,
    estimatedUnitCost,
    catalogId: part.catalogId?.trim() || undefined,
    catalogName: part.catalogName?.trim() || undefined,
    catalogCategory: part.catalogCategory?.trim() || undefined,
    unit: part.unit?.trim() || undefined,
    suggestedUnitCost,
    received: Boolean(part.received ?? receivedQuantity > 0),
    receivedQuantity,
    actualUnitCost,
    usedQuantity,
  };
}

function partIdentity(part: RepairPart) {
  const catalogId = part.catalogId?.trim();
  if (catalogId) return `catalog:${catalogId.toLowerCase()}`;

  const name = (part.catalogName || part.name || '').trim().toLowerCase();
  const category = (part.catalogCategory || '').trim().toLowerCase();
  const unit = (part.unit || '').trim().toLowerCase();
  return `text:${[name, category, unit].join('|')}`;
}

function mergeRepairParts(parts: RepairPart[]) {
  const merged = new Map<string, MergedRepairPart>();

  for (const rawPart of parts) {
    const part = normalizePart(rawPart);
    const key = partIdentity(part);
    const existing = merged.get(key);
    const plannedQuantity = Number(part.plannedQuantity || 0);
    const receivedQuantity = Number(part.receivedQuantity || 0);
    const usedQuantity = Number(part.usedQuantity || 0);
    const plannedUnitCost = Number(part.estimatedUnitCost || part.suggestedUnitCost || 0);
    const actualUnitCost = Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0);

    if (!existing) {
      merged.set(key, {
        ...part,
        quantity: plannedQuantity,
        plannedQuantity,
        receivedQuantity,
        usedQuantity,
        estimatedUnitCost: plannedUnitCost,
        actualUnitCost,
        cost: plannedUnitCost,
        received: Boolean(part.received || receivedQuantity > 0),
        plannedCostTotal: plannedQuantity * plannedUnitCost,
        receivedCostTotal: receivedQuantity * actualUnitCost,
        usedCostTotal: usedQuantity * actualUnitCost,
      });
      continue;
    }

    existing.quantity = Number(existing.quantity || 0) + plannedQuantity;
    existing.plannedQuantity = Number(existing.plannedQuantity || 0) + plannedQuantity;
    existing.receivedQuantity = Number(existing.receivedQuantity || 0) + receivedQuantity;
    existing.usedQuantity = Number(existing.usedQuantity || 0) + usedQuantity;
    existing.received = Boolean(existing.received || part.received || receivedQuantity > 0);
    existing.plannedCostTotal += plannedQuantity * plannedUnitCost;
    existing.receivedCostTotal += receivedQuantity * actualUnitCost;
    existing.usedCostTotal += usedQuantity * actualUnitCost;

    if (!existing.catalogId && part.catalogId) existing.catalogId = part.catalogId;
    if (!existing.catalogName && part.catalogName) existing.catalogName = part.catalogName;
    if (!existing.catalogCategory && part.catalogCategory) existing.catalogCategory = part.catalogCategory;
    if (!existing.unit && part.unit) existing.unit = part.unit;
    if (!existing.suggestedUnitCost && part.suggestedUnitCost !== undefined) existing.suggestedUnitCost = part.suggestedUnitCost;
  }

  return Array.from(merged.values()).map((entry: MergedRepairPart) => {
    const { plannedCostTotal, receivedCostTotal, usedCostTotal, ...part } = entry;
    const plannedQuantity = Number(part.plannedQuantity || 0);
    const receivedQuantity = Number(part.receivedQuantity || 0);
    const usedQuantity = Number(part.usedQuantity || 0);
    return {
      ...part,
      plannedQuantity,
      quantity: plannedQuantity,
      receivedQuantity,
      usedQuantity,
      estimatedUnitCost: plannedQuantity > 0 ? plannedCostTotal / plannedQuantity : Number(part.estimatedUnitCost || part.suggestedUnitCost || 0),
      actualUnitCost: receivedQuantity > 0
        ? receivedCostTotal / receivedQuantity
        : usedQuantity > 0
          ? usedCostTotal / usedQuantity
          : Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0),
      cost: plannedQuantity > 0 ? plannedCostTotal / plannedQuantity : Number(part.cost || part.estimatedUnitCost || 0),
    } as RepairPart;
  });
}

function formatMoney(value: number) {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildPartsSummary(parts: RepairPart[], totalCost?: number | string) {
  const summary = mergeRepairParts(parts).reduce(
    (acc, rawPart) => {
      const part = normalizePart(rawPart);
      const plannedQuantity = Number(part.plannedQuantity || 0);
      const receivedQuantity = Number(part.receivedQuantity || 0);
      const usedQuantity = Number(part.usedQuantity || 0);
      const plannedUnitCost = Number(part.estimatedUnitCost || part.suggestedUnitCost || 0);
      const factUnitCost = Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0);

      acc.partCount += 1;
      acc.plannedQuantity += plannedQuantity;
      acc.receivedQuantity += receivedQuantity;
      acc.usedQuantity += usedQuantity;
      acc.plannedCost += plannedQuantity * plannedUnitCost;
      acc.receivedCost += receivedQuantity * factUnitCost;
      acc.usedCost += usedQuantity * factUnitCost;
      return acc;
    },
    {
      partCount: 0,
      plannedQuantity: 0,
      receivedQuantity: 0,
      usedQuantity: 0,
      plannedCost: 0,
      receivedCost: 0,
      usedCost: 0,
      factCost: Number(totalCost || 0) > 0 ? Number(totalCost || 0) : 0,
      variance: 0,
      variancePercent: 0,
      plannedRate: 0,
      receivedRate: 0,
      usedRate: 0,
    } as RepairPartsSummary,
  );

  summary.factCost = Number(totalCost || 0) > 0 ? Number(totalCost || 0) : (summary.usedCost > 0 ? summary.usedCost : summary.receivedCost);
  summary.variance = summary.factCost - summary.plannedCost;
  summary.variancePercent = summary.plannedCost > 0 ? (summary.variance / summary.plannedCost) * 100 : 0;
  summary.plannedRate = summary.plannedQuantity > 0 ? summary.plannedQuantity : 0;
  summary.receivedRate = summary.plannedQuantity > 0 ? summary.receivedQuantity / summary.plannedQuantity : 0;
  summary.usedRate = summary.plannedQuantity > 0 ? summary.usedQuantity / summary.plannedQuantity : 0;
  return summary;
}

function emptyPartsSummary(): RepairPartsSummary {
  return {
    partCount: 0,
    plannedQuantity: 0,
    receivedQuantity: 0,
    usedQuantity: 0,
    plannedCost: 0,
    receivedCost: 0,
    usedCost: 0,
    factCost: 0,
    variance: 0,
    variancePercent: 0,
    plannedRate: 0,
    receivedRate: 0,
    usedRate: 0,
  };
}

function mergePartsSummary(base: RepairPartsSummary, next: RepairPartsSummary) {
  const plannedCost = base.plannedCost + next.plannedCost;
  const factCost = base.factCost + next.factCost;
  const receivedCost = base.receivedCost + next.receivedCost;
  const usedCost = base.usedCost + next.usedCost;
  const plannedQuantity = base.plannedQuantity + next.plannedQuantity;
  const receivedQuantity = base.receivedQuantity + next.receivedQuantity;
  const usedQuantity = base.usedQuantity + next.usedQuantity;
  const variance = factCost - plannedCost;

  return {
    partCount: base.partCount + next.partCount,
    plannedQuantity,
    receivedQuantity,
    usedQuantity,
    plannedCost,
    receivedCost,
    usedCost,
    factCost,
    variance,
    variancePercent: plannedCost > 0 ? (variance / plannedCost) * 100 : 0,
    plannedRate: plannedQuantity > 0 ? plannedQuantity : 0,
    receivedRate: plannedQuantity > 0 ? receivedQuantity / plannedQuantity : 0,
    usedRate: plannedQuantity > 0 ? usedQuantity / plannedQuantity : 0,
  };
}

function loadRecentCatalogItems(): RepairPartCatalogItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(RECENT_CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => item as RepairPartCatalogItem)
      .filter((item) => item && item.id && item.name && item.category && item.unit)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function rememberCatalogItem(item: RepairPartCatalogItem) {
  if (typeof window === 'undefined') return;

  try {
    const items = loadRecentCatalogItems().filter((current) => current.id !== item.id);
    window.localStorage.setItem(RECENT_CATALOG_STORAGE_KEY, JSON.stringify([item, ...items].slice(0, 8)));
  } catch {
    // Ignore storage failures in the demo shell.
  }
}

function transitionHint(kind: 'plan' | 'receive' | 'done') {
  if (kind === 'plan') {
    return '\u0428\u0430\u0433 1 \u0438\u0437 3: \u0437\u0430\u0444\u0438\u043a\u0441\u0438\u0440\u0443\u0439\u0442\u0435 \u043f\u043b\u0430\u043d \u0437\u0430\u043a\u0443\u043f\u043a\u0438. \u0411\u0435\u0437 \u043d\u0435\u0433\u043e \u043f\u0435\u0440\u0435\u0445\u043e\u0434 \u0432 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0437/\u0447 \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d.';
  }
  if (kind === 'receive') {
    return '\u0428\u0430\u0433 2 \u0438\u0437 3: \u043e\u0442\u043c\u0435\u0442\u044c\u0442\u0435, \u0447\u0442\u043e \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u043f\u0440\u0438\u0435\u0445\u0430\u043b\u043e. \u0411\u0435\u0437 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u043e\u0439 \u043f\u043e\u0441\u0442\u0430\u0432\u043a\u0438 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443 \u0443\u0439\u0442\u0438 \u043d\u0435\u043b\u044c\u0437\u044f.';
  }
  return '\u0428\u0430\u0433 3 \u0438\u0437 3: \u0443\u043a\u0430\u0436\u0438\u0442\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u044b\u0435 \u0440\u0430\u0431\u043e\u0442\u044b, \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u0437/\u0447 \u0438 \u0444\u0430\u043a\u0442. \u041f\u043e\u0441\u043b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u0440\u0435\u043c\u043e\u043d\u0442 \u043f\u0435\u0440\u0435\u0439\u0434\u0435\u0442 \u0432 \u0433\u043e\u0442\u043e\u0432\u043e.';
}

function partLabel(part: RepairPart) {
  return part.catalogName || part.name || 'Без названия';
}

function CatalogPicker({ onSelect }: { onSelect: (item: RepairPartCatalogItem) => void }) {
  return (
    <Combobox<RepairPartCatalogItem>
      className="w-full"
      placeholder="Выбрать из каталога"
      emptyMessage="Ничего не найдено"
      minChars={1}
      onSearch={async (query) => {
        const result = await api.get<{ data: RepairPartCatalogItem[] }>(`/repairs/parts/catalog?search=${encodeURIComponent(query)}`);
        return result.data || [];
      }}
      renderOption={(item) => (
        <div className="flex flex-col gap-0.5 text-left">
          <span className="font-medium text-neutral-900">{item.name}</span>
          <span className="text-xs text-neutral-500">{item.category} · {item.unit} · {formatMoney(item.suggestedUnitCost)} ₽</span>
        </div>
      )}
      getLabel={(item) => item.name}
      getKey={(item) => item.id}
      onSelect={(item) => { if (item) onSelect(item); }}
      icon={<Search className="h-4 w-4" />}
    />
  );
}

function PlanPartsDialog({
  repair,
  open,
  submitting,
  onClose,
  onSubmit,
  catalogMeta,
}: {
  repair: Repair | null;
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (partsUsed: RepairPart[]) => Promise<void>;
  catalogMeta?: RepairPartCatalogMeta | null;
  }) {
    const [parts, setParts] = useState<RepairPart[]>([emptyPart()]);
    const [error, setError] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [recentItems, setRecentItems] = useState<RepairPartCatalogItem[]>([]);

  useEffect(() => {
    if (!open || !repair) return;
    const normalized = mergeRepairParts(repair.partsUsed || []);
    setParts(normalized.length > 0 ? normalized : [emptyPart()]);
    setActiveCategory('all');
    setError('');
  }, [open, repair]);

  const estimatedTotal = useMemo(
    () => parts.reduce((sum, part) => sum + Number(part.plannedQuantity || 0) * Number(part.estimatedUnitCost || 0), 0),
    [parts],
  );
  const partsSummary = useMemo(() => buildPartsSummary(parts, estimatedTotal), [parts, estimatedTotal]);
  const visibleCategories = useMemo(
    () => (catalogMeta?.categories || []).filter((group) => activeCategory === 'all' || group.category === activeCategory),
    [catalogMeta, activeCategory],
  );
    const sourceTemplates = useMemo(() => {
      const source = repair?.source || '';
      return (catalogMeta?.sourceTemplates || []).filter((template) => {
        const scopes = template.appliesTo || ['all'];
        return scopes.includes('all') || (source ? scopes.includes(source as any) : false);
      });
    }, [catalogMeta, repair?.source]);

    useEffect(() => {
      if (!open) return;
      setRecentItems(loadRecentCatalogItems());
    }, [open, catalogMeta?.total]);

  function updatePart(index: number, patch: Partial<RepairPart>) {
    setParts((prev) => prev.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  }

  function addPart() {
    setParts((prev) => [...prev, emptyPart()]);
  }

  function removePart(index: number) {
    setParts((prev) => (prev.length === 1 ? [emptyPart()] : prev.filter((_, i) => i !== index)));
  }

  function applyCatalogItem(index: number, item: RepairPartCatalogItem) {
    updatePart(index, {
      catalogId: item.id,
      catalogName: item.name,
      catalogCategory: item.category,
      unit: item.unit,
      suggestedUnitCost: item.suggestedUnitCost,
      name: item.name,
      estimatedUnitCost: item.suggestedUnitCost,
      cost: item.suggestedUnitCost,
    });
  }

    function appendCatalogItem(item: RepairPartCatalogItem) {
      rememberCatalogItem(item);
      setRecentItems(loadRecentCatalogItems());
      setParts((prev) => mergeRepairParts([...prev, createPartFromCatalog(item)]));
    }

    function appendCatalogBundle(bundle: RepairPartCatalogBundle) {
      bundle.items.forEach((item) => {
        rememberCatalogItem({
          id: item.id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          suggestedUnitCost: item.suggestedUnitCost,
        });
      });
      setRecentItems(loadRecentCatalogItems());
      setParts((prev) =>
        mergeRepairParts([
          ...prev,
        ...bundle.items.map((item) =>
          normalizePart({
            ...createPartFromCatalog(item),
            plannedQuantity: item.quantity,
            quantity: item.quantity,
            estimatedUnitCost: item.suggestedUnitCost,
            cost: item.suggestedUnitCost,
          }),
        ),
      ]),
    );
  }

  async function handleSubmit() {
    const normalizedParts = mergeRepairParts(parts)
      .map(normalizePart)
      .filter((part) => (part.name.trim() || part.catalogName?.trim()) && Number(part.plannedQuantity || 0) > 0);
    if (normalizedParts.length === 0) {
      setError('Добавьте хотя бы одну запчасть для заказа.');
      return;
    }
    await onSubmit(normalizedParts);
  }

  return (
    <Dialog open={open} onClose={onClose} title="План закупки запчастей">
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-900">{repair?.description}</p>
          <p className="mt-1 text-xs text-neutral-500">Укажите, какие запчасти нужны, их количество и примерную стоимость.</p>
        </div>

        
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
          {transitionHint('plan')}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-neutral-700">Требуемые запчасти</label>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addPart}>
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </Button>
          </div>

          {catalogMeta && catalogMeta.total === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
              Справочник з/ч пока пустой. Он начнет наполняться из реальных заявок на ремонт по мере добавления запчастей в план и факт ремонта.
            </div>
          ) : null}

          {catalogMeta?.featured?.length ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Быстрые запчасти</p>
                <p className="text-xs text-neutral-400">{catalogMeta.total} позиций</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {catalogMeta.featured.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => appendCatalogItem(item)}
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-left text-xs font-medium text-neutral-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <span>{item.name}</span>
                    <span className="text-[11px] text-neutral-400">{item.category}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {recentItems.length ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Недавние позиции</p>
                <p className="text-xs text-neutral-400">Для ускоренного выбора</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentItems.map((item) => (
                  <button
                    key={`recent-${item.id}`}
                    type="button"
                    onClick={() => appendCatalogItem(item)}
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-neutral-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                  >
                    <span>{item.name}</span>
                    <span className="text-[11px] text-neutral-400">{item.category}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {sourceTemplates.length ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Шаблоны для этого ремонта</p>
                <p className="text-xs text-emerald-500">{sourceTemplates.length} наборов</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {sourceTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => appendCatalogBundle(template)}
                    className="rounded-lg border border-emerald-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{template.name}</p>
                        <p className="text-xs text-neutral-500">{template.description}</p>
                      </div>
                      <span className="text-[11px] font-medium text-emerald-700">{formatMoney(template.totalSuggestedCost)} ₴</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.items.slice(0, 4).map((item) => (
                        <span key={`${template.id}-${item.id}`} className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {catalogMeta?.bundles?.length ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Типовые наборы ТО</p>
                <p className="text-xs text-indigo-500">{catalogMeta.bundles.length} наборов</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogMeta.bundles.map((bundle) => (
                  <button
                    key={bundle.id}
                    type="button"
                    onClick={() => appendCatalogBundle(bundle)}
                    className="rounded-lg border border-indigo-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{bundle.name}</p>
                        <p className="text-xs text-neutral-500">{bundle.description}</p>
                      </div>
                      <span className="text-[11px] font-medium text-indigo-700">{formatMoney(bundle.totalSuggestedCost)} ₽</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bundle.items.slice(0, 4).map((item) => (
                        <span key={`${bundle.id}-${item.id}`} className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {catalogMeta?.categories?.length ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeCategory === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-neutral-200 bg-white text-neutral-600 hover:border-indigo-300 hover:text-indigo-700'
                  }`}
                >
                  Все категории
                </button>
                {catalogMeta.categories.map((group) => (
                  <button
                    key={group.category}
                    type="button"
                    onClick={() => setActiveCategory(group.category)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      activeCategory === group.category
                        ? 'bg-emerald-600 text-white'
                        : 'border border-neutral-200 bg-white text-neutral-600 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                  >
                    {group.category}
                  </button>
                ))}
              </div>
              {visibleCategories.map((group) => (
                <div key={group.category} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.category}</p>
                    <p className="text-xs text-neutral-400">{group.count}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => appendCatalogItem(item)}
                        className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-neutral-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <span>{item.name}</span>
                        <span className="text-[11px] text-neutral-400">{formatMoney(item.suggestedUnitCost)} ₽</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {parts.map((part, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_110px_140px_36px] gap-2">
              <div className="space-y-2">
                <CatalogPicker onSelect={(item) => applyCatalogItem(index, item)} />
                <Input
                  value={part.name}
                  onChange={(e) => updatePart(index, {
                    name: e.target.value,
                    catalogId: undefined,
                    catalogName: undefined,
                    catalogCategory: undefined,
                    unit: undefined,
                    suggestedUnitCost: undefined,
                  })}
                  placeholder="Название запчасти вручную"
                />
                {(part.catalogName || part.catalogCategory) && (
                  <p className="text-xs text-emerald-700">
                    Из каталога: {part.catalogName}
                    {part.catalogCategory ? ` · ${part.catalogCategory}` : ''}
                    {part.unit ? ` · ${part.unit}` : ''}
                  </p>
                )}
              </div>
              <Input
                type="number"
                min="1"
                value={part.plannedQuantity}
                onChange={(e) => updatePart(index, { plannedQuantity: Number(e.target.value) })}
                placeholder="Кол-во"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={part.estimatedUnitCost}
                onChange={(e) => updatePart(index, { estimatedUnitCost: Number(e.target.value) })}
                placeholder="Цена, ₽"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removePart(index)}>
                <Trash2 className="h-4 w-4 text-neutral-500" />
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-blue-700">План закупки</p>
              <p className="mt-1 text-lg font-bold text-blue-900">{formatMoney(partsSummary.plannedCost)} ₽</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-700">Позиции: {partsSummary.partCount}</p>
              <p className="text-xs text-blue-700">Кол-во: {partsSummary.plannedQuantity}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-blue-700">Ориентир на этапе заявки. После подтверждения поступления и закрытия ремонта появится фактическая стоимость.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">План</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{formatMoney(partsSummary.plannedCost)} ₽</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Получено</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{formatMoney(partsSummary.receivedCost)} ₽</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Кол-во</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">
              {partsSummary.receivedQuantity}/{partsSummary.plannedQuantity}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить и перевести
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReceivePartsDialog({
  repair,
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  repair: Repair | null;
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (partsUsed: RepairPart[]) => Promise<void>;
}) {
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !repair) return;
    setParts(mergeRepairParts(repair.partsUsed || []));
    setError('');
  }, [open, repair]);

  const partsSummary = useMemo(() => buildPartsSummary(parts), [parts]);

  function updatePart(index: number, patch: Partial<RepairPart>) {
    setParts((prev) => prev.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  }

  async function handleSubmit() {
    const normalized = mergeRepairParts(parts);
    if (!normalized.some((part) => part.received || Number(part.receivedQuantity || 0) > 0)) {
      setError('Подтвердите поступление хотя бы одной запчасти.');
      return;
    }
    await onSubmit(normalized);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Подтверждение поступления">
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-900">{repair?.description}</p>
          <p className="mt-1 text-xs text-neutral-500">Отметьте, какие запчасти реально приехали и по какой цене.</p>
        </div>

        
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          {transitionHint('receive')}
        </div>

        <div className="space-y-3">
          {parts.map((part, index) => (
            <div key={index} className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{partLabel(part)}</p>
                  <p className="text-xs text-neutral-500">План: {part.plannedQuantity || 0} {part.unit || 'шт'} · {formatMoney(Number(part.estimatedUnitCost || 0))} ₽</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={Boolean(part.received)}
                    onChange={(e) => updatePart(index, {
                      received: e.target.checked,
                      receivedQuantity: e.target.checked ? Number(part.receivedQuantity || part.plannedQuantity || 1) : 0,
                      actualUnitCost: e.target.checked ? Number(part.actualUnitCost || part.estimatedUnitCost || 0) : 0,
                    })}
                  />
                  Получено
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Фактически получено</label>
                  <Input
                    type="number"
                    min="0"
                    value={part.receivedQuantity}
                    onChange={(e) => updatePart(index, { receivedQuantity: Number(e.target.value), received: Number(e.target.value) > 0 })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Фактическая цена</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={part.actualUnitCost}
                    onChange={(e) => updatePart(index, { actualUnitCost: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Подтвердить и перевести
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CompleteRepairDialog({
  repair,
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  repair: Repair | null;
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { workDescription: string; partsUsed: RepairPart[]; totalCost?: number }) => Promise<void>;
}) {
  const [workDescription, setWorkDescription] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !repair) return;
    const normalized = mergeRepairParts(repair.partsUsed || []);
    setWorkDescription(repair.workDescription || '');
    setTotalCost(repair.totalCost ? String(repair.totalCost) : '');
    setParts(normalized);
    setError('');
  }, [open, repair]);

  const calculatedActualTotal = useMemo(
    () => parts.reduce((sum, part) => sum + Number(part.usedQuantity || 0) * Number(part.actualUnitCost || 0), 0),
    [parts],
  );
  const currentFactTotal = totalCost.trim() === '' ? calculatedActualTotal : Number(totalCost || 0);
  const repairSummary = useMemo(() => buildPartsSummary(parts, currentFactTotal), [parts, currentFactTotal]);

  function updatePart(index: number, patch: Partial<RepairPart>) {
    setParts((prev) => prev.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  }

  async function handleSubmit() {
    const normalizedParts = mergeRepairParts(parts);
    const normalizedCost = totalCost.trim() === '' ? undefined : Number(totalCost);
    if (!workDescription.trim()) {
      setError('Опишите выполненные работы.');
      return;
    }
    if (normalizedCost !== undefined && Number.isNaN(normalizedCost)) {
      setError('Укажите корректную итоговую сумму.');
      return;
    }
    const hasUsedParts = normalizedParts.some((part) => Number(part.usedQuantity || 0) > 0);
    const resolvedCost = normalizedCost ?? calculatedActualTotal;
    if (!hasUsedParts && Number(resolvedCost || 0) <= 0) {
      setError('Укажите использованные запчасти или итоговую стоимость ремонта.');
      return;
    }
    await onSubmit({
      workDescription: workDescription.trim(),
      partsUsed: normalizedParts,
      totalCost: normalizedCost,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Закрытие ремонта">
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-900">{repair?.description}</p>
          <p className="mt-1 text-xs text-neutral-500">Зафиксируйте работы и фактически использованные запчасти.</p>
        </div>

        
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800">
          {transitionHint('done')}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-700">Выполненные работы</label>
          <textarea
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Например: замена шины, замена ремня, проверка крепежа"
          />
        </div>

        <div className="space-y-3">
          {parts.map((part, index) => (
            <div key={index} className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-3">
                <p className="text-sm font-medium text-neutral-900">{partLabel(part)}</p>
                <p className="text-xs text-neutral-500">Получено: {part.receivedQuantity || 0} {part.unit || 'шт'} · {formatMoney(Number(part.actualUnitCost || 0))} ₽</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Использовано</label>
                  <Input
                    type="number"
                    min="0"
                    value={part.usedQuantity}
                    onChange={(e) => updatePart(index, { usedQuantity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Цена за единицу</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={part.actualUnitCost}
                    onChange={(e) => updatePart(index, { actualUnitCost: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">План</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{formatMoney(repairSummary.plannedCost)} ₽</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Факт</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{formatMoney(repairSummary.factCost)} ₽</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Отклонение</p>
            <p className={`mt-1 text-sm font-semibold ${repairSummary.variance >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {repairSummary.variance >= 0 ? '+' : ''}
              {formatMoney(Math.abs(repairSummary.variance))} ₽
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">Итоговая сумма ремонта</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="Если пусто, возьмем сумму по использованным запчастям"
            />
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Попадает в финансы</p>
            <p className="mt-1 text-lg font-bold text-emerald-900">{formatMoney(totalCost.trim() === '' ? calculatedActualTotal : Number(totalCost || 0))} ₽</p>
            <p className="mt-1 text-xs text-emerald-700">Эта сумма станет фактической стоимостью ремонта.</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Завершить ремонт
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function RepairKanban({
  onStatusChange,
  catalogRefreshKey,
  onCreateRequest,
}: {
  onStatusChange: () => void;
  catalogRefreshKey?: number;
  onCreateRequest?: () => void;
}) {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [transition, setTransition] = useState<{ repairId: string; targetStatus: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [catalogMeta, setCatalogMeta] = useState<RepairPartCatalogMeta | null>(null);

  const selectedRepair = repairs.find((repair) => repair.id === transition?.repairId) || null;
  const columnSummaries = useMemo(() => {
    const summaries: Record<string, RepairPartsSummary> = {};
    for (const column of COLUMNS) {
      summaries[column.status] = emptyPartsSummary();
    }

    for (const repair of repairs) {
      const summary = repair.partsSummary ?? buildPartsSummary(repair.partsUsed || [], repair.totalCost);
      summaries[repair.status] = mergePartsSummary(summaries[repair.status] || emptyPartsSummary(), summary);
    }

    return summaries;
  }, [repairs]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    void loadRepairs();
    void loadCatalogMeta();
  }, [catalogRefreshKey]);

  async function loadRepairs() {
    setLoading(true);
    try {
      const result = await api.get<any>('/repairs?limit=100');
      setRepairs((result.data || []).map((repair: Repair) => ({
        ...repair,
        partsUsed: (repair.partsUsed || []).map(normalizePart),
      })));
    } catch (err) {
      console.error('Failed to load repairs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalogMeta() {
    try {
      const result = await api.get<{ data: RepairPartCatalogMeta }>('/repairs/parts/catalog/meta');
      setCatalogMeta(result.data || null);
    } catch (err) {
      console.error('Failed to load repair parts catalog meta:', err);
    }
  }

  async function changeStatus(repairId: string, newStatus: string) {
    await api.put<any>(`/repairs/${repairId}/status`, { status: newStatus });
  }

  async function updateRepair(repairId: string, payload: Record<string, unknown>) {
    await api.put<any>(`/repairs/${repairId}`, payload);
  }

  async function refreshBoard(successMessage?: string) {
    await loadRepairs();
    onStatusChange();
    if (successMessage) setToast({ message: successMessage, type: 'success' });
  }

  function handleMove(repairId: string, _fromCol: string, toCol: string) {
    const repair = repairs.find((item) => item.id === repairId);
    if (!repair || repair.status === toCol) return;

    // All gated transitions open the appropriate transition dialog.
    if (
      (repair.status === 'created' && toCol === 'waiting_parts')
      || (repair.status === 'waiting_parts' && toCol === 'in_progress')
      || (repair.status === 'in_progress' && toCol === 'done')
    ) {
      setTransition({ repairId: repair.id, targetStatus: toCol });
      return;
    }

    void (async () => {
      try {
        await changeStatus(repair.id, toCol);
        await refreshBoard('Статус ремонта обновлен.');
      } catch (err: any) {
        setToast({ message: `Ошибка: ${err.message}`, type: 'error' });
      }
    })();
  }

  function canMove(repairId: string, _fromCol: string, toCol: string): boolean {
    const repair = repairs.find((item) => item.id === repairId);
    if (!repair) return false;
    const allowed = REPAIR_STATE_TRANSITIONS[repair.status] || [];
    return allowed.includes(toCol);
  }

  function handleMoveReject(repairId: string, _fromCol: string, toCol: string) {
    const repair = repairs.find((item) => item.id === repairId);
    if (!repair) return;
    setToast({ message: `Нельзя перевести заявку из статуса "${repair.status}" в "${toCol}"`, type: 'error' });
  }

  async function handlePlanParts(partsUsed: RepairPart[]) {
    if (!selectedRepair) return;
    setSubmitting(true);
    try {
      await updateRepair(selectedRepair.id, { partsUsed });
      await changeStatus(selectedRepair.id, 'waiting_parts');
      setTransition(null);
      await refreshBoard('Запчасти запланированы, заявка переведена в ожидание.');
    } catch (err: any) {
      setToast({ message: `Ошибка: ${err.message}`, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReceiveParts(partsUsed: RepairPart[]) {
    if (!selectedRepair) return;
    setSubmitting(true);
    try {
      await updateRepair(selectedRepair.id, { partsUsed });
      await changeStatus(selectedRepair.id, 'in_progress');
      setTransition(null);
      await refreshBoard('Поступление подтверждено, ремонт взят в работу.');
    } catch (err: any) {
      setToast({ message: `Ошибка: ${err.message}`, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteRepair(payload: { workDescription: string; partsUsed: RepairPart[]; totalCost?: number }) {
    if (!selectedRepair) return;
    setSubmitting(true);
    try {
      await updateRepair(selectedRepair.id, payload);
      await changeStatus(selectedRepair.id, 'done');
      setTransition(null);
      await refreshBoard('Ремонт завершен, фактические затраты сохранены.');
    } catch (err: any) {
      setToast({ message: `Ошибка: ${err.message}`, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      <PlanPartsDialog
        repair={transition?.targetStatus === 'waiting_parts' ? selectedRepair : null}
        open={transition?.targetStatus === 'waiting_parts'}
        submitting={submitting}
        onClose={() => setTransition(null)}
        onSubmit={handlePlanParts}
        catalogMeta={catalogMeta}
      />

      <ReceivePartsDialog
        repair={transition?.targetStatus === 'in_progress' ? selectedRepair : null}
        open={transition?.targetStatus === 'in_progress'}
        submitting={submitting}
        onClose={() => setTransition(null)}
        onSubmit={handleReceiveParts}
      />

      <CompleteRepairDialog
        repair={transition?.targetStatus === 'done' ? selectedRepair : null}
        open={transition?.targetStatus === 'done'}
        submitting={submitting}
        onClose={() => setTransition(null)}
        onSubmit={handleCompleteRepair}
      />

      <KanbanBoard onMove={handleMove} canMove={canMove} onMoveReject={handleMoveReject}>
        {COLUMNS.map((column) => {
          const columnRepairs = repairs.filter((repair) => repair.status === column.status);
          const colSummary = columnSummaries[column.status];

          const emptyAction = column.status === 'created' && onCreateRequest ? (
            <Button
              variant="brand"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={onCreateRequest}
            >
              Новая заявка
            </Button>
          ) : undefined;

          return (
            <KanbanColumn
              key={column.status}
              id={column.status}
              title={column.label}
              tone={column.tone}
              count={columnRepairs.length}
              onQuickAdd={column.status === 'created' ? onCreateRequest : undefined}
              emptyState={
                <EmptyState
                  icon={column.emptyIcon}
                  title="Нет заявок"
                  description={column.emptyDescription}
                  tone={column.emptyTone}
                  className="min-h-[160px] py-6 px-3 bg-transparent border-0"
                  action={emptyAction}
                />
              }
            >
              {colSummary && colSummary.partCount > 0 ? (
                <div className="flex flex-wrap gap-1 px-1 pb-1">
                  <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                    План {formatMoney(colSummary.plannedCost)} ₽
                  </span>
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    Факт {formatMoney(colSummary.factCost)} ₽
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colSummary.variance >= 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    Δ {colSummary.variance >= 0 ? '+' : ''}{formatMoney(Math.abs(colSummary.variance))} ₽
                  </span>
                </div>
              ) : null}
              {columnRepairs.map((repair) => (
                <KanbanCard key={repair.id} id={repair.id} fromCol={column.status}>
                  <RepairCard repair={repair} />
                </KanbanCard>
              ))}
            </KanbanColumn>
          );
        })}
      </KanbanBoard>
    </>
  );
}

