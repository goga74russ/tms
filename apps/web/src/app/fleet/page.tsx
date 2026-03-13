'use client';

import { useState } from 'react';
import { Truck, Users, ShieldCheck, AlertTriangle, Building2, Container } from 'lucide-react';
import { VehiclesTable } from './components/VehiclesTable';
import { DriversTable } from './components/DriversTable';
import { PermitsTable } from './components/PermitsTable';
import { FinesTable } from './components/FinesTable';
import { ContractorsTable } from './components/ContractorsTable';
import { TrailersTable } from './components/TrailersTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const tabs = [
    { id: 'vehicles', label: 'Транспорт', icon: Truck },
    { id: 'drivers', label: 'Водители', icon: Users },
    { id: 'permits', label: 'Пропуска', icon: ShieldCheck },
    { id: 'fines', label: 'Штрафы', icon: AlertTriangle },
    { id: 'contractors', label: 'Контрагенты', icon: Building2 },
    { id: 'trailers', label: 'Прицепы', icon: Container },
] as const;

type TabId = typeof tabs[number]['id'];

export default function FleetPage() {
    const [activeTab, setActiveTab] = useState<TabId>('vehicles');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Автопарк</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Управление транспортом, водителями, пропусками и штрафами
                    </p>
                </div>
            </div>

            {/* Tabs & Content */}
            <Tabs defaultValue="vehicles" className="w-full" onValueChange={(val) => setActiveTab(val as TabId)}>
                <TabsList className="mb-4">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                    <TabsContent value="vehicles" className="m-0"><VehiclesTable /></TabsContent>
                    <TabsContent value="drivers" className="m-0"><DriversTable /></TabsContent>
                    <TabsContent value="permits" className="m-0"><PermitsTable /></TabsContent>
                    <TabsContent value="fines" className="m-0"><FinesTable /></TabsContent>
                    <TabsContent value="contractors" className="m-0"><ContractorsTable /></TabsContent>
                    <TabsContent value="trailers" className="m-0"><TrailersTable /></TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
