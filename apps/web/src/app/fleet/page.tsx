'use client';
import {
    AlertTriangle,
    Building2,
    Container,
    Fuel,
    Gauge,
    PauseCircle,
    ShieldCheck,
    Truck,
    Users,
    Wrench,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContractorsTable } from './components/ContractorsTable';
import { DowntimeRecordsTable } from './components/DowntimeRecordsTable';
import { DriversTable } from './components/DriversTable';
import { FinesTable } from './components/FinesTable';
import { FuelRecordsTable } from './components/FuelRecordsTable';
import { MaintenanceScheduleTable } from './components/MaintenanceScheduleTable';
import { OdometerHistoryTable } from './components/OdometerHistoryTable';
import { PermitsTable } from './components/PermitsTable';
import { TrailersTable } from './components/TrailersTable';
import { VehiclesTable } from './components/VehiclesTable';

const tabs = [
    { id: 'vehicles', label: 'Транспорт', icon: Truck },
    { id: 'drivers', label: 'Водители', icon: Users },
    { id: 'permits', label: 'Пропуска', icon: ShieldCheck },
    { id: 'fines', label: 'Штрафы', icon: AlertTriangle },
    { id: 'contractors', label: 'Контрагенты', icon: Building2 },
    { id: 'trailers', label: 'Прицепы', icon: Container },
    { id: 'fuel', label: 'Топливо', icon: Fuel },
    { id: 'odometer', label: 'Одометр', icon: Gauge },
    { id: 'downtime', label: 'Простои', icon: PauseCircle },
    { id: 'maintenance', label: 'План ТО', icon: Wrench },
] as const;

export default function FleetPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Автопарк</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Управление транспортом, водителями, документами, топливом и эксплуатацией парка
                    </p>
                </div>
            </div>

            <Tabs defaultValue="vehicles" className="w-full">
                <TabsList className="mb-4 flex h-auto flex-wrap">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <TabsContent value="vehicles" className="m-0"><VehiclesTable /></TabsContent>
                    <TabsContent value="drivers" className="m-0"><DriversTable /></TabsContent>
                    <TabsContent value="permits" className="m-0"><PermitsTable /></TabsContent>
                    <TabsContent value="fines" className="m-0"><FinesTable /></TabsContent>
                    <TabsContent value="contractors" className="m-0"><ContractorsTable /></TabsContent>
                    <TabsContent value="trailers" className="m-0"><TrailersTable /></TabsContent>
                    <TabsContent value="fuel" className="m-0"><FuelRecordsTable /></TabsContent>
                    <TabsContent value="odometer" className="m-0"><OdometerHistoryTable /></TabsContent>
                    <TabsContent value="downtime" className="m-0"><DowntimeRecordsTable /></TabsContent>
                    <TabsContent value="maintenance" className="m-0"><MaintenanceScheduleTable /></TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
