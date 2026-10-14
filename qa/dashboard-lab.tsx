/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic Axios adapter covers heterogeneous API responses; never shipped. */
import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardsPage } from '@/features/dashboard';
import { newChart } from '@/features/item';
import { http, httpAuth } from '@/shared/api/client';
import { session } from '@/shared/api/session';
import i18n from '@/shared/lib/i18n';
import '@/app/styles.css';

if (!import.meta.env.DEV) throw new Error('QA fixture is development-only');
await i18n.changeLanguage('en');
session.set({ access: 'qa.' + btoa(JSON.stringify({ user_id: 'qa-user', tables: [{ table_slug: 'employees', object_id: 'employee-1' }] })) + '.synthetic', refresh: 'synthetic-only', environmentId: 'qa-env', projectId: 'qa-project', userId: 'qa-user' });
session.setProfile({ name: 'Synthetic analyst', role: 'ANALYST', company: 'QA' });
session.setPermissions({ events: { read: true }, employees: { read: true }, confidential: { read: false } });
const fields = [
  { id: 'time', slug: 'time', label: 'Time', type: 'DATE_TIME' },
  { id: 'event', slug: 'event', label: 'Event', type: 'SINGLE_LINE' },
  { id: 'stage', slug: 'stage', label: 'Status', type: 'STATUS', attributes: { todo: { options: [{ value: 'New', color: '#2383e2' }] }, progress: { options: [{ value: 'Working', color: '#efaa3a' }] }, complete: { options: [{ value: 'Done', color: '#38b26a' }] } } },
  { id: 'who', slug: 'employees_id', label: 'Person', type: 'LOOKUP', relation_field: 'rel-employees' },
  { id: 'amount', slug: 'amount', label: 'Amount', type: 'NUMBER' },
  { id: 'latitude', slug: 'latitude', label: 'Latitude', type: 'NUMBER' },
  { id: 'longitude', slug: 'longitude', label: 'Longitude', type: 'NUMBER' },
  { id: 'quantity', slug: 'quantity', label: 'Quantity', type: 'NUMBER' },
  { id: 'currency', slug: 'currency', label: 'Currency', type: 'SINGLE_LINE' },
  { id: 'secret', slug: 'private_amount', label: 'Private amount', type: 'NUMBER' },
  { id: 'password', slug: 'password', label: 'Password', type: 'PASSWORD' },
];
const employees = [{ guid: 'employee-1', full_name: 'Aziza Karimova' }, { guid: 'employee-2', full_name: 'Rustam Aliyev' }];
const relation = { id: 'rel-employees', type: 'Many2One', table_from: { id: 'table-events', slug: 'events' }, table_to: { id: 'table-employees', slug: 'employees', label: 'People' }, field_from: 'employees_id', view_fields: [{ id: 'name', slug: 'full_name', type: 'SINGLE_LINE', table_id: 'table-employees' }] };
const rows = Array.from({ length: 2001 }, (_, n) => ({ guid: `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`, time: `2026-10-${String(n % 12 + 1).padStart(2, '0')}T${String(n % 24).padStart(2, '0')}:00:00Z`, event: `Synthetic event ${n + 1}`, stage: ['New', 'Working', 'Done'][n % 3], employees_id: employees[n % 2].guid, employees_id_data: [employees[n % 2]], amount: n % 100 + 1, latitude: n === 0 ? 95 : 40 + (n % 10) / 10, longitude: 69 + (n % 10) / 10, quantity: n % 20 + 1, currency: n % 2 ? 'UZS' : 'USD', private_amount: 999999, password: 'SYNTHETIC-DO-NOT-RENDER' }));
const widget = (patch: object) => ({ ...newChart(), table_slug: 'events', filters: {}, answers: { period: { field: 'time' }, employees: { field: 'employees_id' } }, ...patch });
const initial = { folders: [{ id: 'folder', module_id: 'crm', title: 'Sales', dashboards: [{ id: 'overview', title: 'Sales overview', emoji: '📊', description: 'Synthetic data. All API calls are intercepted locally.', filters: [{ kind: 'period', label: 'Date' }, { kind: 'record', label: 'Person', table: 'employees', source_table: 'events', source_field: 'employees_id' }], widgets: [widget({ id: 'table', widget_type: 'records', title: 'Recent events', columns: ['time', 'event', 'stage', 'employees_id', 'amount'], sorts: [{ field: 'time', direction: 'desc' }], width: 12, height: 2, page_size: 20 }), widget({ id: 'count', kind: 'stat', title: 'Record count', width: 3 }), widget({ id: 'revenue', kind: 'stat', title: 'Revenue by currency', aggregation: 'sum', value_slug: 'amount', currency_slug: 'currency', width: 3 }), widget({ id: 'bar', kind: 'bar', title: 'Current stage distribution', group_slug: 'stage', width: 6 }), widget({ id: 'hidden', kind: 'stat', title: 'Hidden field widget', aggregation: 'sum', value_slug: 'private_amount', width: 3 })] }] }] };
let tree = JSON.parse(localStorage.getItem('omni4.qa.tree') || 'null') || initial;
let failure = false, saveFailure = false;
const store = () => ({ id: 'store', label: 'Dashboards', type: 'LINK', attributes: { screen: 'dashboards', dashboards: tree }, data: { permission: { read: true, update: true } } });
const compare = (a: unknown, b: unknown) => typeof a === 'number' ? a - Number(b) : String(a).localeCompare(String(b));
type RequestEntry = { id: number; at: string; method: string; path: string; table: string | null; fields: string[]; deniedTable: boolean };
let requestTrace: RequestEntry[] = [], traceRevision = 0;
const traceListeners = new Set<() => void>();
const traceSnapshot = () => traceRevision;
const subscribeTrace = (listener: () => void) => { traceListeners.add(listener); return () => { traceListeners.delete(listener); }; };
const notifyTrace = () => { traceRevision++; traceListeners.forEach((listener) => listener()); };
const recordRequest = (config: any, payload: any): RequestEntry => {
  const path = String(config.url).split('?')[0];
  const table = /^\/v2\/(?:collections|fields|relations|object\/get-list)\/([^/]+)(?:\/|$)/.exec(path)?.[1] ?? null;
  const query = path.startsWith('/v2/object/get-list/') ? payload?.data ?? {} : {};
  const fields = [...new Set([...Object.keys(query).filter((key) => !['limit', 'offset', 'order', 'with_relations', 'search'].includes(key)), ...Object.keys(query.order ?? {})])].sort();
  const entry: RequestEntry = { id: requestTrace.length + 1, at: new Date().toISOString(), method: String(config.method ?? 'get').toUpperCase(), path, table, fields, deniedTable: Boolean(table && !['events', 'employees'].includes(table)) };
  requestTrace = [...requestTrace, entry]; notifyTrace(); return entry;
};
function RequestTrace() {
  useSyncExternalStore(subscribeTrace, traceSnapshot);
  const denied = requestTrace.filter((request) => request.deniedTable).length;
  return <details className="max-h-64 shrink-0 overflow-auto border-b border-border px-4 py-1 text-xs"><summary className="cursor-pointer">API request trace: {requestTrace.length} requests · denied-table attempts: {denied}</summary><p className="mt-1 text-fg-muted">Development fixture only. Method, path, table and requested field names are recorded; headers, credentials, values and responses are omitted. Clear the trace before a scenario to measure its requests.</p><button type="button" className="my-2 rounded border border-border px-2 py-1" onClick={() => { requestTrace = []; notifyTrace(); }}>Clear request trace</button><textarea readOnly aria-label="Synthetic API request trace" value={JSON.stringify(requestTrace, null, 2)} className="h-40 w-full rounded border border-border bg-surface p-2 font-mono text-2xs" /></details>;
}
const adapter = async (config: any) => {
  const url = String(config.url), method = config.method;
  const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  const trace = recordRequest(config, payload);
  if (trace.deniedTable) throw new Error(`Blocked forbidden QA table request: ${trace.table}`);
  let data: any;
  if (url === '/v3/menus' && method === 'put') { if (saveFailure) throw new Error('Synthetic save interruption'); tree = payload.attributes.dashboards; localStorage.setItem('omni4.qa.tree', JSON.stringify(tree)); data = store(); }
  else if (url === '/v3/menus/store') data = store();
  else if (url === '/v3/menus') data = { menus: [{ id: 'crm', label: 'CRM', type: 'FOLDER', attributes: { is_tab: true }, data: { permission: { read: true, update: true } } }, store()] };
  else if (url.startsWith('/v1/company-project/')) data = { language: [{ short_name: 'en', name: 'English' }] };
  else if (url === '/v2/collections') data = { tables: [{ id: 'table-events', slug: 'events', label: 'Events' }, { id: 'table-employees', slug: 'employees', label: 'People' }, { id: 'table-secret', slug: 'confidential', label: 'Confidential' }] };
  else if (url.startsWith('/v2/collections/') && url.includes('/layout/')) data = { tabs: [{ type: 'section', sections: [{ fields: (url.includes('/events/') ? fields : [{ slug: 'full_name' }]).map((f) => ({ slug: f.slug, attributes: { field_permission: { view_permission: f.slug !== 'private_amount', edit_permission: false } } })) }] }] };
  else if (url === '/v2/fields/events') data = { fields };
  else if (url === '/v2/fields/employees') data = { fields: [{ id: 'name', slug: 'full_name', label: 'Name', type: 'SINGLE_LINE' }] };
  else if (url.startsWith('/v2/relations/events')) data = url.includes('/rel-employees') ? relation : { relations: [relation] };
  else if (url.startsWith('/v2/relations/employees')) data = { relations: [] };
  else if (url.startsWith('/v2/object/get-list/')) {
    if (failure) throw new Error('Synthetic network interruption');
    const slug = url.split('/').at(-1), query = payload.data;
    let found = (slug === 'events' ? rows : employees).filter((row: any) => Object.entries(query).every(([field, value]: any) => {
      if (['limit', 'offset', 'order', 'with_relations', 'search'].includes(field)) return true;
      if (Array.isArray(value)) return value.includes(String(row[field]));
      if (value && typeof value === 'object') return Object.entries(value).every(([operator, bound]) => { const c = compare(row[field], bound); return operator === '$gte' ? c >= 0 : operator === '$lte' ? c <= 0 : operator === '$gt' ? c > 0 : c < 0; });
      return String(row[field] ?? '').toLowerCase().includes(String(value).toLowerCase());
    }));
    if (query.order) found = [...found].sort((a: any, b: any) => { for (const [field, direction] of Object.entries(query.order)) { const c = compare(a[field], b[field]); if (c) return direction === 1 ? c : -c; } return 0; });
    data = { data: { count: found.length, response: found.slice(query.offset, query.offset + query.limit) } };
  } else throw new Error(`Blocked unexpected QA request: ${method} ${url}`);
  return { config, status: 200, statusText: 'OK', headers: {}, data };
};
http.defaults.adapter = adapter; httpAuth.defaults.adapter = async (config) => { recordRequest(config, undefined); throw new Error('Authentication is disabled in this synthetic fixture'); };
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
function Lab() {
 const [id, setId] = useState('overview'), [values, setValues] = useState<Record<string, string[]>>({}), [dark, setDark] = useState(false);
 return <QueryClientProvider client={queryClient}><div className={dark ? 'dark flex h-screen flex-col bg-surface text-fg' : 'flex h-screen flex-col bg-surface text-fg'}><div className="flex gap-3 border-b border-border px-4 py-2 text-xs"><strong>Synthetic QA · 2,001 records · external requests blocked</strong><button onClick={() => setDark(!dark)}>Theme</button><button onClick={() => { failure = !failure; void queryClient.invalidateQueries(); }}>Toggle interruption</button><button onClick={() => { saveFailure = !saveFailure; }}>Toggle save interruption</button><button onClick={() => { localStorage.removeItem('omni4.qa.tree'); location.reload(); }}>Reset fixture</button></div><RequestTrace /><DashboardsPage dashboardId={id} moduleId="crm" values={values} onValues={setValues} onOpen={setId} /></div></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Lab />);
