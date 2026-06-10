'use client';

import { Camera, User, Wrench } from 'lucide-react';
import { PRIORITY_LABELS, REPAIR_SOURCE_LABELS, label } from '@tms/shared';

// Round 5 audit v3: category labels/tones mirror those in repair/page.tsx.
// Kept local to avoid a circular dep with the page module; if a shared
// constants file appears later both copies should source from it.
const REPAIR_CATEGORY_LABEL_LOCAL: Record<string, string> = {
  engine: 'Двигатель',
  transmission: 'Трансмиссия',
  brakes: 'Тормозная система',
  electrical: 'Электрика',
  body: 'Кузов',
  tires: 'Шины и колёса',
  other: 'Прочее',
};

const REPAIR_CATEGORY_PILL_LOCAL: Record<string, string> = {
  engine: 'bg-red-50 text-red-700 border-red-100',
  transmission: 'bg-amber-50 text-amber-700 border-amber-100',
  brakes: 'bg-rose-50 text-rose-700 border-rose-100',
  electrical: 'bg-sky-50 text-sky-700 border-sky-100',
  body: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  tires: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  other: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

interface Repair {
  id: string;
  vehicleId: string;
  status: string;
  description: string;
  priority: string;
  source: string;
  assignedTo?: string;
  assignedToName?: string;
  category?: string;
  totalCost: number | string;
  createdAt: string;
  photoUrls: string[];
  partsUsed?: Array<{
    name?: string;
    catalogName?: string;
    catalogCategory?: string;
    unit?: string;
    plannedQuantity?: number;
    received?: boolean;
    receivedQuantity?: number;
    usedQuantity?: number;
  }>;
  partsSummary?: RepairPartsSummary;
}

type RepairPartsSummary = {
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
};

// Styling only — label text sourced from canon PRIORITY_LABELS.
const priorityPill: Record<string, { color: string; dot: string }> = {
  low: { color: 'bg-neutral-100 text-neutral-600', dot: 'bg-neutral-400' },
  medium: { color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  high: { color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  critical: { color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatMoney(value: number | string) {
  return Number(value).toLocaleString('ru-RU') + ' ₽';
}

function buildPartsSummary(repair: Repair) {
  const parts = repair.partsUsed || [];
  const existing = repair.partsSummary;
  if (existing) return existing;

  const summary = parts.reduce<RepairPartsSummary>(
    (acc, part) => {
      const planned = Number(part.plannedQuantity || 0);
      const received = Number(part.receivedQuantity || 0);
      const used = Number(part.usedQuantity || 0);
      const estimatedUnitCost = Number((part as any).estimatedUnitCost || 0);
      const actualUnitCost = Number((part as any).actualUnitCost || estimatedUnitCost || 0);

      acc.partCount += 1;
      acc.plannedQuantity += planned;
      acc.receivedQuantity += received;
      acc.usedQuantity += used;
      acc.plannedCost += planned * estimatedUnitCost;
      acc.receivedCost += received * actualUnitCost;
      acc.usedCost += used * actualUnitCost;
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
      factCost: Number(repair.totalCost) > 0 ? Number(repair.totalCost) : 0,
      variance: 0,
      variancePercent: 0,
      plannedRate: 0,
      receivedRate: 0,
      usedRate: 0,
    },
  );
  summary.factCost = Number(repair.totalCost) > 0 ? Number(repair.totalCost) : (summary.usedCost > 0 ? summary.usedCost : summary.receivedCost);
  summary.variance = summary.factCost - summary.plannedCost;
  summary.variancePercent = summary.plannedCost > 0 ? (summary.variance / summary.plannedCost) * 100 : 0;
  summary.plannedRate = summary.plannedQuantity > 0 ? summary.plannedQuantity : 0;
  summary.receivedRate = summary.plannedQuantity > 0 ? summary.receivedQuantity / summary.plannedQuantity : 0;
  summary.usedRate = summary.plannedQuantity > 0 ? summary.usedQuantity / summary.plannedQuantity : 0;
  return summary;
}

function formatPartSummary(part: NonNullable<Repair['partsUsed']>[number]) {
  const planned = Number(part.plannedQuantity || 0);
  const received = Number(part.receivedQuantity || 0);
  const used = Number(part.usedQuantity || 0);
  const unit = part.unit || 'шт';
  return `${planned} план · ${received} получ · ${used} исп · ${unit}`;
}

export function RepairCard({ repair }: { repair: Repair }) {
  const pr = priorityPill[repair.priority] || priorityPill.medium;
  const parts = repair.partsUsed || [];
  const summary = buildPartsSummary(repair);

  const categoryKey = repair.category || '';
  const categoryLabel = categoryKey ? (REPAIR_CATEGORY_LABEL_LOCAL[categoryKey] || categoryKey) : null;
  const categoryPillClass = REPAIR_CATEGORY_PILL_LOCAL[categoryKey] || 'bg-neutral-100 text-neutral-600 border-neutral-200';
  const assignedLabel = repair.assignedToName || repair.assignedTo;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pr.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${pr.dot}`} />
          {label(PRIORITY_LABELS, repair.priority)}
        </span>
        <span className="text-xs text-neutral-400">{label(REPAIR_SOURCE_LABELS, repair.source)}</span>
      </div>

      {categoryLabel && (
        <div className="mb-2">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${categoryPillClass}`}>
            {categoryLabel}
          </span>
        </div>
      )}

      <p className="mb-2 line-clamp-2 text-sm font-medium text-neutral-800">{repair.description}</p>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {assignedLabel ? (
              <span className="text-neutral-600">{assignedLabel}</span>
            ) : (
              <span className="text-neutral-400">Не назначен</span>
            )}
          </span>
          {repair.photoUrls.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Camera className="h-3 w-3" />
              {repair.photoUrls.length}
            </span>
          )}
        </div>
        <span>{formatDate(repair.createdAt)}</span>
      </div>

      {parts.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">План</p>
              <p className="mt-0.5 text-[11px] font-semibold text-neutral-900">{formatMoney(summary.plannedCost)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-emerald-700">Факт</p>
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-900">{formatMoney(summary.factCost)}</p>
            </div>
            <div className={`rounded-lg border px-2 py-1.5 ${summary.variance >= 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className={`text-[10px] uppercase tracking-wide ${summary.variance >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Δ</p>
              <p className={`mt-0.5 text-[11px] font-semibold ${summary.variance >= 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                {summary.variance >= 0 ? '+' : ''}
                {formatMoney(Math.abs(summary.variance))}
              </p>
              <p className={`text-[10px] ${summary.variance >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {summary.variancePercent >= 0 ? '+' : ''}{summary.variancePercent.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              З/ч: {parts.length}
            </span>
            {parts.slice(0, 3).map((part, index) => (
              <span
                key={`${part.catalogName || part.name || 'part'}-${index}`}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
              >
                {part.catalogName || part.name}
              </span>
            ))}
            {parts.length > 3 && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                +{parts.length - 3}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parts.slice(0, 2).map((part, index) => (
              <span
                key={`qty-${part.catalogName || part.name || 'part'}-${index}`}
                className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600"
              >
                {formatPartSummary(part)}
                {part.catalogCategory ? ` · ${part.catalogCategory}` : ''}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-neutral-500">
            <span className="rounded-full bg-neutral-50 px-2 py-0.5">План: {summary.plannedQuantity}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Получено: {summary.receivedQuantity}</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">Использовано: {summary.usedQuantity}</span>
            <span className="rounded-full bg-neutral-50 px-2 py-0.5">
              Выполнено: {summary.plannedQuantity > 0 ? `${(summary.usedRate * 100).toFixed(0)}%` : '0%'}
            </span>
          </div>
        </div>
      )}

      {Number(repair.totalCost) > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Wrench className="h-3 w-3" />
            Затраты
          </span>
          <span className="text-xs font-semibold text-neutral-700">{formatMoney(repair.totalCost)}</span>
        </div>
      )}
    </div>
  );
}
