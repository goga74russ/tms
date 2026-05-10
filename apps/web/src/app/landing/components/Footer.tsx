import Link from 'next/link';

export function Footer() {
    return (
        <footer className="bg-slate-900 text-slate-300">
            <div className="max-w-6xl mx-auto px-6 py-14">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
                    <div>
                        <div className="font-bold text-white text-lg mb-3">TMS</div>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Транспортная управляющая система для российских перевозчиков и логистических операторов.
                        </p>
                    </div>

                    <div>
                        <div className="text-sm font-semibold text-white mb-3">Продукт</div>
                        <ul className="space-y-2 text-sm">
                            <li><a href="#pricing" className="hover:text-white">Тарифы</a></li>
                            <li><Link href="/signup" className="hover:text-white">Начать бесплатно</Link></li>
                            <li><Link href="/login" className="hover:text-white">Войти</Link></li>
                        </ul>
                    </div>

                    <div>
                        <div className="text-sm font-semibold text-white mb-3">Документы</div>
                        <ul className="space-y-2 text-sm">
                            <li><Link href="/legal/privacy" className="hover:text-white">Политика конфиденциальности</Link></li>
                            <li><Link href="/legal/terms" className="hover:text-white">Условия использования</Link></li>
                            <li><Link href="/legal/personal-data" className="hover:text-white">Согласие на обработку ПД</Link></li>
                        </ul>
                    </div>

                    <div>
                        <div className="text-sm font-semibold text-white mb-3">Контакты</div>
                        <ul className="space-y-2 text-sm">
                            <li><a href="mailto:support@tms-prod.ru" className="hover:text-white">support@tms-prod.ru</a></li>
                            <li><a href="mailto:sales@tms-prod.ru" className="hover:text-white">sales@tms-prod.ru</a></li>
                            <li className="text-slate-400">ИНН 0000000000 (placeholder)</li>
                            <li className="text-slate-400">ОГРН 0000000000000 (placeholder)</li>
                        </ul>
                    </div>
                </div>

                <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-slate-500">
                    <div>© {new Date().getFullYear()} TMS-prod. Все права защищены.</div>
                    <div>Сделано в России. Серверы в РФ. Соответствие 152-ФЗ.</div>
                </div>
            </div>
        </footer>
    );
}
