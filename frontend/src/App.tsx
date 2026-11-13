import { useEffect, useMemo, useRef, useState } from 'react'



import './App.css'







const API_URL = 'https://script.google.com/macros/s/AKfycbx2l-R4qea9DvppWGhbCSC15zjtpJM7FBHWiC3eYUkN34tuwo4nIS059VcdWwm_Mivlag/exec'



type Role = 'Supervisor' | 'Manager'

type OrderRecord = {
  orderId: string;
  orderDate: string;
  productName: string;
  partNumber: string;
  orderQuantity: number;
  materialSpecification: string;
  deliveryDate: string;
  priority: string;
  status: string;
  remarks: string;
};

type OrderFormState = {
  orderDate: string;
  productName: string;
  partNumber: string;
  orderQuantity: string;
  materialSpecification: string;
  deliveryDate: string;
  priority: string;
  remarks: string;
};

const emptyOrderForm: OrderFormState = {
  orderDate: new Date().toISOString().slice(0, 10),
  productName: '',
  partNumber: '',
  orderQuantity: '',
  materialSpecification: '',
  deliveryDate: '',
  priority: 'Normal',
  remarks: '',
};

async function fetchBackendOrders(): Promise<OrderRecord[]> {
  const url = `${API_URL}?action=orders`;
  const response = await fetch(url, { method: 'GET', redirect: 'follow' });
  const responseText = await response.text();
  let result: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(responseText);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid response');
    result = parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Orders endpoint returned an unreadable response: ${responseText.trim() || 'empty response'}`);
  }
  if (!response.ok || result.success !== true || !Array.isArray(result.orders)) {
    throw new Error(String(result.message ?? result.error ?? `Orders request failed (HTTP ${response.status})`));
  }
  return result.orders.map((row: Record<string, unknown>) => ({
    orderId: String(row['Order ID'] ?? row.Order_ID ?? row.orderId ?? ''),
    orderDate: normalizeSheetDate(row['Order Date'] ?? row.Order_Date ?? row.orderDate),
    productName: String(row['Product Name'] ?? row.Product_Name ?? row.productName ?? ''),
    partNumber: String(row['Part Number'] ?? row.Part_Number ?? row.partNumber ?? ''),
    orderQuantity: Number(row['Order Quantity'] ?? row.Order_Quantity ?? row.orderQuantity ?? 0),
    materialSpecification: String(row['Material Specification'] ?? row.Material_Specification ?? row.Material ?? row.materialSpecification ?? ''),
    deliveryDate: normalizeSheetDate(row['Delivery Date'] ?? row.Delivery_Date ?? row.deliveryDate),
    priority: String(row.Priority ?? 'Normal'),
    status: String(row['Order Status'] ?? row.Status ?? row.status ?? 'Registered'),
    remarks: String(row.Remarks ?? row.remarks ?? ''),
  })).filter((order: OrderRecord) => order.orderId);
}

type ProblemStatus = 'Pending' | 'In Progress' | 'Resolved'



type Entry = { recordId?: string; orderId?: string; date: string; shift: string; machine: string; product: string; target: number; actual: number; good: number; rejected: number; reason: string; remarks: string; shortfallReason?: string; rejectionReason?: string }



type Machine = { id: string; name: string; type: string; status: 'Active' | 'Maintenance' | 'Inactive'; remarks: string }



type MachineTarget = { id: string; date: string; machineId: string; quantity: number; unit?: string }


type ProblemLogEntry = {
  productionDate: string;
  machineName: string;
  shift: string;
  problemType: 'Shortfall' | 'Rejection';
  shortfallReason: string;
  status: ProblemStatus;
};

async function fetchBackendTargets(): Promise<MachineTarget[]> {
  const url = `${API_URL}?action=targets`
  const response = await fetch(url, { method: 'GET', redirect: 'follow' })
  const responseText = await response.text()

  let result: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(responseText)
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid response')
    result = parsed as Record<string, unknown>
  } catch {
    throw new Error(`GET ${url} returned HTTP ${response.status}: ${responseText.trim() || 'unreadable response'}`)
  }

  if (!response.ok || result.success !== true || !Array.isArray(result.targets)) {
    const backendError = result.error ?? result.message
    const detail = typeof backendError === 'string' && backendError.trim() ? `: ${backendError}` : ''
    throw new Error(`GET ${url} failed with HTTP ${response.status}${detail}`)
  }

  return result.targets.map((row: Record<string, unknown>) => ({
    id: String(row.Target_ID ?? row.TargetId ?? row.ID ?? row.id ?? '').trim(),
    date: normalizeSheetDate(row.Target_Date ?? row.TargetDate ?? row.date),
    machineId: String(row.Machine_ID ?? row.MachineId ?? row.machineId ?? '').trim(),
    quantity: Number(row.Target_Qty ?? row.TargetQty ?? row.quantity ?? 0),
    unit: 'Nos',
  })).filter((target: MachineTarget) => target.id && target.date && target.machineId)
}

async function fetchBackendEntries(): Promise<Entry[]> {

  const url = `${API_URL}?action=records`

  const response = await fetch(url, { method: 'GET', redirect: 'follow' })

  const responseText = await response.text()

  let result: Record<string, unknown>

  try {

    const parsed: unknown = JSON.parse(responseText)

    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid response')

    result = parsed as Record<string, unknown>

  } catch {

    throw new Error(`GET ${url} returned HTTP ${response.status}: ${responseText.trim() || 'unreadable response'}`)

  }

  if (!response.ok || result.success !== true || !Array.isArray(result.records)) {

    const backendError = result.error ?? result.message

    const detail = typeof backendError === 'string' && backendError.trim() ? `: ${backendError}` : ''

    throw new Error(`GET ${url} failed with HTTP ${response.status}${detail}`)

  }



  return result.records.map((row: Record<string, unknown>) => {

    const actual = Number(row.Actual_Qty ?? 0)

    const rejected = Number(row.Rejected_Qty ?? 0)

    const remark = String(row.Remarks ?? '')

    const reason = String(row.Rejection_Reason ?? row.RejectionReason ?? remark)

    return {

      orderId: String(row.Order_ID ?? '').trim(),

      recordId: String(row.Record_ID ?? '').trim() || undefined,

      date: normalizeSheetDate(row.Production_Date),

      shift: String(row.Shift ?? ''),

      machine: String(row.Machine_ID ?? ''),

      product: String(row.Product_Part ?? ''),

      target: Number(row.Target_Qty ?? 0),

      actual,

      good: Number(row.Good_Qty ?? Math.max(0, actual - rejected)),

      rejected,

      reason: String(row.Reason ?? remark),

      remarks: remark,

      shortfallReason: String(row.Shortfall_Reason ?? row.ShortfallReason ?? ''),

      rejectionReason: rejected > 0 ? reason : '',

    }

  })

}



const demoAccounts = [{ role: 'Supervisor' as const, email: 'supervisor@kg.com', password: '1234' }, { role: 'Manager' as const, email: 'manager@kg.com', password: '1234' }]



const initialEntries: Entry[] = []



const entriesStorageKey = 'kinetic-gears-production-entries'



const machinesStorageKey = 'kinetic-gears-machines'



const targetsStorageKey = 'kinetic-gears-machine-targets'



const demoSeededStorageKey = 'kinetic-gears-demo-seed-v1'



const demoMachines: Machine[] = [



  { id: 'MCH-001', name: 'CNC Turning Machine 01', type: 'CNC Turning', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-002', name: 'CNC Turning Machine 02', type: 'CNC Turning', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-003', name: 'CNC Gear Hobbing Machine 01', type: 'Gear Hobbing', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-004', name: 'CNC Gear Hobbing Machine 02', type: 'Gear Hobbing', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-005', name: 'Gear Shaping Machine 01', type: 'Gear Shaping', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-006', name: 'Gear Grinding Machine 01', type: 'Gear Grinding', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-007', name: 'VMC Machine 01', type: 'Machining', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-008', name: 'Drilling Machine 01', type: 'Drilling', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-009', name: 'Induction Hardening Machine 01', type: 'Heat Treatment', status: 'Active', remarks: 'Demo sample machine' },



  { id: 'MCH-010', name: 'Gear Inspection Station 01', type: 'Quality Inspection', status: 'Active', remarks: 'Demo sample machine' },



]



const demoDailyTargets = [250, 220, 180, 180, 200, 150, 160, 300, 240, 400]

async function fetchBackendProblems(): Promise<ProblemLogEntry[]> {
  const response = await fetch(`${API_URL}?action=problemLog`, {
    method: 'GET',
    redirect: 'follow',
  });

  const result = await response.json();

  if (!response.ok || result.success !== true || !Array.isArray(result.problems)) {
    throw new Error(result.error || 'Unable to load Problem Log');
  }

  return result.problems;
}





function todayDate() {



  const now = new Date()



  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`



}



function normalizeSheetDate(value: unknown): string {

  const raw = String(value ?? '').trim()

  if (!raw) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)

  if (match) {

    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`

  }

  return raw

}









function loadStored<T>(key: string): T[] {



  try {



    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')



    return Array.isArray(value) ? value as T[] : []



  } catch { return [] }



}



async function fetchBackendMachines(): Promise<Machine[]> {

  const response = await fetch(`${API_URL}?action=machines`, { method: 'GET', redirect: 'follow' })

  const responseBody = await response.text()

  let result: Record<string, unknown>

  try {

    const parsed: unknown = JSON.parse(responseBody)

    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid response')

    result = parsed as Record<string, unknown>

  } catch {

    throw new Error(responseBody.trim() || `Server returned HTTP ${response.status} without an error message.`)

  }

  if (!response.ok || result.success !== true || !Array.isArray(result.machines)) {

    const backendError = result.error ?? result.errorMessage ?? result.message

    throw new Error(typeof backendError === 'string' && backendError.trim() ? backendError : `Server returned HTTP ${response.status} with an invalid machine list.`)

  }



  const records: Machine[] = result.machines.map((row: Record<string, unknown>) => {

    const statusValue = String(row.Active_Status ?? 'Inactive').trim()

    const status: Machine['status'] = statusValue === 'Active' || statusValue === 'Maintenance' ? statusValue : 'Inactive'

    return { id: String(row.Machine_ID ?? '').trim(), name: String(row.Machine_Name ?? '').trim(), type: String(row.Department ?? '').trim(), status, remarks: String(row.Remarks ?? '').trim() }

  }).filter((machine: Machine) => machine.id && machine.name)



  return records.filter((machine, index) => records.findIndex((record) => record.id.toLowerCase() === machine.id.toLowerCase()) === index)

}







function seedDemoData() {



  try {



    if (window.localStorage.getItem(demoSeededStorageKey) === 'true') return



    const machines = loadStored<Machine>(machinesStorageKey)



    const targets = loadStored<MachineTarget>(targetsStorageKey)



    const seededMachines = [...machines, ...demoMachines.filter((sample) => !machines.some((machine) => machine.id.toLowerCase() === sample.id.toLowerCase()))]



    const date = todayDate()



    const seededTargets = [...targets, ...demoMachines.flatMap((machine, index) => targets.some((target) => target.machineId === machine.id && target.date === date) ? [] : [{ id: `demo-${machine.id}-${date}`, date, machineId: machine.id, quantity: demoDailyTargets[index], unit: 'Nos' }])]



    window.localStorage.setItem(machinesStorageKey, JSON.stringify(seededMachines))



    window.localStorage.setItem(targetsStorageKey, JSON.stringify(seededTargets))



    window.localStorage.setItem(demoSeededStorageKey, 'true')



  } catch {



    // Continue with the records available in memory if browser storage is unavailable.



  }



}







seedDemoData()







function loadEntries(): Entry[] {



  try {



    const savedEntries = window.localStorage.getItem(entriesStorageKey)



    if (!savedEntries) return initialEntries



    const parsedEntries: unknown = JSON.parse(savedEntries)



    return Array.isArray(parsedEntries) ? parsedEntries as Entry[] : initialEntries



  } catch {



    return initialEntries



  }



}



const icon = (name: string) => {



  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }



  const paths: Record<string, React.ReactNode> = {



    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>, lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></>, arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>, grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>, factory: <><path d="M3 21V9l6 3V8l6 4V5h6v16Z"/><path d="M7 17h2m3 0h2m3 0h2"/></>, check: <><path d="m5 12 4 4L19 6"/></>, chart: <><path d="M3 3v18h18M8 16v-4m5 4V7m5 9v-7"/></>, logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>, gear: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1 1.2.9-1.3 2.3-1.4-.6a8 8 0 0 1-1.5.9l-.2 1.5h-2.7l-.2-1.5a8 8 0 0 1-1.5-.9l-1.4.6-1.3-2.3 1.2-.9a7 7 0 0 1 0-1.8l-1.2-.9 1.3-2.3 1.4.6a8 8 0 0 1 1.5-.9l.2-1.5h2.7l.2 1.5a8 8 0 0 1 1.5.9l1.4-.6 1.3 2.3-1.2.9a7 7 0 0 1 0 1.8Z"/></>, eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>, eyeoff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.3 3.5-.7"/></>, production: <><path d="M4 19V9l5 3V8l5 4V5h6v14Z"/><path d="M8 16h.01M12 16h.01M16 16h.01"/></>, quality: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>, performance: <><path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/></> }



  return <svg {...common}>{paths[name] ?? paths.gear}</svg>



}








type QualityRecord = {
  Quality_ID?: string; Order_ID: string; Production_ID: string; Inspection_Date: string;
  Inspected_Qty: number; Accepted_Qty: number; Rejected_Qty: number; Rework_Qty: number;
  Rework_Status: string; Rework_Completed_Qty: number; Rejection_Reason: string; Remarks: string;
};
type DispatchRecord = { Dispatch_ID?: string; Order_ID: string; Dispatch_Date: string; Dispatch_Qty: number; Remarks: string };

function App() {



  const [role, setRole] = useState<Role | null>(null)



const [managerPage, setManagerPage] = useState<
  'dashboard' | 'machine-management' | 'order-management' | 'quality-rework' | 'dispatch-tracking' | 'machine-process-planning'
>('dashboard')

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');
  const [orderError, setOrderError] = useState('');
  const [qualityRecords, setQualityRecords] = useState<QualityRecord[]>([]);
  const [dispatchRecords, setDispatchRecords] = useState<DispatchRecord[]>([]);
  const [qualityForm, setQualityForm] = useState({ orderId: '', productionId: '', inspectionDate: todayDate(), inspectedQty: '', acceptedQty: '', rejectedQty: '0', reworkQty: '0', reworkStatus: 'Not Required', reworkCompletedQty: '0', rejectionReason: '', remarks: '' });
  const [dispatchForm, setDispatchForm] = useState({ orderId: '', dispatchDate: todayDate(), dispatchQty: '', remarks: '' });
  // Keep Quality and Dispatch UI state independent so one module's response
  // or status message cannot overwrite the other module.
  const [qualityLoading, setQualityLoading] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [qualitySaving, setQualitySaving] = useState(false);
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [qualityMessage, setQualityMessage] = useState('');
  const [qualityError, setQualityError] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [dispatchError, setDispatchError] = useState('');



  const [email, setEmail] = useState('')



  const [password, setPassword] = useState('')



  const [showPassword, setShowPassword] = useState(false)



  const [loginMessage, setLoginMessage] = useState('')

  useEffect(() => {
    let cancelled = false;
    async function loadOrders() {
      setOrdersLoading(true);
      try {
        const data = await fetchBackendOrders();
        if (!cancelled) setOrders(data);
      } catch (error) {
        console.error('Unable to load orders from Google Sheets:', error);
        if (!cancelled) setOrderError(error instanceof Error ? error.message : 'Unable to load orders.');
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    }
    void loadOrders();
    return () => { cancelled = true; };

  }, []);

  useEffect(() => {
    if (role !== 'Manager' || (managerPage !== 'quality-rework' && managerPage !== 'dispatch-tracking')) return;
    let cancelled = false;

    // Fetch each list independently: a Dispatch endpoint failure must not block
    // Quality records (and vice versa).
    async function loadQualityRecords() {
      setQualityLoading(true);
      setQualityError('');
      try {
        const response = await fetch(`${API_URL}?action=qualityRecords`, { method: 'GET', redirect: 'follow' });
        const body = await response.text();
        let result: { success?: boolean; records?: QualityRecord[]; error?: string; message?: string };
        try { result = JSON.parse(body) as typeof result; }
        catch { throw new Error(`Quality records endpoint returned unreadable data: ${body.trim() || `HTTP ${response.status}`}`); }
        if (!response.ok || result.success !== true || !Array.isArray(result.records)) {
          throw new Error(result.error || result.message || `Could not load Quality/Rework records (HTTP ${response.status}).`);
        }
        if (!cancelled) setQualityRecords(result.records);
      } catch (error) {
        if (!cancelled) setQualityError(error instanceof Error ? error.message : 'Could not load Quality/Rework records.');
      } finally {
        if (!cancelled) setQualityLoading(false);
      }
    }

    async function loadDispatchRecords() {
      setDispatchLoading(true);
      setDispatchError('');
      try {
        const response = await fetch(`${API_URL}?action=dispatchRecords`, { method: 'GET', redirect: 'follow' });
        const body = await response.text();
        let result: { success?: boolean; records?: DispatchRecord[]; error?: string; message?: string };
        try { result = JSON.parse(body) as typeof result; }
        catch { throw new Error(`Dispatch records endpoint returned unreadable data: ${body.trim() || `HTTP ${response.status}`}`); }
        if (!response.ok || result.success !== true || !Array.isArray(result.records)) {
          throw new Error(result.error || result.message || `Could not load Dispatch records (HTTP ${response.status}).`);
        }
        if (!cancelled) setDispatchRecords(result.records);
      } catch (error) {
        if (!cancelled) setDispatchError(error instanceof Error ? error.message : 'Could not load Dispatch records.');
      } finally {
        if (!cancelled) setDispatchLoading(false);
      }
    }

    void loadQualityRecords();
    void loadDispatchRecords();
    return () => { cancelled = true; };
  }, [role, managerPage]);

  async function saveOrderForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderSaving(true);
    setOrderMessage('');
    setOrderError('');
    const quantity = Number(orderForm.orderQuantity);
    const missingFields: string[] = [];
    if (!orderForm.orderDate.trim()) missingFields.push('Order Date');
    if (!orderForm.productName.trim()) missingFields.push('Product Name');
    if (!Number.isFinite(quantity) || quantity <= 0) missingFields.push('Order Quantity (must be greater than 0)');
    if (!orderForm.deliveryDate.trim()) missingFields.push('Delivery Date');
    if (missingFields.length > 0) {
      setOrderError(`Please check required fields: ${missingFields.join(', ')}`);
      setOrderSaving(false);
      return;
    }
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveOrder',
          data: {
            orderDate: orderForm.orderDate,
            // Customer name is intentionally not displayed in this workspace.
            customerName: 'Confidential',
            productName: orderForm.productName.trim(),
            partNumber: orderForm.partNumber.trim(),
            orderQuantity: quantity,
            materialSpecification: orderForm.materialSpecification.trim(),
            deliveryDate: orderForm.deliveryDate,
            priority: orderForm.priority,
            remarks: orderForm.remarks.trim(),
          },
        }),
      });
      const responseText = await response.text();
      let result: Record<string, unknown>;
      try {
        result = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        throw new Error(`Save order returned an unreadable response: ${responseText.trim() || 'empty response'}`);
      }
      if (!response.ok || result.success !== true) {
        const backendMessage = result.message ?? result.error ?? result.details;
        throw new Error(
          `Backend rejected the order (HTTP ${response.status}): ${String(backendMessage ?? 'No error details returned')}`
        );
      }
      const updatedOrders = await fetchBackendOrders();
      setOrders(updatedOrders);
      setOrderForm({ ...emptyOrderForm, orderDate: new Date().toISOString().slice(0, 10) });
      setOrderMessage('Order saved successfully.');
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Unable to save order.');
    } finally {
      setOrderSaving(false);
    }
  }




  const [entries, setEntries] = useState<Entry[]>(loadEntries)

  const entriesLoadVersion = useRef(0)



  // Load production history from Apps Script on page load.

  useEffect(() => {

    let cancelled = false



    async function loadBackendEntries() {

      try {

        const versionAtRequest = entriesLoadVersion.current

        const records = await fetchBackendEntries()

        if (!cancelled && versionAtRequest === entriesLoadVersion.current) setEntries(records)

      } catch (error) {

        console.error('Unable to load production records from backend:', error)

        if (!cancelled) {

          const detail = error instanceof Error ? error.message : 'Unknown error'

          window.alert(`Unable to load production records: ${detail}`)

        }

      }

    }



    void loadBackendEntries()

    return () => { cancelled = true }

  }, [])



  const [machines, setMachines] = useState<Machine[]>(() => loadStored<Machine>(machinesStorageKey))

  const [machineSyncState, setMachineSyncState] = useState<'loading' | 'loaded' | 'error'>('loading')

useEffect(() => {
  let cancelled = false;

  async function loadProblemLog() {
    try {
      const problems = await fetchBackendProblems();

      if (!cancelled) {
        setProblemLogEntries(problems);
      }
    } catch (error) {
      console.error('Unable to load Problem Log:', error);
    }
  }

  void loadProblemLog();

  return () => {
    cancelled = true;
  };
}, []);

  useEffect(() => {

    let cancelled = false

    async function loadMachines() {

      try {

        const records = await fetchBackendMachines()

        if (!cancelled) { setMachines(records); setMachineSyncState('loaded') }

      } catch (error) {

        console.error('Unable to load machines from Google Sheets:', error)

        if (!cancelled) {

          setMachineSyncState('error')

          const detail = error instanceof Error ? error.message : 'Unknown error'

          window.alert(`Unable to load machines from Google Sheets. Check your internet connection and Apps Script deployment. ${detail}`)

        }

      }

    }

    void loadMachines()

    return () => { cancelled = true }

  }, [])



  const [targets, setTargets] = useState<MachineTarget[]>(() => loadStored<MachineTarget>(targetsStorageKey))

  // Load machine targets from Google Sheets; backend data is the source of truth.
  useEffect(() => {
    let cancelled = false

    async function loadBackendTargetsOnStart() {
      try {
        const records = await fetchBackendTargets()
        if (!cancelled) setTargets(records)
      } catch (error) {
        console.error('Unable to load machine targets from Google Sheets:', error)
        if (!cancelled) {
          const detail = error instanceof Error ? error.message : 'Unknown error'
          window.alert(`Unable to load machine targets from Google Sheets: ${detail}`)
        }
      }
    }

    void loadBackendTargetsOnStart()
    return () => { cancelled = true }
  }, [])




  useEffect(() => {



    try {



      window.localStorage.setItem(entriesStorageKey, JSON.stringify(entries))



    } catch {



      // Keep the in-memory demo usable if browser storage is unavailable.



    }



  }, [entries])



  useEffect(() => { window.localStorage.setItem(machinesStorageKey, JSON.stringify(machines)) }, [machines])



  useEffect(() => { window.localStorage.setItem(targetsStorageKey, JSON.stringify(targets)) }, [targets])



  const openProblems = entries.filter((entry) => entry.rejected > 0).length



  const [filterDate, setFilterDate] = useState('')



  const [filterShift, setFilterShift] = useState('All shifts')



  const [filterMachine, setFilterMachine] = useState('All machines')

  const [problemStatuses, setProblemStatuses] = useState<Record<string, ProblemStatus>>({})
  
  const [problemLogEntries, setProblemLogEntries] = useState<ProblemLogEntry[]>([]); 

  const [problemDateFilter, setProblemDateFilter] = useState('')

  const [problemMachineFilter, setProblemMachineFilter] = useState('All machines')

  const [problemShiftFilter, setProblemShiftFilter] = useState('All shifts')

  const [problemStatusFilter, setProblemStatusFilter] = useState<'All' | ProblemStatus>('All')

  const [problemSearch, setProblemSearch] = useState('')



  const [form, setForm] = useState({ date: todayDate(), shift: 'Morning', machine: '', product: '', orderId: '', actual: '', rejected: '0', reason: '', otherReason: '', shortfallReason: '', shortfallOtherReason: '' })



  const applicableTarget = targets.find((item) => item.machineId === form.machine && item.date === form.date)



  const activeMachines = machines.filter((machine) => machine.status === 'Active')



  const actualQuantity = Number(form.actual || 0)



  const rejectedQuantity = Number(form.rejected || 0)



  const targetQuantity = applicableTarget?.quantity ?? 0



  const shortfallQuantity = Math.max(0, targetQuantity - actualQuantity)



  const showShortfallDetails = !!applicableTarget && form.actual !== '' && actualQuantity < targetQuantity



  const showRejectionDetails = rejectedQuantity > 0



  const good = Math.max(0, actualQuantity - rejectedQuantity)



  const filtered = useMemo(() => entries.filter((e) => (!filterDate || e.date === filterDate) && (filterShift === 'All shifts' || e.shift === filterShift) && (filterMachine === 'All machines' || e.machine === filterMachine)), [entries, filterDate, filterShift, filterMachine])

  const problemRows = problemLogEntries.map((problem) => {
  const entry = {
    date: problem.productionDate,
    shift: problem.shift,
    machine: problem.machineName,
    product: '',
    target: 0,
    actual: 0,
    problemType: problem.problemType,
    shortfallReason: problem.shortfallReason,
  };

  // Include problemType so a Shortfall and Rejection with otherwise identical
  // details cannot share the same UI status key.
  const key = `${problem.productionDate}-${problem.machineName}-${problem.shift}-${problem.problemType}-${problem.shortfallReason}`;

  return {
    entry,
    key,
    status: problemStatuses[key] ?? problem.status,
  };
});

  const problemMachineOptions = Array.from(new Set(problemRows.map(({ entry }) => entry.machine).filter(Boolean)))

  const problemShiftOptions = Array.from(new Set(problemRows.map(({ entry }) => entry.shift).filter(Boolean)))

  const filteredProblemRows = problemRows.filter(({ entry }) =>

    (!problemDateFilter || entry.date === problemDateFilter) &&

    (problemMachineFilter === 'All machines' || entry.machine === problemMachineFilter) &&

    (problemShiftFilter === 'All shifts' || entry.shift === problemShiftFilter) &&

    (!problemSearch.trim() || `${entry.machine} ${machines.find((machine) => machine.id === entry.machine)?.name ?? ''} ${entry.shortfallReason ?? ''}`.toLowerCase().includes(problemSearch.trim().toLowerCase()))

  )

  const visibleProblemRows = filteredProblemRows.filter((row) => problemStatusFilter === 'All' || row.status === problemStatusFilter)

  const problemStatusCounts = visibleProblemRows.reduce((counts, row) => {

    counts[row.status] += 1

    return counts

  }, { Pending: 0, 'In Progress': 0, Resolved: 0 })







  function login(event: React.FormEvent<HTMLFormElement>) {



    event.preventDefault()



    const account = demoAccounts.find((item) => item.email === email.trim().toLowerCase() && item.password === password)



    if (!account) { setLoginMessage('Those demo credentials do not match. Choose a demo account below.'); return }



    setLoginMessage('')



    setRole(account.role)



  }



  function logout() { setRole(null); setPassword(''); setLoginMessage('') }



  async function saveEntry(event: React.FormEvent<HTMLFormElement>) {



    event.preventDefault()



    const rejected = Number(form.rejected || 0)



    const actual = Number(form.actual)



    const reason = form.reason === 'Other' ? form.otherReason.trim() : form.reason



    const shortfallReason = form.shortfallReason === 'Other' ? form.shortfallOtherReason.trim() : form.shortfallReason



    if (!activeMachines.some((machine) => machine.id === form.machine) || !applicableTarget || rejected > actual || (showRejectionDetails && !reason) || (showShortfallDetails && !shortfallReason)) return



    const payload = {



      Production_Date: form.date,



      Order_ID: form.orderId,



      Shift: form.shift,



      Machine_ID: form.machine,



      Product_Part: form.product.trim(),



      Target_Qty: applicableTarget.quantity,



      Actual_Qty: actual,



      Rejected_Qty: rejected,



      Good_Qty: actual - rejected,



      Remarks: reason || '',



      Supervisor_ID: email.trim().toLowerCase(),



    }







    try {











const response = await fetch(API_URL, {



  method: 'POST',



  headers: {



    'Content-Type': 'text/plain;charset=utf-8',



  },



  body: JSON.stringify(payload),



})











      if (!response.ok) throw new Error(`POST ${API_URL} returned HTTP ${response.status}.`)



      if (response.redirected && /accounts\.google\.com/i.test(response.url)) {



        throw new Error('The Apps Script endpoint redirected to Google sign-in.')



      }







      const responseText = await response.text()



      let result: unknown



      try {



        result = JSON.parse(responseText)



      } catch {



        throw new Error('The backend returned an unreadable response.')



      }



      const confirmation = result as { success?: unknown; status?: unknown }



      if (confirmation.success !== true && confirmation.status !== 'success') {



        throw new Error('The backend did not confirm that the entry was saved.')



      }





// Save shortfall to Problem_Log only when a reason is provided.

      if (showShortfallDetails && shortfallReason) {

        const problemResponse = await fetch(API_URL, {

          method: 'POST',

          headers: {

            'Content-Type': 'text/plain;charset=utf-8',

          },

          body: JSON.stringify({

            action: 'saveProblemLog',

            productionDate: payload.Production_Date,

            machineName:

              activeMachines.find((machine) => machine.id === form.machine)?.name

              || form.machine,

            shift: payload.Shift,

            shortfallReason,

          }),

        })



        if (!problemResponse.ok) {

          throw new Error(

            `Problem Log request returned HTTP ${problemResponse.status}.`

          )

        }



        const problemText = await problemResponse.text()

        let problemResult: { success?: boolean; message?: string }



        try {

          problemResult = JSON.parse(problemText)

        } catch {

          throw new Error('Problem Log returned an unreadable response.')

        }



        if (problemResult.success !== true) {

          throw new Error(

            problemResult.message || 'Problem Log was not saved.'

          )

        }

      }


      // Save rejection to Problem_Log only when a reason is provided.
      if (showRejectionDetails && reason) {
        const rejectionResponse = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify({
            action: 'saveProblemLog',
            productionDate: payload.Production_Date,
            machineName:
              activeMachines.find((machine) => machine.id === form.machine)?.name
              || form.machine,
            shift: payload.Shift,
            problemType: 'Rejection',
            reason,
          }),
        });

        if (!rejectionResponse.ok) {
          throw new Error(
            `Rejection Problem Log request returned HTTP ${rejectionResponse.status}.`
          );
        }

        const rejectionText = await rejectionResponse.text();
        let rejectionResult: { success?: boolean; message?: string };

        try {
          rejectionResult = JSON.parse(rejectionText);
        } catch {
          throw new Error('Rejection Problem Log returned an unreadable response.');
        }

        if (rejectionResult.success !== true) {
          throw new Error(
            rejectionResult.message || 'Rejection Problem Log was not saved.'
          );
        }
      }


      entriesLoadVersion.current += 1

      const savedEntry: Entry = { orderId: payload.Order_ID, date: payload.Production_Date, shift: payload.Shift, machine: payload.Machine_ID, product: payload.Product_Part, target: payload.Target_Qty, actual: payload.Actual_Qty, good: payload.Good_Qty, rejected: payload.Rejected_Qty, reason: reason || '—', remarks: payload.Remarks, shortfallReason: showShortfallDetails ? shortfallReason : undefined, rejectionReason: showRejectionDetails ? reason : undefined }

      setEntries((current) => [savedEntry, ...current])



      setForm((current) => ({ ...current, product: '', actual: '', rejected: '0', reason: '', otherReason: '', shortfallReason: '', shortfallOtherReason: '' }))



    } catch (error) {



      const message = error instanceof Error ? error.message : 'Unknown network or backend error.'



      window.alert(`Unable to save production entry: ${message}`)



    }



  }







  const managerSums = filtered.reduce((a, e) => ({ target: a.target + e.target, actual: a.actual + e.actual, good: a.good + e.good, rejected: a.rejected + e.rejected }), { target: 0, actual: 0, good: 0, rejected: 0 })



  const managerKpis = [{ label: 'Total Target', value: managerSums.target, meta: 'units planned', color: 'blue' }, { label: 'Total Actual', value: managerSums.actual, meta: 'units produced', color: 'navy' }, { label: 'Good Quantity', value: managerSums.good, meta: 'accepted units', color: 'green' }, { label: 'Rejected Quantity', value: managerSums.rejected, meta: 'units rejected', color: 'red' }, { label: 'Achievement', value: `${managerSums.target ? Math.round(managerSums.actual / managerSums.target * 100) : 0}%`, meta: 'of target achieved', color: 'purple' }, { label: 'Shortfall', value: Math.max(0, managerSums.target - managerSums.actual), meta: 'units to target', color: 'amber' }]







  if (!role) return <main className="login-page"><section className="login-shell">



    <div className="login-panel"><div className="brand"><div className="brand-mark">{icon('gear')}</div><div><strong>Kinetic Gears, Nagpur</strong><span>Production Monitoring System</span></div></div>



      <div className="login-content"><span className="eyebrow">PRODUCTION PORTAL</span><h1>Welcome back</h1><p className="login-intro">Sign in to continue to Production Monitoring</p>



        <form className="login-form" onSubmit={login}><label htmlFor="email">Email address</label><div className="input-wrap">{icon('mail')}<input id="email" type="email" autoComplete="username" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>



          <label htmlFor="password">Password</label><div className="input-wrap">{icon('lock')}<input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required /><button className="show-password" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{icon(showPassword ? 'eyeoff' : 'eye')}</button></div>



          {loginMessage && <p className="form-message" role="alert">{loginMessage}</p>}<button className="primary-button" type="submit">Login <span>{icon('arrow')}</span></button>



        </form>



      </div>



      <div className="demo-box"><div className="demo-title"><span>DEMO ACCESS</span><small>Select an account to autofill</small></div><div className="demo-cards">{demoAccounts.map((account) => <button className="demo-card" type="button" key={account.role} onClick={() => { setEmail(account.email); setPassword(account.password); setLoginMessage('') }}><span className="demo-avatar">{account.role[0]}</span><span className="demo-info"><strong>{account.role}</strong><small>{account.email}</small><small>Password: 1234</small></span><span className="demo-chevron">{icon('arrow')}</span></button>)}</div></div>



      <p className="login-footnote">Demo interface — Authentication is not connected</p>



    </div>



    <aside className="visual-panel"><div className="visual-photo"/><div className="visual-overlay"/><div className="visual-content"><div className="visual-kicker"><span/> PRECISION IN EVERY SHIFT</div><h2>Production.<br/>Quality.<br/><em>Performance.</em></h2><p className="visual-copy">Clear insight into every part, process, and production line.</p><div className="feature-list"><div>{icon('production')}<span>Track daily production</span></div><div>{icon('quality')}<span>Monitor rejected quantity</span></div><div>{icon('performance')}<span>Review machine performance</span></div></div><div className="visual-caption">ENGINEERED FOR BETTER OUTPUT</div></div><div className="image-credit">KINETIC GEARS · NAGPUR</div></aside>



  </section></main>







const pageTitle =
  role === 'Supervisor'
    ? 'Supervisor Home'
    : managerPage === 'machine-management'
      ? 'Machine Management'
      : managerPage === 'order-management'
        ? 'Order Management'
        : managerPage === 'quality-rework'
          ? 'Quality / Rework'
          : managerPage === 'dispatch-tracking'
            ? 'Dispatch Tracking'
            : managerPage === 'machine-process-planning'
              ? 'Machine Process Planning'
              : 'Manager Production Dashboard'


  return <div className="workspace"><aside className="sidebar"><a className="side-brand" href="#home" onClick={(e) => e.preventDefault()}><span className="side-logo">{icon('gear')}</span><span><b>KINETIC GEARS</b><small>PRODUCTION SYSTEM</small></span></a><div className="side-label">WORKSPACE</div><button className={`nav-item${role === 'Supervisor' || managerPage === 'dashboard' ? ' active' : ''}`} onClick={() => { if (role === 'Manager') setManagerPage('dashboard') }}>{icon('grid')}<span>{role === 'Supervisor' ? 'Supervisor Home' : 'Production Dashboard'}</span></button>{role === 'Manager' && <button className={`nav-item${managerPage === 'machine-management' ? ' active' : ''}`} onClick={() => setManagerPage('machine-management')}>{icon('gear')}<span>Machine Management</span></button>}{role === 'Manager' && (
  <button
    className={`nav-item${managerPage === 'order-management' ? ' active' : ''}`}
    onClick={() => setManagerPage('order-management')}
  >
    {icon('production')}
    <span>Order Management</span>
  </button>
)}{role === 'Manager' && (
  <button
    className={`nav-item${managerPage === 'quality-rework' ? ' active' : ''}`}
    onClick={() => setManagerPage('quality-rework')}
  >
    {icon('quality')}
    <span>Quality / Rework</span>
  </button>
)}{role === 'Manager' && (
  <button
    className={`nav-item${managerPage === 'dispatch-tracking' ? ' active' : ''}`}
    onClick={() => setManagerPage('dispatch-tracking')}
  >
    {icon('production')}
    <span>Dispatch Tracking</span>
  </button>
)}{role === 'Manager' && (<button className={`nav-item${managerPage === 'machine-process-planning' ? ' active' : ''}`} onClick={() => setManagerPage('machine-process-planning')}>{icon('production')}<span>Machine Process Planning</span></button>)}{role === 'Supervisor' && <><a className="nav-item" href="#entry">{icon('factory')}<span>My Production</span></a><a className="nav-item" href="#records">{icon('chart')}<span>My Records</span></a></>}<div className="sidebar-bottom"><div className="user-chip"><span className="user-avatar">{role[0]}</span><span><b>{role}</b><small>{email}</small></span></div><button className="logout-button" onClick={logout}>{icon('logout')}<span>Logout</span></button></div></aside>



    <main className="dashboard"><header className="dash-header"><div><div className="breadcrumb">WORKSPACE <span>/</span> {role === 'Supervisor' ? 'SUPERVISOR' : 'MANAGER'}</div><h1>{pageTitle}</h1><p>{role === 'Manager' && managerPage === 'machine-management' ? 'Manage machine targets and master records' : 'Production overview and operational performance'}</p></div><div className="header-date">{icon('calendar')}<span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></div></header>



    {role === 'Supervisor' ? <><section className="summary-grid"><article className="summary-card"><span className="summary-icon blue">{icon('factory')}</span><div><small>Production Entries</small><strong>{entries.length}</strong><span className="summary-note">Recorded in this demo</span></div></article><article className="summary-card"><span className="summary-icon amber">{icon('quality')}</span><div><small>Open Problems</small><strong>{openProblems}</strong><span className="summary-note">Needs review</span></div></article></section>



      <SupervisorAssignedProcesses supervisorEmail={email} />

      <section className="surface" id="entry"><div className="section-heading"><div><span className="section-index">01</span><div><h2>Production Entry</h2><p>Log output for your shift</p></div></div><span className="draft-label">PRODUCTION ENTRY</span></div><form className="entry-form" onSubmit={saveEntry}><div className="form-grid"><Field label="Production Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, shortfallReason: '', shortfallOtherReason: '', reason: '', otherReason: '' })} required /></Field><Field label="Order ID (optional)"><select value={form.orderId} onChange={(e) => { const selected = orders.find((order) => order.orderId === e.target.value); setForm({ ...form, orderId: e.target.value, product: selected?.partNumber || selected?.productName || form.product }) }}><option value="">Not linked to an order</option>{orders.map((order) => <option key={order.orderId} value={order.orderId}>{order.orderId} — {order.productName} (Qty: {order.orderQuantity})</option>)}</select></Field><Field label="Shift"><select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}><option>Morning</option><option>Evening</option><option>Night</option></select></Field><Field label="Machine"><select value={form.machine} onChange={(e) => setForm({ ...form, machine: e.target.value, shortfallReason: '', shortfallOtherReason: '', reason: '', otherReason: '' })} required><option value="">Select active machine</option>{activeMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.id} — {machine.name}</option>)}</select></Field><Field label="Product / Part Number"><input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="e.g. KG-2048" required /></Field><Field label="Target Quantity"><input type="number" min="0" value={applicableTarget?.quantity ?? ''} readOnly placeholder="Select machine and date" required={!!form.machine} />{form.machine && !applicableTarget && <small className="form-message">No target is saved for this machine and date.</small>}</Field><Field label="Actual Quantity"><input type="number" min="0" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value, ...(e.target.value !== '' && Number(e.target.value) < targetQuantity ? {} : { shortfallReason: '', shortfallOtherReason: '' }) })} placeholder="0" required /></Field><Field label="Rejected Quantity"><input type="number" min="0" max={form.actual || undefined} value={form.rejected} onChange={(e) => setForm({ ...form, rejected: e.target.value, ...(Number(e.target.value || 0) > 0 ? {} : { reason: '', otherReason: '' }) })} placeholder="0" required /></Field><Field label="Good Quantity"><div className="calculated">{good}<span>AUTO CALCULATED</span></div></Field>{showShortfallDetails && <fieldset className="conditional-details field-wide"><legend>Shortfall Details</legend><div className="detail-summary"><span>Shortfall Quantity</span><strong>{shortfallQuantity}</strong></div><Field label="Shortfall Reason"><select value={form.shortfallReason} onChange={(e) => setForm({ ...form, shortfallReason: e.target.value, shortfallOtherReason: '' })} required={showShortfallDetails}><option value="">Select a reason (required)</option>{['Machine Breakdown', 'Production Delay', 'Raw Material Shortage', 'Manpower Shortage', 'Tool / Machine Setting Issue', 'Power Failure', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>{form.shortfallReason === 'Other' && <Field label="Other Reason"><input value={form.shortfallOtherReason} onChange={(e) => setForm({ ...form, shortfallOtherReason: e.target.value })} required={showShortfallDetails} placeholder="Describe the shortfall reason" /></Field>}</fieldset>}{showRejectionDetails && <fieldset className="conditional-details field-wide"><legend>Rejection Details</legend><div className="detail-summary"><span>Rejected Quantity</span><strong>{rejectedQuantity}</strong></div><Field label="Rejection Reason"><select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value, otherReason: '' })} required={showRejectionDetails}><option value="">Select a reason (required)</option>{['Dimensional Issue', 'Surface Defect', 'Wrong Size', 'Material Defect', 'Machine Setting Issue', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>{form.reason === 'Other' && <Field label="Other Reason"><input value={form.otherReason} onChange={(e) => setForm({ ...form, otherReason: e.target.value })} required={showRejectionDetails} placeholder="Describe the rejection reason" /></Field>}</fieldset>}</div><div className="form-actions"><span>Entry is saved to the configured production endpoint and this browser.</span><button className="primary-button save-button" type="submit">Save Production Entry <span>{icon('arrow')}</span></button></div></form></section>



      <section className="surface records-surface" id="records"><div className="section-heading"><div><span className="section-index">02</span><div><h2>Today's Production Entries</h2><p>{entries.length} entries in the demo</p></div></div><button className="text-button" onClick={() => setEntries([])}>Reset sample data</button></div><EntryTable entries={entries} /></section></> : <>{managerPage === 'dashboard' ? <><section className="filter-bar"><label>Date<input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></label><label>Shift<select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}><option>All shifts</option><option>Morning</option><option>Evening</option><option>Night</option></select></label><label>Machine<select value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)}><option>All machines</option>{Array.from(new Set([...machines.map((m) => m.id), ...entries.map((e) => e.machine)])).map((m) => <option key={m}>{m}</option>)}</select></label></section><section className="kpi-grid">{managerKpis.map((item) => <article className="kpi-card" key={item.label}><span className={`kpi-dot ${item.color}`} /><small>{item.label}</small><strong>{item.value}</strong><span>{item.meta}</span></article>)}</section><section className="surface records-surface manager-table"><div className="section-heading"><div><span className="section-index">01</span><div><h2>Machine-wise Production Details</h2><p>Output quality and target attainment by machine</p></div></div><span className="result-count">{filtered.length} MACHINES / RECORDS</span></div><div className="table-wrap"><table><thead><tr><th>Machine</th><th>Target</th><th>Actual</th><th>Good Qty.</th><th>Rejected</th><th>Achievement</th><th>Shortfall</th><th>Shortfall Reason</th><th>Rejection Reason</th></tr></thead><tbody>{filtered.map((e, i) => <tr key={`${e.machine}-${i}`}><td><b className="machine-name">{icon('gear')}{e.machine}</b></td><td>{e.target}</td><td>{e.actual}</td><td className="good-cell">{e.good}</td><td className={e.rejected ? 'reject-cell' : ''}>{e.rejected}</td><td><span className="achievement">{e.target ? Math.round(e.actual / e.target * 100) : 0}%</span></td><td>{Math.max(0, e.target - e.actual)}</td><td>{e.target > e.actual ? (e.shortfallReason || '—') : '—'}</td><td>{e.rejected > 0 ? (e.rejectionReason || '—') : '—'}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">No production records match these filters.</div>}</div></section><section className="surface records-surface manager-table"><div className="section-heading"><div><span className="section-index">02</span><div><h2>Production Problem Log</h2><p>{visibleProblemRows.length} problems match these filters</p></div></div></div><div className="manager-table-tools"><label>Production Date<input type="date" value={problemDateFilter} onChange={(event) => setProblemDateFilter(event.target.value)} /></label><label>Machine<select value={problemMachineFilter} onChange={(event) => setProblemMachineFilter(event.target.value)}><option>All machines</option>{problemMachineOptions.map((machine) => <option key={machine} value={machine}>{machine}</option>)}</select></label><label>Shift<select value={problemShiftFilter} onChange={(event) => setProblemShiftFilter(event.target.value)}><option>All shifts</option>{problemShiftOptions.map((shift) => <option key={shift} value={shift}>{shift}</option>)}</select></label><label>Status<select value={problemStatusFilter} onChange={(event) => setProblemStatusFilter(event.target.value as 'All' | ProblemStatus)}><option>All</option><option>Pending</option><option>In Progress</option><option>Resolved</option></select></label><input aria-label="Search machine ID, name, or shortfall reason" placeholder="Search machine or reason" value={problemSearch} onChange={(event) => setProblemSearch(event.target.value)} /><button className="secondary-button" type="button" onClick={() => { setProblemDateFilter(''); setProblemMachineFilter('All machines'); setProblemShiftFilter('All shifts'); setProblemStatusFilter('All'); setProblemSearch('') }}>Clear Filters</button></div><section className="kpi-grid"><article className="kpi-card"><small>Pending problems</small><strong>{problemStatusCounts.Pending}</strong></article><article className="kpi-card"><small>In Progress problems</small><strong>{problemStatusCounts['In Progress']}</strong></article><article className="kpi-card"><small>Resolved problems</small><strong>{problemStatusCounts.Resolved}</strong></article></section><div className="table-wrap"><table><thead><tr><th>Production Date</th><th>Shift</th><th>Machine</th><th>Shortfall Reason</th><th>Status</th></tr></thead><tbody>{visibleProblemRows.map(({ entry, key, status }) => <tr key={key}><td>{entry.date}</td><td>{entry.shift}</td><td><b>{entry.machine}</b></td><td>{entry.shortfallReason}</td><td><select aria-label={`Problem status for ${entry.machine} on ${entry.date}`} value={status} onChange={async (event) => {
  const newStatus = event.target.value as ProblemStatus;
  const previousStatus = status;

  // Update immediately for responsive UI; revert if the backend rejects the update.
  setProblemStatuses((current) => ({ ...current, [key]: newStatus }));

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateProblemStatus',
        productionDate: entry.date,
        machineName: entry.machine,
        shift: entry.shift,
        problemType: entry.problemType,
        shortfallReason: entry.shortfallReason,
        reason: entry.shortfallReason,
        status: newStatus,
      }),
    });

    const responseText = await response.text();
    let result: { success?: boolean; message?: string; error?: string };
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error('Problem status endpoint returned an unreadable response.');
    }

    if (!response.ok || result.success !== true) {
      throw new Error(result.message || result.error || 'Status update failed.');
    }

    // Keep the backend-confirmed status as the source of truth.
    setProblemLogEntries((current) => current.map((problem) => {
      const problemKey = `${problem.productionDate}-${problem.machineName}-${problem.shift}-${problem.problemType}-${problem.shortfallReason}`;
      return problemKey === key ? { ...problem, status: newStatus } : problem;
    }));
  } catch (error) {
    setProblemStatuses((current) => {
      const next = { ...current };
      if (previousStatus === problemLogEntries.find((problem) =>
        `${problem.productionDate}-${problem.machineName}-${problem.shift}-${problem.problemType}-${problem.shortfallReason}` === key
      )?.status) {
        delete next[key];
      } else {
        next[key] = previousStatus;
      }
      return next;
    });
    window.alert(error instanceof Error ? error.message : 'Status update failed.');
  }
}}><option>Pending</option><option>In Progress</option><option>Resolved</option></select></td></tr>)}</tbody></table>{visibleProblemRows.length === 0 && <div className="empty-state">No production problems match these filters.</div>}</div></section></> : null}{managerPage === 'order-management' && (
  <section className="surface records-surface">
    <div className="section-heading">
      <div>
        <span className="section-index">01</span>
        <div>
          <h2>Order Management</h2>
          <p>Register and track customer orders</p>
        </div>
      </div>
      <span className="draft-label">ORDER TRACKING</span>
    </div>

    <form className="entry-form" onSubmit={saveOrderForm}>
      <div className="form-grid">
        <Field label="Order Date"><input type="date" value={orderForm.orderDate} onChange={(event) => setOrderForm({ ...orderForm, orderDate: event.target.value })} required /></Field>
        <Field label="Product Name"><input value={orderForm.productName} onChange={(event) => setOrderForm({ ...orderForm, productName: event.target.value })} placeholder="Enter product name" required /></Field>
        <Field label="Part Number"><input value={orderForm.partNumber} onChange={(event) => setOrderForm({ ...orderForm, partNumber: event.target.value })} placeholder="Enter part number" /></Field>
        <Field label="Order Quantity"><input type="number" min="1" step="1" value={orderForm.orderQuantity} onChange={(event) => setOrderForm({ ...orderForm, orderQuantity: event.target.value })} placeholder="Enter quantity" required /></Field>
        <Field label="Material Specification"><input value={orderForm.materialSpecification} onChange={(event) => setOrderForm({ ...orderForm, materialSpecification: event.target.value })} placeholder="Enter material / grade" /></Field>
        <Field label="Delivery Date"><input type="date" min={orderForm.orderDate} value={orderForm.deliveryDate} onChange={(event) => setOrderForm({ ...orderForm, deliveryDate: event.target.value })} required /></Field>
        <Field label="Priority"><select value={orderForm.priority} onChange={(event) => setOrderForm({ ...orderForm, priority: event.target.value })}><option>Normal</option><option>High</option><option>Urgent</option></select></Field>
        <Field label="Remarks"><input value={orderForm.remarks} onChange={(event) => setOrderForm({ ...orderForm, remarks: event.target.value })} placeholder="Optional notes" /></Field>
      </div>
      {orderError && <p className="form-message" role="alert">{orderError}</p>}
      {orderMessage && <p className="form-message" role="status">{orderMessage}</p>}
      <button className="primary-button" type="submit" disabled={orderSaving}>{orderSaving ? 'Saving Order…' : 'Save Order'} <span>{icon('arrow')}</span></button>
    </form>

    <section className="surface" style={{ marginTop: '1.25rem' }}>
      <div className="section-heading"><div><span className="section-index">02</span><div><h2>Registered Orders</h2><p>Orders retrieved from Google Sheets</p></div></div><span className="draft-label">{orders.length} ORDERS</span></div>
      {ordersLoading ? <div className="empty-state">Loading orders…</div> : orders.length === 0 ? <div className="empty-state">No orders found in Order_Master.</div> : <div className="table-wrap"><table><thead><tr><th>Order ID</th><th>Order Date</th><th>Product</th><th>Part Number</th><th>Quantity</th><th>Material</th><th>Delivery Date</th><th>Priority</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{orders.map((order) => <tr key={order.orderId}><td><b>{order.orderId}</b></td><td>{order.orderDate}</td><td>{order.productName}</td><td>{order.partNumber || '—'}</td><td>{order.orderQuantity}</td><td>{order.materialSpecification || '—'}</td><td>{order.deliveryDate}</td><td>{order.priority}</td><td>{order.status}</td><td>{order.remarks || '—'}</td></tr>)}</tbody></table></div>}
      <div className="section-heading" style={{ marginTop: '1.25rem' }}><div><span className="section-index">03</span><div><h2>Order Production Progress</h2><p>Production records linked by Order ID</p></div></div></div>
      <div className="table-wrap"><table><thead><tr><th>Order ID</th><th>Order Quantity</th><th>Produced Quantity</th><th>Balance Quantity</th><th>Progress</th></tr></thead><tbody>{orders.map((order) => { const produced = entries.filter((entry) => entry.orderId === order.orderId).reduce((sum, entry) => sum + entry.actual, 0); const balance = Math.max(0, order.orderQuantity - produced); const progress = order.orderQuantity > 0 ? Math.min(100, Math.round(produced / order.orderQuantity * 100)) : 0; return <tr key={`progress-${order.orderId}`}><td><b>{order.orderId}</b></td><td>{order.orderQuantity}</td><td>{produced}</td><td>{balance}</td><td>{progress}%</td></tr>})}</tbody></table>{orders.length === 0 && <div className="empty-state">Register an order to see progress here.</div>}</div>
    </section>
  </section>
)}
{managerPage === 'quality-rework' && <section className="surface records-surface">
  <div className="section-heading"><div><span className="section-index">04</span><div><h2>Quality Inspection & Rework</h2><p>Record inspection results against an order</p></div></div><span className="draft-label">GOOGLE SHEETS</span></div>
  <form className="entry-form" onSubmit={async (event) => {
    event.preventDefault(); setQualitySaving(true); setQualityMessage(''); setQualityError('');
    const inspected = Number(qualityForm.inspectedQty), accepted = Number(qualityForm.acceptedQty), rejected = Number(qualityForm.rejectedQty), rework = Number(qualityForm.reworkQty), completed = Number(qualityForm.reworkCompletedQty);
    console.log('QUALITY DEBUG:', {
      inspected,
      accepted,
      rejected,
      rework,
      completed,
      total: accepted + rejected,
      orderId: qualityForm.orderId,
      inspectionDate: qualityForm.inspectionDate,
    });
    if (!qualityForm.orderId || !qualityForm.inspectionDate || inspected < 0 || accepted < 0 || rejected < 0 || rework < 0 || completed < 0 || accepted + rejected !== inspected || completed > rework) { setQualityError('Check required fields and quantity limits. Accepted + rejected must equal inspected; completed rework cannot exceed rework quantity.'); setQualitySaving(false); return; }
    try {
      const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'saveQuality', data: { Order_ID: qualityForm.orderId, Production_ID: qualityForm.productionId, Inspection_Date: qualityForm.inspectionDate, Inspected_Qty: inspected, Accepted_Qty: accepted, Rejected_Qty: rejected, Rework_Qty: rework, Rework_Status: qualityForm.reworkStatus, Rework_Completed_Qty: completed, Rejection_Reason: qualityForm.rejectionReason, Remarks: qualityForm.remarks } }) });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.message || result.error || 'Quality record was not saved.');
      setQualityMessage('Quality/Rework record saved.'); setQualityForm({ orderId: '', productionId: '', inspectionDate: todayDate(), inspectedQty: '', acceptedQty: '', rejectedQty: '0', reworkQty: '0', reworkStatus: 'Not Required', reworkCompletedQty: '0', rejectionReason: '', remarks: '' });
      const refreshed = await fetch(`${API_URL}?action=qualityRecords`, { method: 'GET', redirect: 'follow' }); const body = await refreshed.text(); const data = JSON.parse(body) as { success?: boolean; records?: QualityRecord[]; error?: string; message?: string }; if (!refreshed.ok || data.success !== true || !Array.isArray(data.records)) throw new Error(data.error || data.message || 'Quality record saved, but the refreshed list could not be loaded.'); setQualityRecords(data.records);
    } catch (error) { setQualityError(error instanceof Error ? error.message : 'Unable to save quality record.'); } finally { setQualitySaving(false); }
  }}>
    <div className="form-grid">
      <Field label="Order ID"><select value={qualityForm.orderId} onChange={e => setQualityForm({...qualityForm, orderId:e.target.value})} required><option value="">Select order</option>{orders.map(o=><option key={o.orderId} value={o.orderId}>{o.orderId} — {o.productName}</option>)}</select></Field>
      <Field label="Production ID (optional)"><input value={qualityForm.productionId} onChange={e=>setQualityForm({...qualityForm,productionId:e.target.value})} /></Field>
      <Field label="Inspection Date"><input type="date" value={qualityForm.inspectionDate} onChange={e=>setQualityForm({...qualityForm,inspectionDate:e.target.value})} required /></Field>
      <Field label="Inspected Qty"><input type="number" min="0" value={qualityForm.inspectedQty} onChange={e=>setQualityForm({...qualityForm,inspectedQty:e.target.value})} required /></Field>
      <Field label="Accepted Qty"><input type="number" min="0" value={qualityForm.acceptedQty} onChange={e=>setQualityForm({...qualityForm,acceptedQty:e.target.value})} required /></Field>
      <Field label="Rejected Qty"><input type="number" min="0" value={qualityForm.rejectedQty} onChange={e=>setQualityForm({...qualityForm,rejectedQty:e.target.value})} required /></Field>
      <Field label="Rework Qty"><input type="number" min="0" value={qualityForm.reworkQty} onChange={e=>setQualityForm({...qualityForm,reworkQty:e.target.value})} required /></Field>
      <Field label="Rework Status"><select value={qualityForm.reworkStatus} onChange={e=>setQualityForm({...qualityForm,reworkStatus:e.target.value})}><option>Not Required</option><option>Pending</option><option>In Progress</option><option>Completed</option></select></Field>
      <Field label="Rework Completed Qty"><input type="number" min="0" value={qualityForm.reworkCompletedQty} onChange={e=>setQualityForm({...qualityForm,reworkCompletedQty:e.target.value})} required /></Field>
      <Field label="Rejection Reason"><input value={qualityForm.rejectionReason} onChange={e=>setQualityForm({...qualityForm,rejectionReason:e.target.value})} /></Field>
      <Field label="Remarks"><input value={qualityForm.remarks} onChange={e=>setQualityForm({...qualityForm,remarks:e.target.value})} /></Field>
    </div>
    {qualityError && <p className="form-message" role="alert">{qualityError}</p>}{qualityMessage && <p className="form-message" role="status">{qualityMessage}</p>}
    <button className="primary-button" type="submit" disabled={qualitySaving}>{qualitySaving ? 'Saving…' : 'Save Quality Record'}</button>
  </form>
  <h3>Saved Quality / Rework Records</h3>{qualityLoading ? <div className="empty-state">Loading records…</div> : <div className="table-wrap"><table><thead><tr><th>Quality ID</th><th>Order</th><th>Inspection Date</th><th>Inspected</th><th>Accepted</th><th>Rejected</th><th>Rework Qty</th><th>Status</th><th>Completed</th><th>Reason</th></tr></thead><tbody>{qualityRecords.map((r,i)=><tr key={r.Quality_ID || i}><td>{r.Quality_ID || '—'}</td><td>{r.Order_ID}</td><td>{normalizeSheetDate(r.Inspection_Date)}</td><td>{r.Inspected_Qty}</td><td>{r.Accepted_Qty}</td><td>{r.Rejected_Qty}</td><td>{r.Rework_Qty}</td><td>{r.Rework_Status}</td><td>{r.Rework_Completed_Qty}</td><td>{r.Rejection_Reason || '—'}</td></tr>)}</tbody></table>{qualityRecords.length===0 && <div className="empty-state">No quality records yet.</div>}</div>}
</section>}
{managerPage === 'dispatch-tracking' && <section className="surface records-surface">
  <div className="section-heading"><div><span className="section-index">05</span><div><h2>Dispatch Tracking</h2><p>Record finished order quantities dispatched</p></div></div><span className="draft-label">GOOGLE SHEETS</span></div>
  <form className="entry-form" onSubmit={async event => {
    event.preventDefault(); setDispatchSaving(true); setDispatchMessage(''); setDispatchError('');
    const qty=Number(dispatchForm.dispatchQty); if (!dispatchForm.orderId || !dispatchForm.dispatchDate || !Number.isFinite(qty) || qty<=0) {setDispatchError('Select an order, date, and a dispatch quantity greater than zero.');setDispatchSaving(false);return;}
    try {
      const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'saveDispatch', data: { Order_ID: dispatchForm.orderId, Dispatch_Date: dispatchForm.dispatchDate, Production_Date: dispatchForm.dispatchDate, Dispatch_Qty: qty, Remarks: dispatchForm.remarks } }) });
      const responseText = await response.text();
      let result: { success?: boolean; message?: string; error?: string };
      try { result = JSON.parse(responseText) as typeof result; }
      catch { throw new Error(`Dispatch save returned unreadable data: ${responseText.trim() || `HTTP ${response.status}`}`); }
      if (!response.ok || result.success !== true) throw new Error(result.message || result.error || `Dispatch was not saved (HTTP ${response.status}).`);
      setDispatchMessage('Dispatch record saved.');
      setDispatchForm({ orderId: '', dispatchDate: todayDate(), dispatchQty: '', remarks: '' });
      const refreshed = await fetch(`${API_URL}?action=dispatchRecords`, { method: 'GET', redirect: 'follow' });
      const refreshedText = await refreshed.text();
      let data: { success?: boolean; records?: DispatchRecord[]; message?: string; error?: string };
      try { data = JSON.parse(refreshedText) as typeof data; }
      catch { throw new Error(`Dispatch was saved, but the records list returned unreadable data: ${refreshedText.trim() || `HTTP ${refreshed.status}`}`); }
      if (!refreshed.ok || data.success !== true || !Array.isArray(data.records)) throw new Error(data.error || data.message || 'Dispatch was saved, but its records could not be refreshed.');
      setDispatchRecords(data.records);
    }
    catch(error) { setDispatchError(error instanceof Error ? error.message : 'Unable to save dispatch.'); }
    finally { setDispatchSaving(false); }
  }}>
    <div className="form-grid">
      <Field label="Order ID"><select value={dispatchForm.orderId} onChange={e=>setDispatchForm({...dispatchForm,orderId:e.target.value})} required><option value="">Select order</option>{orders.map(o=><option key={o.orderId} value={o.orderId}>{o.orderId} — {o.productName} (Qty: {o.orderQuantity})</option>)}</select></Field>
      <Field label="Dispatch Date"><input type="date" value={dispatchForm.dispatchDate} onChange={e=>setDispatchForm({...dispatchForm,dispatchDate:e.target.value})} required /></Field>
      <Field label="Dispatch Qty"><input type="number" min="1" value={dispatchForm.dispatchQty} onChange={e=>setDispatchForm({...dispatchForm,dispatchQty:e.target.value})} required /></Field>
      <Field label="Remarks"><input value={dispatchForm.remarks} onChange={e=>setDispatchForm({...dispatchForm,remarks:e.target.value})} /></Field>
    </div>
    {dispatchError && <p className="form-message" role="alert">{dispatchError}</p>}{dispatchMessage && <p className="form-message" role="status">{dispatchMessage}</p>}
    <button className="primary-button" type="submit" disabled={dispatchSaving}>{dispatchSaving ? 'Saving…' : 'Save Dispatch'}</button>
  </form>
  <h3>Saved Dispatch Records</h3>{dispatchLoading?<div className="empty-state">Loading records…</div>:<div className="table-wrap"><table><thead><tr><th>Dispatch ID</th><th>Order ID</th><th>Dispatch Date</th><th>Dispatch Qty</th><th>Remarks</th></tr></thead><tbody>{dispatchRecords.map((r,i)=><tr key={r.Dispatch_ID||i}><td>{r.Dispatch_ID||'—'}</td><td>{r.Order_ID}</td><td>{normalizeSheetDate(r.Dispatch_Date)}</td><td>{r.Dispatch_Qty}</td><td>{r.Remarks||'—'}</td></tr>)}</tbody></table>{dispatchRecords.length===0&&<div className="empty-state">No dispatch records yet.</div>}</div>}
</section>}
<div className={`manager-machine-page${managerPage === 'machine-management' ? '' : ' is-hidden'}`}><ManagerMachineSetup machines={machines} setMachines={setMachines} targets={targets} setTargets={setTargets} machineSyncState={machineSyncState} setMachineSyncState={setMachineSyncState} /></div>{managerPage === 'machine-process-planning' && <MachineProcessPlanning />}</>}



    <footer className="dashboard-footer">KINETIC GEARS · NAGPUR <span>PRODUCTION MONITORING SYSTEM</span><span className="local-note">{machineSyncState === 'loaded' ? 'Machine Master list loaded from Google Sheets.' : machineSyncState === 'loading' ? 'Loading Machine Master from Google Sheets.' : 'Machine Master could not be confirmed from Google Sheets; local demo data may be shown.'} Machine targets load from and save to Google Sheets; production entries are also sent to the configured endpoint.</span></footer></main></div>



}







function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`field${wide ? ' field-wide' : ''}`}><span>{label}</span>{children}</label> }



function ManagerMachineSetup({ machines, setMachines, targets, setTargets, machineSyncState, setMachineSyncState }: { machines: Machine[]; setMachines: React.Dispatch<React.SetStateAction<Machine[]>>; targets: MachineTarget[]; setTargets: React.Dispatch<React.SetStateAction<MachineTarget[]>>; machineSyncState: 'loading' | 'loaded' | 'error'; setMachineSyncState: React.Dispatch<React.SetStateAction<'loading' | 'loaded' | 'error'>> }) {



  const [targetDate, setTargetDate] = useState(todayDate())



  const [targetMachine, setTargetMachine] = useState('')



  const [targetQuantity, setTargetQuantity] = useState('')



  const [editingTarget, setEditingTarget] = useState<string | null>(null)



  const [machineForm, setMachineForm] = useState<Machine>({ id: '', name: '', type: '', status: 'Active', remarks: '' })



  const [editingMachine, setEditingMachine] = useState<string | null>(null)



  const [machineSearch, setMachineSearch] = useState('')



  const [statusFilter, setStatusFilter] = useState('All statuses')



  const [targetSearch, setTargetSearch] = useState('')



  const [targetFilterDate, setTargetFilterDate] = useState('')



  const filteredTargets = targets.filter((target) => (!targetFilterDate || target.date === targetFilterDate) && (!targetSearch || `${target.date} ${target.machineId}`.toLowerCase().includes(targetSearch.toLowerCase())))



  const filteredMachines = machines.filter((machine) => (statusFilter === 'All statuses' || machine.status === statusFilter) && `${machine.id} ${machine.name} ${machine.type} ${machine.remarks}`.toLowerCase().includes(machineSearch.toLowerCase()))







  async function saveTarget(event: React.FormEvent<HTMLFormElement>) {



    event.preventDefault()







    const quantity = Number(targetQuantity)







    if (!targetMachine || !targetDate || !Number.isFinite(quantity) || quantity < 0) {



      window.alert('Please enter a valid date, machine and target quantity.')



      return



    }







    // Editing existing targets is not supported by the current backend route.



    if (editingTarget) {



      window.alert('Backend update support is not configured yet. Please add a new target for now.')



      return



    }







    const payload = {



      action: 'saveMachineTarget',



      Target_Date: targetDate,



      Machine_ID: targetMachine,



      Target_Qty: quantity,



      Remarks: '',



      Created_By: 'Manager'



    }







    try {



      const response = await fetch(API_URL, {



        method: 'POST',



        headers: {



          'Content-Type': 'text/plain;charset=utf-8'



        },



        body: JSON.stringify(payload)



      })







      if (!response.ok) {



        throw new Error(`Server returned HTTP ${response.status}`)



      }







      const result = await response.json()







      if (result.success !== true) {



        throw new Error(result.message || 'Backend did not confirm the target save.')



      }







      const savedTarget: MachineTarget = {



        id: String(result.targetId ?? ''),



        date: targetDate,



        machineId: targetMachine,



        quantity,



        unit: 'Nos'



      }







      setTargets(current => [savedTarget, ...current])



      setEditingTarget(null)



      setTargetQuantity('')







      window.alert('Machine target saved successfully.')







    } catch (error) {



      const message = error instanceof Error ? error.message : 'Unknown error'



      window.alert(`Unable to save machine target: ${message}`)



    }



  }















  function clearMachineForm() { setMachineForm({ id: '', name: '', type: '', status: 'Active', remarks: '' }); setEditingMachine(null) }



  async function saveMachine(event: React.FormEvent<HTMLFormElement>) {



    event.preventDefault()



    const record = { ...machineForm, id: machineForm.id.trim(), name: machineForm.name.trim(), remarks: machineForm.remarks.trim() }



    if (!record.id || !record.name) return



    if (machines.some((machine) => machine.id.toLowerCase() === record.id.toLowerCase() && machine.id !== editingMachine)) { window.alert('A machine with this ID already exists.'); return }



    try {

      const response = await fetch(`${API_URL}?action=saveMachine`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'saveMachine', Machine_ID: record.id, Machine_Name: record.name, Department: record.type, Active_Status: record.status }) })

      const responseBody = await response.text()

      let result: Record<string, unknown>

      try {

        const parsed: unknown = JSON.parse(responseBody)

        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid response')

        result = parsed as Record<string, unknown>

      } catch {

        const detail = responseBody.trim() || `Server returned HTTP ${response.status} without an error message.`

        throw new Error(detail)

      }

      if (!response.ok || result.success !== true) {

        const backendError = result.error ?? result.errorMessage ?? result.message

        throw new Error(typeof backendError === 'string' && backendError.trim() ? backendError : `Server returned HTTP ${response.status} without an error message.`)

      }

      setMachines((current) => editingMachine ? current.map((machine) => machine.id === editingMachine ? record : machine) : [...current, record])

      clearMachineForm()

      try {

        const refreshedMachines = await fetchBackendMachines()

        setMachines(refreshedMachines)

        setMachineSyncState('loaded')

        window.alert('Machine saved successfully to Google Sheets.')

      } catch (refreshError) {

        setMachineSyncState('error')

        const detail = refreshError instanceof Error ? refreshError.message : 'Unknown error'

        window.alert(`Machine was saved to Google Sheets, but the list could not be refreshed: ${detail}`)

      }

    } catch (error) {

      const message = error instanceof Error ? error.message : 'Unknown error'

      window.alert(`Unable to save machine to Google Sheets: ${message}`)

    }



  }



  return <div className="manager-machine-setup">



    <section className="surface manager-config-card"><div className="section-heading"><div><span className="section-index">02</span><div><h2>Machine Targets</h2><p>Set production targets by machine and date</p></div></div><span className="draft-label">GOOGLE SHEETS</span></div>



      <form className="entry-form" onSubmit={saveTarget}><div className="form-grid target-form-grid"><Field label="Target Date"><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></Field><Field label="Machine"><select value={targetMachine} onChange={(event) => setTargetMachine(event.target.value)} required><option value="">Select machine</option>{machines.filter((machine) => machine.status === 'Active').map((machine) => <option key={machine.id} value={machine.id}>{machine.id} — {machine.name}</option>)}</select></Field><Field label="Target Quantity"><input type="number" min="0" value={targetQuantity} onChange={(event) => setTargetQuantity(event.target.value)} placeholder="0" required /></Field><div className="target-submit"><button className="primary-button save-button" type="submit">{editingTarget ? 'Update Target' : 'Save Target'}</button></div></div></form>



      <div className="manager-table-tools"><input aria-label="Search targets" placeholder="Search targets" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} /><label>Date filter<input type="date" value={targetFilterDate} onChange={(event) => setTargetFilterDate(event.target.value)} /></label></div>



      <div className="table-wrap"><table><thead><tr><th>Target Date</th><th>Machine ID</th><th>Machine Name</th><th>Target Quantity</th><th>Actions</th></tr></thead><tbody>{filteredTargets.map((target) => <tr key={target.id}><td>{target.date}</td><td><b>{target.machineId}</b></td><td>{machines.find((machine) => machine.id === target.machineId)?.name ?? 'Machine unavailable'}</td><td>{target.quantity} {target.unit ?? 'Nos'}</td><td className="table-actions"><button type="button" onClick={() => { setEditingTarget(target.id); setTargetDate(target.date); setTargetMachine(target.machineId); setTargetQuantity(String(target.quantity)) }}>Edit</button><button type="button" className="danger-action" onClick={() => setTargets((current) => current.filter((item) => item.id !== target.id))}>Delete</button></td></tr>)}</tbody></table>{filteredTargets.length === 0 && <div className="empty-state">No saved targets match the selected filters.</div>}</div>



    </section>



    <section className="manager-master-title"><div><span className="section-index">03</span><div><h2>Machine Master</h2><p>Manage the machines available for production planning</p></div></div><span className="draft-label">{machineSyncState === 'loaded' ? 'GOOGLE SHEETS' : machineSyncState === 'loading' ? 'LOADING SHEETS' : 'SHEETS UNAVAILABLE · LOCAL DATA'}</span></section>



    <section className="surface manager-config-card"><div className="section-heading"><div><span className="section-index">A</span><div><h2>{editingMachine ? 'Edit Machine' : 'Add New Machine'}</h2><p>Enter machine details</p></div></div></div>



      <form className="entry-form" onSubmit={saveMachine}><div className="form-grid"><Field label="Machine ID"><input value={machineForm.id} onChange={(event) => setMachineForm({ ...machineForm, id: event.target.value })} placeholder="Machine ID" required disabled={!!editingMachine} /></Field><Field label="Machine Name"><input value={machineForm.name} onChange={(event) => setMachineForm({ ...machineForm, name: event.target.value })} placeholder="Machine name" required /></Field><Field label="Machine Type"><select value={machineForm.type} onChange={(event) => setMachineForm({ ...machineForm, type: event.target.value })} required><option value="">Select type</option>{['CNC Turning', 'Gear Hobbing', 'Gear Shaping', 'Gear Grinding', 'Machining', 'Drilling', 'Heat Treatment', 'Quality Inspection', 'CNC', 'Lathe', 'Milling', 'Grinding', 'Other'].map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Status"><select value={machineForm.status} onChange={(event) => setMachineForm({ ...machineForm, status: event.target.value as Machine['status'] })}><option>Active</option><option>Maintenance</option><option>Inactive</option></select></Field><Field label="Remarks" wide><input value={machineForm.remarks} onChange={(event) => setMachineForm({ ...machineForm, remarks: event.target.value })} placeholder="Optional remarks" /></Field></div><div className="form-actions machine-form-actions"><span>{machineSyncState === 'loaded' ? 'Machine Master list is loaded from Google Sheets.' : machineSyncState === 'loading' ? 'Loading Machine Master from Google Sheets...' : 'Google Sheets unavailable; displayed machines may be browser demo data.'}</span><div><button className="secondary-button" type="button" onClick={clearMachineForm}>Clear</button><button className="primary-button save-button" type="submit">{editingMachine ? 'Update Machine' : 'Add Machine'}</button></div></div></form>



    </section>



    <section className="surface manager-config-card"><div className="section-heading"><div><span className="section-index">B</span><div><h2>Machine List</h2><p>{filteredMachines.length} machines</p></div></div></div><div className="manager-table-tools"><input aria-label="Search machines" placeholder="Search machine ID, name, type, remarks" value={machineSearch} onChange={(event) => setMachineSearch(event.target.value)} /><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option><option>Active</option><option>Maintenance</option><option>Inactive</option></select></label></div><div className="table-wrap"><table><thead><tr><th>Machine ID</th><th>Machine Name</th><th>Machine Type</th><th>Status</th><th>Remarks</th><th>Actions</th></tr></thead><tbody>{filteredMachines.map((machine) => <tr key={machine.id}><td><b>{machine.id}</b></td><td>{machine.name}</td><td>{machine.type}</td><td><span className={`machine-status ${machine.status.toLowerCase()}`}>{machine.status}</span></td><td>{machine.remarks || '—'}</td><td className="table-actions"><button type="button" onClick={() => { setEditingMachine(machine.id); setMachineForm(machine) }}>Edit</button><button type="button" className="danger-action" onClick={() => { setMachines((current) => current.filter((item) => item.id !== machine.id)); setTargets((current) => current.filter((target) => target.machineId !== machine.id)); if (editingMachine === machine.id) clearMachineForm() }}>Delete</button></td></tr>)}</tbody></table>{filteredMachines.length === 0 && <div className="empty-state">No saved machines match the selected filters.</div>}</div></section>



  </div>



}



function EntryTable({ entries }: { entries: Entry[] }) {



  return <div className="table-wrap"><table><thead><tr><th>Date</th><th>Shift</th><th>Machine</th><th>Product</th><th>Target</th><th>Actual</th><th>Good</th><th>Rejected</th><th>Shortfall Qty.</th><th>Shortfall Reason</th><th>Rejection Reason</th></tr></thead><tbody>{entries.map((e, i) => { const shortfall = Math.max(0, e.target - e.actual); const rejectionReason = e.rejectionReason || ''; return <tr key={e.machine + '-' + i}><td>{new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td><td><span className="shift-pill">{e.shift}</span></td><td><b>{e.machine}</b></td><td>{e.product}</td><td>{e.target}</td><td>{e.actual}</td><td className="good-cell">{e.good}</td><td className={e.rejected ? 'reject-cell' : ''}>{e.rejected}</td><td>{shortfall > 0 ? shortfall : '—'}</td><td>{shortfall > 0 ? (e.shortfallReason || '—') : '—'}</td><td>{e.rejected > 0 ? (rejectionReason || '—') : '—'}</td></tr>})}</tbody></table>{entries.length === 0 && <div className="empty-state">No entries yet. Add your first production entry above.</div>}</div>



}







export default App

type MachineProcessJourney = {
  journeyId: string;
  orderId: string;
  partNumber: string;
  machineId: string;
  processName: string;
  sequence: number;
  plannedQty: number;
  completedQty: number;
  pendingQty: number;
  status: string;
  assignedSupervisorEmail: string;
};

function MachineProcessPlanning() {
  const [journeys, setJourneys] = useState<MachineProcessJourney[]>([]);
  const [trackingRecords, setTrackingRecords] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    orderId: '', partNumber: '', machineId: '', processName: '',
    plannedQty: '', plannedDate: todayDate(), remarks: '',
    assignedSupervisorEmail: '',
  });

  const nextSequence = journeys
    .filter(journey => journey.orderId.trim() === form.orderId.trim())
    .reduce((max, journey) => Math.max(max, journey.sequence || 0), 0) + 1;

  const loadJourneys = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}?action=machineProcessJourney`, { method: 'GET', redirect: 'follow' });
      const result = await response.json();
      if (!response.ok || result.success !== true || !Array.isArray(result.journeys)) {
        throw new Error(String(result.message || result.error || 'Unable to load process plans'));
      }
      setJourneys(result.journeys.map((row: Record<string, unknown>) => ({
        journeyId: String(row.Machine_Process_Journey_ID ?? ''),
        orderId: String(row.Order_ID ?? ''),
        partNumber: String(row.Part_Number ?? ''),
        machineId: String(row.Machine_ID ?? ''),
        processName: String(row.Process_Name ?? ''),
        sequence: Number(row.Process_Sequence ?? 1),
        plannedQty: Number(row.Planned_Qty ?? 0),
        completedQty: Number(row.Completed_Qty ?? 0),
        pendingQty: Number(row.Pending_Qty ?? 0),
        status: String(row.Process_Status ?? 'Planned'),
        assignedSupervisorEmail: String(row.Assigned_Supervisor_Email ?? '').trim().toLowerCase(),
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load process plans');
    } finally { setLoading(false); }
  };

  const loadTracking = async () => {
    setTrackingLoading(true);
    try {
      const response = await fetch(`${API_URL}?action=machineProcessTracking`, { method: 'GET', redirect: 'follow' });
      const result = await response.json();
      if (!response.ok || result.success !== true || !Array.isArray(result.records)) {
        throw new Error(String(result.message || result.error || 'Unable to load daily tracking records'));
      }
      setTrackingRecords(result.records as Record<string, string>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load daily tracking records');
    } finally { setTrackingLoading(false); }
  };

  const refreshAll = async () => { await Promise.all([loadJourneys(), loadTracking()]); };
  useEffect(() => { void refreshAll(); }, []);

  const savePlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      if (!form.orderId.trim()) throw new Error('Enter an Order ID.');
      if (!form.assignedSupervisorEmail.trim()) throw new Error('Please select a Supervisor for this process.');
      const payload = {
        action: 'saveMachineProcessPlan',
        Order_ID: form.orderId.trim(),
        Part_Number: form.partNumber.trim(),
        Process_Sequence: nextSequence,
        Process_Name: form.processName.trim(),
        Machine_ID: form.machineId.trim(),
        Planned_Qty: Number(form.plannedQty),
        Assigned_Supervisor_Email: form.assignedSupervisorEmail.trim().toLowerCase(),
      };
      const response = await fetch(API_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) {
        throw new Error(String(result.message || result.error || 'Could not save process plan'));
      }
      setMessage(`Process plan saved${result.machineProcessJourneyId ? ` (${result.machineProcessJourneyId})` : ''}.`);
      setForm({ orderId: '', partNumber: '', machineId: '', processName: '', plannedQty: '', plannedDate: todayDate(), remarks: '', assignedSupervisorEmail: '' });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save process plan');
    } finally { setSaving(false); }
  };

  const updateProgress = async (journey: MachineProcessJourney, completedQty: number) => {
    const safeQty = Number(completedQty);
    if (!Number.isFinite(safeQty) || safeQty < 0 || safeQty > journey.plannedQty) {
      setError(`Completed quantity must be between 0 and ${journey.plannedQty}.`); return;
    }
    setError(''); setMessage('');
    try {
      const response = await fetch(API_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'updateMachineProcessProgress', Machine_Process_Journey_ID: journey.journeyId, Completed_Qty: safeQty }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(String(result.message || result.error || 'Progress update failed'));
      setMessage(`Progress updated for ${journey.journeyId}.`);
      await loadJourneys();
    } catch (e) { setError(e instanceof Error ? e.message : 'Progress update failed'); }
  };

  return <div className="manager-machine-setup">
    <section className="surface manager-config-card">
      <div className="section-heading">
        <div><span className="section-index">06</span><div><h2>Machine Process Planning</h2><p>Plan order-wise process stages and assign each process to a Supervisor</p></div></div>
        <span className="draft-label">GOOGLE SHEETS</span>
      </div>
      <form className="entry-form" onSubmit={savePlan}>
        <div className="form-grid">
          <Field label="Order ID"><input value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })} placeholder="Enter registered Order ID" required /></Field>
          <Field label="Part Number"><input value={form.partNumber} onChange={e => setForm({ ...form, partNumber: e.target.value })} placeholder="Part number" required /></Field>
          <Field label="Machine ID"><input value={form.machineId} onChange={e => setForm({ ...form, machineId: e.target.value })} placeholder="Machine ID" required /></Field>
          <Field label="Process Name"><input value={form.processName} onChange={e => setForm({ ...form, processName: e.target.value })} placeholder="e.g. Turning" required /></Field>
          <Field label="Process Sequence (Automatic)"><input type="number" value={form.orderId.trim() ? nextSequence : ''} readOnly aria-readonly="true" /></Field>
          <Field label="Planned Quantity"><input type="number" min="1" step="1" value={form.plannedQty} onChange={e => setForm({ ...form, plannedQty: e.target.value })} required /></Field>
          <Field label="Assigned Supervisor"><select value={form.assignedSupervisorEmail} onChange={e => setForm({ ...form, assignedSupervisorEmail: e.target.value })} required>
            <option value="">Select Supervisor</option>
            {demoAccounts.filter(account => account.role === 'Supervisor').map(account => <option key={account.email} value={account.email}>{account.email}</option>)}
          </select></Field>
          <Field label="Planned Date"><input type="date" value={form.plannedDate} onChange={e => setForm({ ...form, plannedDate: e.target.value })} required /></Field>
          <Field label="Remarks" wide><input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Optional" /></Field>
        </div>
        <div className="form-actions"><span>{message || error}</span><button className="primary-button save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Process Plan'}</button></div>
      </form>
    </section>

    <section className="surface records-surface">
      <div className="section-heading"><div><span className="section-index">07</span><div><h2>Process Journey & Progress</h2><p>Review planned, completed and pending quantities by process</p></div></div><button className="secondary-button" type="button" onClick={() => void refreshAll()}>Refresh</button></div>
      {loading ? <div className="empty-state">Loading process journey…</div> : <div className="table-wrap">
        <table><thead><tr><th>Journey ID</th><th>Order</th><th>Part</th><th>Machine</th><th>Process</th><th>Sequence</th><th>Planned</th><th>Completed</th><th>Pending</th><th>Status</th><th>Assigned Supervisor</th><th>Manager Override</th></tr></thead>
          <tbody>{journeys.map(j => <tr key={j.journeyId}>
            <td>{j.journeyId}</td><td>{j.orderId}</td><td>{j.partNumber}</td><td>{j.machineId}</td><td>{j.processName}</td><td>{j.sequence}</td><td>{j.plannedQty}</td><td>{j.completedQty}</td><td>{j.pendingQty}</td><td>{j.status}</td><td>{j.assignedSupervisorEmail || '—'}</td>
            <td><button type="button" className="secondary-button" onClick={() => {
              const raw = window.prompt(`Set cumulative completed quantity for ${j.journeyId}`, String(j.completedQty));
              if (raw !== null && raw.trim() !== '') void updateProgress(j, Number(raw));
            }}>Edit</button></td>
          </tr>)}</tbody>
        </table>
        {journeys.length === 0 && <div className="empty-state">No process journeys yet. Add a process plan above.</div>}
      </div>}
      {error && <p className="form-message" role="alert">{error}</p>}
    </section>

    <section className="surface records-surface">
      <div className="section-heading"><div><span className="section-index">08</span><div><h2>Daily Machine Process Tracking</h2><p>Supervisor-submitted daily production records</p></div></div><button className="secondary-button" type="button" onClick={() => void loadTracking()}>Refresh</button></div>
      {trackingLoading ? <div className="empty-state">Loading daily records…</div> : <div className="table-wrap">
        <table><thead><tr><th>Tracking ID</th><th>Production ID</th><th>Order</th><th>Part</th><th>Process</th><th>Machine</th><th>Shift</th><th>Actual</th><th>Good</th><th>Rejected</th><th>Rework</th><th>Pending</th><th>Supervisor</th><th>Updated At</th></tr></thead>
          <tbody>{trackingRecords.map((r, i) => <tr key={String(r.Tracking_ID || i)}>
            <td>{r.Tracking_ID}</td><td>{r.Production_Record_ID}</td><td>{r.Order_ID}</td><td>{r.Part_Number}</td><td>{r.Process_Name}</td><td>{r.Machine_ID}</td><td>{r.Shift}</td><td>{r.Actual_Qty}</td><td>{r.Good_Qty}</td><td>{r.Rejected_Qty}</td><td>{r.Rework_Qty}</td><td>{r.Pending_Qty}</td><td>{r.Supervisor_Email}</td><td>{r.Updated_At}</td>
          </tr>)}</tbody></table>
        {trackingRecords.length === 0 && <div className="empty-state">No daily tracking records have been submitted yet.</div>}
      </div>}
    </section>
  </div>;
}


// Supervisor workspace: assigned process plans and daily production submission.
function SupervisorAssignedProcesses({ supervisorEmail }: { supervisorEmail: string }) {
  const [journeys, setJourneys] = useState<MachineProcessJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    journeyId: '', operatorId: '', shift: 'Day', actualQty: '',
    goodQty: '', rejectedQty: '', reworkQty: '0',
    downtimeMinutes: '0', machineStatus: 'Running',
  });
  const normalizedEmail = supervisorEmail.trim().toLowerCase();
  const selectedJourney = journeys.find(j => j.journeyId === form.journeyId) || null;

  const loadAssignedJourneys = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_URL}?action=machineProcessJourney`, { method: 'GET', redirect: 'follow' });
      const body = await response.text();
      const result = JSON.parse(body) as { success?: boolean; journeys?: Record<string, unknown>[]; error?: string; message?: string };
      if (!response.ok || result.success !== true || !Array.isArray(result.journeys)) {
        throw new Error(result.message || result.error || `Unable to load assigned processes (HTTP ${response.status}).`);
      }
      const all: MachineProcessJourney[] = result.journeys.map(row => ({
        journeyId: String(row.Machine_Process_Journey_ID ?? row.journeyId ?? ''),
        orderId: String(row.Order_ID ?? row.orderId ?? ''),
        partNumber: String(row.Part_Number ?? row.partNumber ?? ''),
        machineId: String(row.Machine_ID ?? row.machineId ?? ''),
        processName: String(row.Process_Name ?? row.processName ?? ''),
        sequence: Number(row.Process_Sequence ?? row.sequence ?? 1),
        plannedQty: Number(row.Planned_Qty ?? row.plannedQty ?? 0),
        completedQty: Number(row.Completed_Qty ?? row.completedQty ?? 0),
        pendingQty: Number(row.Pending_Qty ?? row.pendingQty ?? 0),
        status: String(row.Process_Status ?? row.status ?? 'Planned'),
        assignedSupervisorEmail: String(row.Assigned_Supervisor_Email ?? row.assignedSupervisorEmail ?? '').trim().toLowerCase(),
      })).filter(j => j.journeyId);
      const assigned = all.filter(j => j.assignedSupervisorEmail === normalizedEmail);
      setJourneys(assigned);
      setForm(current => ({
        ...current,
        journeyId: assigned.some(j => j.journeyId === current.journeyId) ? current.journeyId : (assigned[0]?.journeyId || ''),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load assigned processes.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadAssignedJourneys(); }, [normalizedEmail]);

  const saveDailyTracking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedJourney) { setError('Select an assigned process.'); return; }
    const actual = Number(form.actualQty);
    const good = Number(form.goodQty);
    const rejected = Number(form.rejectedQty);
    const rework = Number(form.reworkQty || 0);
    const downtime = Number(form.downtimeMinutes || 0);
    if (!Number.isFinite(actual) || actual <= 0) { setError('Actual quantity must be greater than zero.'); return; }
    if (![good, rejected, rework, downtime].every(v => Number.isFinite(v) && v >= 0)) { setError('Good, rejected, rework and downtime values must be non-negative numbers.'); return; }
    if (good + rejected !== actual) { setError('Good quantity + Rejected quantity must equal Actual quantity.'); return; }
    if (actual > selectedJourney.pendingQty) { setError(`Actual quantity cannot exceed remaining pending quantity (${selectedJourney.pendingQty}).`); return; }

    setSavingId(selectedJourney.journeyId); setError(''); setMessage('');
    try {
      const payload = {
        action: 'saveMachineProcessTracking',
        Machine_Process_Journey_ID: selectedJourney.journeyId,
        Supervisor_Email: normalizedEmail,
        Shift: form.shift,
        Operator_ID: form.operatorId.trim(),
        Actual_Qty: actual,
        Good_Qty: good,
        Rejected_Qty: rejected,
        Rework_Qty: rework,
        Downtime_Minutes: downtime,
        Machine_Status: form.machineStatus,
      };
      const response = await fetch(API_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      let result: Record<string, unknown>;
      try { result = JSON.parse(body) as Record<string, unknown>; }
      catch { throw new Error(`Daily tracking returned unreadable data: ${body.trim() || `HTTP ${response.status}`}`); }
      if (!response.ok || result.success !== true) throw new Error(String(result.message || result.error || 'Daily tracking could not be saved.'));
      setMessage(`Daily production saved. Tracking ID: ${String(result.trackingId || '')}. Pending quantity: ${String(result.pendingQty ?? '')}.`);
      setForm(current => ({ ...current, actualQty: '', goodQty: '', rejectedQty: '', reworkQty: '0', downtimeMinutes: '0' }));
      await loadAssignedJourneys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save daily production.');
    } finally { setSavingId(null); }
  };

  return (
    <section className="surface records-surface">
      <div className="section-heading">
        <div><span className="section-index">03</span><div><h2>My Assigned Processes</h2><p>Process plans assigned to {normalizedEmail || 'this Supervisor'}</p></div></div>
        <button className="secondary-button" type="button" onClick={() => void loadAssignedJourneys()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {message && <p className="form-message" role="status">{message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      {loading ? <div className="empty-state">Loading your assigned processes…</div> : journeys.length === 0 ? <div className="empty-state">No process plans have been assigned to your email yet.</div> : (
        <>
          <div className="table-wrap"><table><thead><tr><th>Journey ID</th><th>Order ID</th><th>Part</th><th>Machine</th><th>Process</th><th>Sequence</th><th>Planned</th><th>Completed</th><th>Pending</th><th>Status</th></tr></thead>
            <tbody>{journeys.map(j => <tr key={j.journeyId}><td>{j.journeyId}</td><td>{j.orderId}</td><td>{j.partNumber}</td><td>{j.machineId}</td><td>{j.processName}</td><td>{j.sequence}</td><td>{j.plannedQty}</td><td>{j.completedQty}</td><td>{j.pendingQty}</td><td>{j.status}</td></tr>)}</tbody>
          </table></div>
          <section className="surface manager-config-card" style={{ marginTop: 20 }}>
            <div className="section-heading"><div><span className="section-index">04</span><div><h2>Daily Production Entry</h2><p>Submit today's production against the assigned process. The backend updates cumulative completed and pending quantities.</p></div></div></div>
            <form className="entry-form" onSubmit={saveDailyTracking}>
              <div className="form-grid">
                <Field label="Assigned Process"><select value={form.journeyId} onChange={e => setForm({ ...form, journeyId: e.target.value })} required>
                  <option value="">Select assigned process</option>
                  {journeys.map(j => <option key={j.journeyId} value={j.journeyId}>{j.journeyId} · {j.orderId} · Seq {j.sequence} · {j.processName} (Pending: {j.pendingQty})</option>)}
                </select></Field>
                <Field label="Shift"><select value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })}><option>Day</option><option>Night</option><option>General</option><option>A</option><option>B</option><option>C</option></select></Field>
                <Field label="Operator ID"><input value={form.operatorId} onChange={e => setForm({ ...form, operatorId: e.target.value })} placeholder="Optional operator ID" /></Field>
                <Field label="Actual Quantity"><input type="number" min="1" step="1" value={form.actualQty} onChange={e => setForm({ ...form, actualQty: e.target.value })} required /></Field>
                <Field label="Good Quantity"><input type="number" min="0" step="1" value={form.goodQty} onChange={e => setForm({ ...form, goodQty: e.target.value })} required /></Field>
                <Field label="Rejected Quantity"><input type="number" min="0" step="1" value={form.rejectedQty} onChange={e => setForm({ ...form, rejectedQty: e.target.value })} required /></Field>
                <Field label="Rework Quantity"><input type="number" min="0" step="1" value={form.reworkQty} onChange={e => setForm({ ...form, reworkQty: e.target.value })} /></Field>
                <Field label="Downtime (Minutes)"><input type="number" min="0" step="1" value={form.downtimeMinutes} onChange={e => setForm({ ...form, downtimeMinutes: e.target.value })} /></Field>
                <Field label="Machine Status"><select value={form.machineStatus} onChange={e => setForm({ ...form, machineStatus: e.target.value })}><option>Running</option><option>Idle</option><option>Breakdown</option><option>Maintenance</option></select></Field>
              </div>
              {selectedJourney && <p className="form-message">Selected process: {selectedJourney.processName} · Remaining quantity: {selectedJourney.pendingQty}</p>}
              <div className="form-actions"><span>{error}</span><button className="primary-button save-button" type="submit" disabled={savingId !== null || !selectedJourney || selectedJourney.pendingQty <= 0}>{savingId ? 'Saving…' : 'Submit Daily Production'}</button></div>
            </form>
          </section>
        </>
      )}
    </section>
  );
}
