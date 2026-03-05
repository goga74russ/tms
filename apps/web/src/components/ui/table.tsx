import * as React from "react";

function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
    return <div className="relative w-full overflow-auto"><table className={`w-full caption-bottom text-sm ${className || ''}`} {...props} /></div>;
}
function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead className={`[&_tr]:border-b ${className || ''}`} {...props} />;
}
function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody className={`[&_tr:last-child]:border-0 ${className || ''}`} {...props} />;
}
function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
    return <tr className={`border-b border-slate-200 transition-colors hover:bg-slate-50/50 data-[state=selected]:bg-slate-100 ${className || ''}`} {...props} />;
}
function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
    return <th className={`h-10 px-4 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0 ${className || ''}`} {...props} />;
}
function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
    return <td className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 ${className || ''}`} {...props} />;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
