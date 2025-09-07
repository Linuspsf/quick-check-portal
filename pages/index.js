
import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';

const KTS = 75;
const SEATS = 20;
const RESERVE = 0.15;

const DEFAULT_CAL = {
  capture: { Small: 0.25, Medium: 0.60, Large: 1.00 },
  cost_per_nm: 8,
  freight_mail_uplift: 0.35,
  market_baseline_fare: 120,
  ops_hours: 12,
  dwell_min: 20 // 20-min default dwell
};

// Built-in demo area as fallback
const BUILTIN = {
  'Inside Passage (SE Alaska)': {
    ports: ['Juneau, AK','Haines, AK','Skagway, AK','Sitka, AK','Petersburg, AK','Wrangell, AK','Ketchikan, AK','Hoonah, AK'],
    lines: [
      { id: 'JNU-HNS-SGY', name: 'Juneau—Haines—Skagway', stops: ['Juneau, AK','Haines, AK','Skagway, AK'], color:'#ef4444' },
      { id: 'JNU-SIT', name: 'Juneau—Sitka', stops: ['Juneau, AK','Sitka, AK'], color:'#7c3aed' },
      { id: 'JNU-PSG-WRG-KTN', name: 'Juneau—Petersburg—Wrangell—Ketchikan', stops: ['Juneau, AK','Petersburg, AK','Wrangell, AK','Ketchikan, AK'], color:'#10b981' },
      { id: 'JNU-HNH', name: 'Juneau—Hoonah', stops: ['Juneau, AK','Hoonah, AK'], color:'#f59e0b' },
    ],
    nm: {
      'Juneau, AK': {'Haines, AK': 73, 'Skagway, AK': 94, 'Sitka, AK': 95, 'Petersburg, AK': 120, 'Wrangell, AK': 155, 'Ketchikan, AK': 235, 'Hoonah, AK': 33},
      'Haines, AK': {'Skagway, AK': 14, 'Petersburg, AK': 140},
      'Sitka, AK': {'Petersburg, AK': 109, 'Wrangell, AK': 144, 'Ketchikan, AK': 192},
      'Petersburg, AK': {'Wrangell, AK': 31, 'Ketchikan, AK': 116},
      'Wrangell, AK': {'Ketchikan, AK': 82},
    },
    demand: {
      'Juneau, AK ⇄ Haines, AK': 82400,
      'Juneau, AK ⇄ Skagway, AK': 42000,
      'Haines, AK ⇄ Skagway, AK': 18000,
      'Juneau, AK ⇄ Sitka, AK': 70500,
      'Juneau, AK ⇄ Petersburg, AK': 61200,
      'Petersburg, AK ⇄ Wrangell, AK': 31000,
      'Wrangell, AK ⇄ Ketchikan, AK': 42000,
      'Juneau, AK ⇄ Wrangell, AK': 41800,
      'Juneau, AK ⇄ Ketchikan, AK': 35000,
      'Juneau, AK ⇄ Hoonah, AK': 30000
    }
  }
};

function key(a,b){ return a<b ? `${a} ⇄ ${b}` : `${b} ⇄ ${a}`; }
function nm(nmM, a,b){ return (nmM[a]&&nmM[a][b])||(nmM[b]&&nmM[b][a])||null; }
function segs(stops, nmM){ const s=[]; for(let i=0;i<stops.length-1;i++){ const d=nm(nmM,stops[i],stops[i+1]); if(d==null||d>500) return null; s.push({a:stops[i], b:stops[i+1], nm:d}); } return s; }
function path(stops, s, a,b){ const i=stops.indexOf(a), j=stops.indexOf(b); if(i<0||j<0) return null; const lo=Math.min(i,j), hi=Math.max(i,j); return s.slice(lo,hi); }

export default function Lite(){
  const [regions, setRegions] = useState([{slug:'builtin', name:'Inside Passage (SE Alaska)'}]);
  const [area, setArea] = useState('Inside Passage (SE Alaska)');
  const [home, setHome] = useState('Juneau, AK');
  const [fare, setFare] = useState(120);
  const [size, setSize] = useState('Large');
  const [load, setLoad] = useState(0.75);
  const [opsH, setOpsH] = useState(DEFAULT_CAL.ops_hours);
  const [dwellMin, setDwellMin] = useState(DEFAULT_CAL.dwell_min);
  const [cal, setCal] = useState({ defaults: DEFAULT_CAL, byArea: {} });
  const [dataset, setDataset] = useState(BUILTIN['Inside Passage (SE Alaska)']); // ports, lines, nm, demand
  const [mode, setMode] = useState('area');
  const snapshotRef = useRef(null);

  useEffect(()=>{
    fetch('/data/calibration.json').then(r=>r.ok?r.json():null).then(j=>{
      if(j){
        const defaults = { ...DEFAULT_CAL, ...(j.default||{}) };
        const byArea = j; delete byArea.default;
        setCal({ defaults, byArea });
        setOpsH(defaults.ops_hours||DEFAULT_CAL.ops_hours);
        setDwellMin(defaults.dwell_min||DEFAULT_CAL.dwell_min);
      }
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    fetch('/regions/manifest.json').then(r=>r.ok?r.json():null).then(j=>{
      if(j && Array.isArray(j.regions) && j.regions.length){
        setRegions([{slug:'builtin', name:'Inside Passage (SE Alaska)'}, ...j.regions]);
      }
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    const reg = regions.find(r=>r.name===area);
    if(!reg || reg.slug==='builtin'){
      setDataset(BUILTIN['Inside Passage (SE Alaska)']);
      setHome('Juneau, AK');
      return;
    }
    const base = `/regions/${reg.slug}`;
    Promise.all([
      fetch(`${base}/ports.json`).then(r=>r.json()),
      fetch(`${base}/lines.json`).then(r=>r.json()),
      fetch(`${base}/distances.json`).then(r=>r.json()),
      fetch(`${base}/demand.json`).then(r=>r.json()).catch(()=>({})),
      fetch(`${base}/calibration.json`).then(r=>r.ok?r.json():{}).catch(()=>({}))
    ]).then(([ports, lines, distances, demand, calOverride])=>{
      const portsArr = ports.map(p=>p.port||p);
      const ds = { ports: portsArr, lines, nm: distances, demand: demand||{} };
      setDataset(ds);
      if(calOverride && (calOverride.dwell_min || calOverride.cost_per_nm || calOverride.capture)){
        setCal(prev=>({ ...prev, byArea: {...prev.byArea, [area]: calOverride }}));
        if(calOverride.dwell_min) setDwellMin(calOverride.dwell_min);
      }
      setHome(portsArr[0]||'');
    }).catch(()=>{});
  }, [area, regions]);

  useEffect(()=>{
    if(!dataset.ports?.includes(home)){
      setHome(dataset.ports?.[0]||'');
    }
  }, [dataset, home]);

  const areaCal = useMemo(()=>{
    const o = cal.byArea[area] || {};
    return {
      capture: { ...cal.defaults.capture, ...(o.capture||{}) },
      cost_per_nm: o.cost_per_nm ?? cal.defaults.cost_per_nm,
      freight_mail_uplift: o.freight_mail_uplift ?? cal.defaults.freight_mail_uplift,
      market_baseline_fare: o.market_baseline_fare ?? cal.defaults.market_baseline_fare,
      ops_hours: o.ops_hours ?? cal.defaults.ops_hours,
      dwell_min: o.dwell_min ?? cal.defaults.dwell_min
    };
  }, [cal, area]);

  const activeLines = useMemo(()=>{
    if(mode==='area') return dataset.lines||[];
    return (dataset.lines||[]).filter(L=>L.stops.includes(home));
  }, [mode, dataset, home]);

  const totalMarketUSD = useMemo(()=>{
    const ports = mode==='area' ? (dataset.ports||[]) : [home, ...(dataset.ports||[]).filter(p=>p!==home)];
    const seen = new Set();
    let dollars = 0;
    for(const aP of ports){
      for(const bP of ports){
        if(aP===bP) continue;
        const k = key(aP,bP);
        if(seen.has(k)) continue;
        seen.add(k);
        const pax = (dataset.demand||{})[k]||0;
        if(!pax) continue;
        let segmentsCount = 1;
        for(const L of dataset.lines||[]){
          const s = segs(L.stops, dataset.nm||{});
          if(!s) continue;
          const pth = path(L.stops, s, aP, bP);
          if(pth){ segmentsCount = pth.length; break; }
        }
        const paxRevenue = pax * segmentsCount * (areaCal.market_baseline_fare||120);
        dollars += paxRevenue * (1 + (areaCal.freight_mail_uplift||0));
      }
    }
    return dollars;
  }, [mode, area, home, dataset, areaCal]);

  const capture = areaCal.capture[size] ?? 1.0;
  const seats = Math.floor(SEATS*load);

  const summary = useMemo(()=>{
    const nmM = dataset.nm||{};
    let dailyPax = 0, dailyRev = 0, dailyCost = 0, fleet = 0;
    const lineContrib = [];
    for(const line of activeLines){
      const s = segs(line.stops, nmM); if(!s) continue;
      const segments = s.length;
      const oneWay = s.reduce((t,sg)=>t+sg.nm/KTS,0);
      const cycle = 2*oneWay + (2*line.stops.length)*(areaCal.dwell_min/60);
      const cyclesPerVessel = Math.max(1, Math.floor(areaCal.ops_hours / cycle));
      const paxTrip = seats;

      const pairs=[]; for(let i=0;i<line.stops.length-1;i++) pairs.push(key(line.stops[i], line.stops[i+1]));
      const segLoad = s.map(x=>({...x, pax:0})); let captured=0;
      for(const p of pairs){
        const annual = (dataset.demand||{})[p]||0; if(!annual) continue;
        const cap = (annual*capture)/365;
        const [a,b]=p.split(' ⇄ '); const pth = path(line.stops, s, a,b); if(!pth) continue;
        for(const ps of pth){
          const idx = segLoad.findIndex(u=>(u.a===ps.a&&u.b===ps.b)||(u.a===ps.b&&u.b===ps.a));
          if(idx>=0) segLoad[idx].pax += cap;
        }
        captured += cap;
      }
      const peak = segLoad.reduce((m,x)=>Math.max(m,x.pax),0);
      const tripsNeeded = Math.ceil(peak/Math.max(paxTrip,1));
      const cyclesNeeded = Math.ceil(tripsNeeded/2);
      const vesselsNeeded = Math.ceil(cyclesNeeded/Math.max(cyclesPerVessel,1));
      if(isFinite(vesselsNeeded)) fleet += vesselsNeeded;

      const lineRoundNm = 2*s.reduce((t,sg)=>t+sg.nm,0);
      const revPerCycle = paxTrip * (fare) * (2*segments);
      const costPerCycle = lineRoundNm * (areaCal.cost_per_nm||8);
      const lineRev = cyclesNeeded * revPerCycle;
      const lineCost = cyclesNeeded * costPerCycle;
      const margin = lineRev - lineCost;

      dailyPax += captured; dailyRev += lineRev; dailyCost += lineCost;
      if(margin > 1) lineContrib.push({ name: line.name, color: line.color, margin });
    }
    return {
      dailyPax, dailyRev, dailyCost,
      margin: Math.max(0, dailyRev-dailyCost),
      fleetWithReserve: Math.ceil(Math.ceil(fleet)*(1+RESERVE)),
      lineContrib
    };
  }, [activeLines, dataset, fare, load, areaCal]);

  const fmtMoney = (n)=>'$'+Math.round(n).toLocaleString();
  const fmtInt = (n)=>Math.round(n).toLocaleString();

  async function downloadPdf(){
    if (!snapshotRef.current) return;
    const { jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;
    const el = snapshotRef.current;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 40;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    pdf.addImage(imgData, 'PNG', 20, 20, imgWidth, Math.min(imgHeight, pageHeight-40), '', 'FAST');
    pdf.save('Pacific-Seaflight-Quick-Check.pdf');
  }

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name:'', email:'', company:'', phone:'', startFleet:'' });
  async function submitLead(){
    const payload = {
      ...form,
      area, home, size, fare, load,
      opsH: areaCal.ops_hours, dwellMin: areaCal.dwell_min,
      kpis: {
        totalMarket: totalMarketUSD,
        annualRevenue: summary.dailyRev*365,
        annualMargin: summary.margin*365,
        paxPerDay: summary.dailyPax,
        fleet: summary.fleetWithReserve
      }
    };
    await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
  }

  function MoneyBars({rev, cost}){
    const max = Math.max(rev, cost, 1);
    const r = Math.max(4, Math.round(260*(rev/max)));
    const c = Math.max(4, Math.round(260*(cost/max)));
    const m = Math.max(4, Math.round(260*((rev-cost)/max)));
    return (
      <svg width="100%" height="120" viewBox="0 0 320 120">
        <rect x="10" y="20" width={r} height="18" rx="9" fill="#22c55e"/><text x="10" y="16" className="small">Daily revenue</text>
        <rect x="10" y="60" width={c} height="18" rx="9" fill="#ef4444"/><text x="10" y="56" className="small">Daily variable cost</text>
        <rect x="10" y="100" width={m} height="18" rx="9" fill="#0ea5e9"/><text x="10" y="96" className="small">Daily gross margin</text>
      </svg>
    );
  }
  function ByLineBars({data}){
    const max = Math.max(...data.map(d=>d.margin), 1);
    const h = Math.max(60, data.length*28+20);
    return (
      <svg width="100%" height={h}>
        {data.map((d, i)=>{
          const w = Math.max(4, Math.round(260*(d.margin/max)));
          const y = i*28 + 12;
          return (
            <g key={d.name}>
              <rect x="10" y={y} width={w} height="18" rx="9" fill={d.color}/>
              <text x="10" y={y-4} className="small">{d.name}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <div className="container">
      <Head><title>Pacific Seaflight — Quick Check (Lite)</title></Head>

      <div className="stickyCta">
        <div style={{fontWeight:800}}>Looks promising?</div>
        <button className="btn" onClick={downloadPdf}>Download snapshot PDF</button>
        <button className="btn secondary" onClick={()=>{setOpen(true); setStep(1);}}>Request full pro forma</button>
      </div>

      <div ref={snapshotRef}>
        <div className="card">
          <h1 className="h1">Quick Check — Profit Snapshot</h1>
          <p className="sub">Start with <b>service area</b> or a <b>home port</b>. Then choose a <b>market size</b> — we model capturing that percentage of the service area’s total market. The <b>Total market</b> is constant for the selected Area/Home.</p>

          <div className="row">
            <div>
              <label className="label">Start with</label>
              <div className="toggle">
                <button className="btn" style={{background: 'var(--brand)'}} onClick={()=>setMode('area')}>Service area</button>
                <button className="btn" style={{background: '#94a3b8'}} onClick={()=>setMode('home')}>Home port</button>
              </div>
            </div>
            <div className={mode==='home'?'disabled':''}>
              <label className="label">Service area</label>
              <select className="select" value={area} onChange={e=>setArea(e.target.value)} disabled={mode==='home'}>
                {regions.map(r=>(<option key={r.slug==='builtin'?r.name:r.slug}>{r.name}</option>))}
              </select>
            </div>
            <div className={mode==='area'?'disabled':''}>
              <label className="label">Home port</label>
              <select className="select" value={home} onChange={e=>setHome(e.target.value)} disabled={mode==='area'}>
                {(dataset.ports||[]).map(p=>(<option key={p}>{p}</option>))}
              </select>
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Market size (capture % of service area)</label>
              <div style={{display:'flex',gap:8}}>
                <button className="btn" style={{background:size==='Small'?'#eab308':'#94a3b8'}} onClick={()=>setSize('Small')}>Small ({Math.round((areaCal.capture.Small||0.25)*100)}%)</button>
                <button className="btn" style={{background:size==='Medium'?'#0ea5e9':'#94a3b8'}} onClick={()=>setSize('Medium')}>Medium ({Math.round((areaCal.capture.Medium||0.60)*100)}%)</button>
                <button className="btn" style={{background:size==='Large'?'#22c55e':'#94a3b8'}} onClick={()=>setSize('Large')}>Large ({Math.round((areaCal.capture.Large||1.00)*100)}%)</button>
              </div>
            </div>
            <div>
              <label className="label">Average fare per segment (USD)</label>
              <input className="input" type="number" value={fare} onChange={e=>setFare(Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Load factor (advanced)</label>
              <input className="input" type="number" step="0.05" value={load} onChange={e=>setLoad(Number(e.target.value))}/>
            </div>
          </div>

          <div className="row">
            <div>
              <label className="label">Ops hrs/day (advanced)</label>
              <input className="input" type="number" value={opsH} onChange={e=>setOpsH(Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Port dwell per call (min)</label>
              <input className="input" type="number" value={dwellMin} onChange={e=>setDwellMin(Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Assumptions</label>
              <div className="small">Large = 100% of service area market • Total Market uses baseline price & uplift for freight/mail • Cruise 75 kn.</div>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi"><div className="v">{fmtMoney(totalMarketUSD)}</div><div className="t">Total market (annual $)</div></div>
            <div className="kpi"><div className="v">{fmtMoney(summary.dailyRev*365)}</div><div className="t">Potential annual revenue</div></div>
            <div className="kpi"><div className="v">{fmtMoney(summary.margin*365)}</div><div className="t">Potential annual gross margin</div></div>
            <div className="kpi"><div className="v">{fmtInt(summary.dailyPax)}</div><div className="t">Passengers served / day</div></div>
            <div className="kpi"><div className="v">{'≈ ' + fmtInt(summary.fleetWithReserve)}</div><div className="t">Recommended fleet (incl. reserve)</div></div>
          </div>
        </div>

        <div className="card">
          <div className="sectionTitle">Profit picture</div>
          <div className="chartCard">
            <MoneyBars rev={summary.dailyRev} cost={summary.dailyCost}/>
            <div className="legend">
              <span className="badge"><span className="dot" style={{background:'#22c55e'}}/>Revenue</span>
              <span className="badge"><span className="dot" style={{background:'#ef4444'}}/>Variable cost</span>
              <span className="badge"><span className="dot" style={{background:'#0ea5e9'}}/>Gross margin</span>
            </div>
            <div className="small" style={{marginTop:8}}>Segments &gt; 500 nm excluded. Region kits shown if available.</div>
          </div>
        </div>

        <div className="card">
          <div className="sectionTitle">Where the money comes from</div>
          <div className="chartCard">
            <ByLineBars data={summary.lineContrib}/>
            <div className="legend" style={{marginTop:8}}>
              {summary.lineContrib.map(d=>(<span key={d.name} className="badge"><span className="dot" style={{background:d.color}}/>{d.name}</span>))}
            </div>
          </div>
        </div>
      </div>

      <footer>© Pacific Seaflight — Demonstration only</footer>

      {open && (
        <div className="modalBack">
          <div className="modal">
            {step===1 && (<>
              <h3>1/3 — Contact</h3>
              <div className="grid">
                <input className="input" placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
                <input className="input" placeholder="Email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})}/>
                <input className="input" placeholder="Company" value={form.company} onChange={e=>setForm({...form, company:e.target.value})}/>
                <input className="input" placeholder="Phone (optional)" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}/>
              </div>
              <div className="actions">
                <button className="btn secondary" onClick={()=>setOpen(false)}>Cancel</button>
                <button className="btn" onClick={()=>setStep(2)}>Next</button>
              </div>
            </>)}
            {step===2 && (<>
              <h3>2/3 — Market choices</h3>
              <div className="grid">
                <input className="input" readOnly value={`Area/Home: ${area}${mode==='home'?(' / '+home):''}`}/>
                <input className="input" readOnly value={`Market size: ${size}`}/>
                <input className="input" readOnly value={`Ops hrs/day: ${areaCal.ops_hours}`}/>
                <input className="input" readOnly value={`Port dwell (min): ${areaCal.dwell_min}`}/>
                <input className="input" readOnly value={`Load factor: ${load}`}/>
                <input className="input" readOnly value={`Avg fare: $${fare}`}/>
                <input className="input" placeholder="Preferred starting fleet (optional)" value={form.startFleet} onChange={e=>setForm({...form, startFleet:e.target.value})}/>
              </div>
              <div className="actions">
                <button className="btn secondary" onClick={()=>setStep(1)}>Back</button>
                <button className="btn" onClick={()=>setStep(3)}>Next</button>
              </div>
            </>)}
            {step===3 && (<>
              <h3>3/3 — Deliverable</h3>
              <p className="small">We’ll email your 1‑page Profit Snapshot and follow up to prepare a full pro forma for this market.</p>
              <div className="actions">
                <button className="btn ghost" onClick={async()=>{ await downloadPdf(); }}>Download PDF now</button>
                <button className="btn" onClick={async()=>{ await submitLead(); setOpen(false); }}>Send & Start full pro forma</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
