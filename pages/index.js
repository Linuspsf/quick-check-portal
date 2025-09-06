
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';

const KTS = 75; // fixed
const SEATS = 20;
const DEFAULT_COST_PER_NM = 8;
const DEFAULT_LOAD = 0.75;
const DEFAULT_DWELL_MIN = 12;
const DEFAULT_OPS_H = 12;
const RESERVE = 0.15;

const AREAS = ['Inside Passage (SE Alaska)','Puget Sound / Salish Sea'];

// distance matrices (nm) — demo
const DIST = {
  'Inside Passage (SE Alaska)': {
    ports: ['Juneau, AK','Haines, AK','Skagway, AK','Sitka, AK','Petersburg, AK','Wrangell, AK','Ketchikan, AK','Hoonah, AK'],
    nm: {
      'Juneau, AK': {'Haines, AK': 73, 'Skagway, AK': 94, 'Sitka, AK': 95, 'Petersburg, AK': 120, 'Wrangell, AK': 155, 'Ketchikan, AK': 235, 'Hoonah, AK': 33},
      'Haines, AK': {'Skagway, AK': 14, 'Petersburg, AK': 140},
      'Sitka, AK': {'Petersburg, AK': 109, 'Wrangell, AK': 144, 'Ketchikan, AK': 192},
      'Petersburg, AK': {'Wrangell, AK': 31, 'Ketchikan, AK': 116},
      'Wrangell, AK': {'Ketchikan, AK': 82},
    }
  },
  'Puget Sound / Salish Sea': {
    ports: ['Seattle, WA','Bremerton, WA','Tacoma, WA','Everett, WA','Port Townsend, WA','Bellingham, WA'],
    nm: {
      'Seattle, WA': {'Bremerton, WA': 14, 'Tacoma, WA': 25, 'Everett, WA': 28, 'Port Townsend, WA': 35, 'Bellingham, WA': 70},
      'Bremerton, WA': {'Tacoma, WA': 29, 'Everett, WA': 34, 'Port Townsend, WA': 24, 'Bellingham, WA': 77},
      'Tacoma, WA': {'Everett, WA': 43, 'Port Townsend, WA': 49, 'Bellingham, WA': 89},
      'Everett, WA': {'Port Townsend, WA': 28, 'Bellingham, WA': 46},
      'Port Townsend, WA': {'Bellingham, WA': 40},
    }
  }
};

// curated lines per area (multi-stop)
const LINES = {
  'Inside Passage (SE Alaska)': [
    { id: 'JNU-HNS-SGY', name: 'Juneau—Haines—Skagway', stops: ['Juneau, AK','Haines, AK','Skagway, AK'], color:'#ef4444' },
    { id: 'JNU-SIT', name: 'Juneau—Sitka', stops: ['Juneau, AK','Sitka, AK'], color:'#7c3aed' },
    { id: 'JNU-PSG-WRG-KTN', name: 'Juneau—Petersburg—Wrangell—Ketchikan', stops: ['Juneau, AK','Petersburg, AK','Wrangell, AK','Ketchikan, AK'], color:'#10b981' },
    { id: 'JNU-HNH', name: 'Juneau—Hoonah', stops: ['Juneau, AK','Hoonah, AK'], color:'#f59e0b' },
  ],
  'Puget Sound / Salish Sea': [
    { id: 'SEA-BRE', name: 'Seattle—Bremerton', stops: ['Seattle, WA','Bremerton, WA'], color:'#ef4444' },
    { id: 'SEA-EVE-PT', name: 'Seattle—Everett—Port Townsend', stops: ['Seattle, WA','Everett, WA','Port Townsend, WA'], color:'#7c3aed' },
    { id: 'SEA-TAC', name: 'Seattle—Tacoma', stops: ['Seattle, WA','Tacoma, WA'], color:'#10b981' },
  ]
};

// demo OD demand (annual pax) across both areas
const DEMO_OD = {
  // Inside Passage
  'Juneau, AK ⇄ Haines, AK': 82400,
  'Juneau, AK ⇄ Skagway, AK': 42000,
  'Haines, AK ⇄ Skagway, AK': 18000,
  'Juneau, AK ⇄ Sitka, AK': 70500,
  'Juneau, AK ⇄ Petersburg, AK': 61200,
  'Petersburg, AK ⇄ Wrangell, AK': 31000,
  'Wrangell, AK ⇄ Ketchikan, AK': 42000,
  'Juneau, AK ⇄ Wrangell, AK': 41800,
  'Juneau, AK ⇄ Ketchikan, AK': 35000,
  'Juneau, AK ⇄ Hoonah, AK': 30000,
  // Puget
  'Seattle, WA ⇄ Bremerton, WA': 120000,
  'Seattle, WA ⇄ Tacoma, WA': 95000,
  'Seattle, WA ⇄ Everett, WA': 88000,
  'Everett, WA ⇄ Port Townsend, WA': 50000,
  'Seattle, WA ⇄ Port Townsend, WA': 70000,
  'Bremerton, WA ⇄ Everett, WA': 48000
};

function key(a,b){ return a<b ? `${a} ⇄ ${b}` : `${b} ⇄ ${a}`; }
function nm(nmM, a,b){ return (nmM[a]&&nmM[a][b])||(nmM[b]&&nmM[b][a])||null; }
function segs(stops, nmM){ const s=[]; for(let i=0;i<stops.length-1;i++){ const d=nm(nmM,stops[i],stops[i+1]); if(d==null||d>500) return null; s.push({a:stops[i], b:stops[i+1], nm:d}); } return s; }
function path(stops, s, a,b){ const i=stops.indexOf(a), j=stops.indexOf(b); if(i<0||j<0) return null; const lo=Math.min(i,j), hi=Math.max(i,j); return s.slice(lo,hi); }

export default function Lite(){
  const [area, setArea] = useState('Inside Passage (SE Alaska)');
  const [home, setHome] = useState('Juneau, AK');
  const [fare, setFare] = useState(120);
  const [preset, setPreset] = useState('M'); // S=10%, M=25%, L=40%
  const [od, setOD] = useState(DEMO_OD); // overlay with /public/data/demand.json if present
  const [costNm] = useState(DEFAULT_COST_PER_NM);
  const [opsH, setOpsH] = useState(DEFAULT_OPS_H);
  const [dwellMin] = useState(DEFAULT_DWELL_MIN);
  const [load, setLoad] = useState(DEFAULT_LOAD);

  useEffect(()=>{ fetch('/data/demand.json').then(r=>r.ok?r.json():null).then(j=>{ if(j) setOD(j); }).catch(()=>{}); },[]);
  useEffect(()=>{
    const ports = DIST[area].ports;
    if(!ports.includes(home)) setHome(ports[0]);
  }, [area]);

  const capture = preset==='S'?0.10:preset==='L'?0.40:0.25;
  const nmM = DIST[area].nm;
  const allLines = LINES[area].filter(L => L.stops.includes(home)); // only lines that include home port
  const seats = Math.floor(SEATS*load);

  const summary = useMemo(()=>{
    let dailyPax = 0, dailyRev = 0, dailyCost = 0;
    let fleet = 0;
    const lineContrib = [];

    for(const line of allLines){
      const s = segs(line.stops, nmM);
      if(!s) continue;
      const segments = s.length;
      const oneWay = s.reduce((t,sg)=>t+sg.nm/KTS,0);
      const cycle = 2*oneWay + (2*line.stops.length)*(dwellMin/60); // hours for full out-and-back
      const cyclesPerVessel = Math.max(1, Math.floor(opsH / cycle)); // cycles per vessel per day
      const paxTrip = seats;

      // peak load on any segment
      const pairs=[];
      for(let i=0;i<line.stops.length-1;i++) pairs.push(key(line.stops[i], line.stops[i+1]));
      const hub = home;
      for(const x of line.stops) if(x!==hub) pairs.push(key(hub,x));

      const segLoad = s.map(x=>({...x, pax:0}));
      let captured = 0;
      for(const p of pairs){
        const annual = od[p]||0; if(!annual) continue;
        const cap = (annual*capture)/365;
        const [a,b]=p.split(' ⇄ ');
        const pathSegs = path(line.stops, s, a, b);
        if(!pathSegs) continue;
        for(const ps of pathSegs){
          const idx = segLoad.findIndex(u=>(u.a===ps.a&&u.b===ps.b)||(u.a===ps.b&&u.b===ps.a));
          if(idx>=0) segLoad[idx].pax += cap;
        }
        captured += cap;
      }
      const peak = segLoad.reduce((m,x)=>Math.max(m,x.pax),0);
      const tripsNeeded = Math.ceil(peak/Math.max(paxTrip,1)); // one-way trips per segment per day
      const cyclesNeeded = Math.ceil(tripsNeeded/2);           // cycles/day required to cover both directions
      const vesselsNeeded = Math.ceil(cyclesNeeded/Math.max(cyclesPerVessel,1));
      if(isFinite(vesselsNeeded)) fleet += vesselsNeeded;

      // economics per CYCLE (out-and-back across the line)
      const lineRoundNm = 2*s.reduce((t,sg)=>t+sg.nm,0);
      const revPerCycle = paxTrip * fare * (2*segments); // both directions on each segment
      const costPerCycle = lineRoundNm * costNm;

      dailyPax += captured;
      dailyRev += cyclesNeeded * revPerCycle;
      dailyCost += cyclesNeeded * costPerCycle;
      lineContrib.push({ name: line.name, color: line.color, rev: cyclesNeeded*revPerCycle, margin: Math.max(0, cyclesNeeded*(revPerCycle - costPerCycle)) });
    }

    const fleetWithReserve = Math.ceil(fleet*(1+RESERVE));
    const margin = Math.max(0, dailyRev - dailyCost);
    return { dailyPax, dailyRev, dailyCost, margin, fleetWithReserve, lineContrib };
  }, [allLines, nmM, fare, preset, od, opsH, dwellMin, load, costNm, home]);

  const fmt = (n)=>'$'+Math.round(n).toLocaleString();
  const fmtK = (n)=>Math.round(n).toLocaleString();

  function MoneyBars({rev, cost}){
    const max = Math.max(rev, cost, 1);
    const r = Math.max(4, Math.round(240*(rev/max)));
    const c = Math.max(4, Math.round(240*(cost/max)));
    const m = Math.max(4, Math.round(240*((rev-cost)/max)));
    return (
      <svg width="100%" height="110" viewBox="0 0 360 110">
        <rect x="10" y="15" width={r} height="18" rx="9" fill="#22c55e"/><text x="10" y="12" className="small">Daily revenue</text>
        <rect x="10" y="55" width={c} height="18" rx="9" fill="#ef4444"/><text x="10" y="52" className="small">Daily variable cost</text>
        <rect x="10" y="95" width={m} height="18" rx="9" fill="#0ea5e9"/><text x="10" y="92" className="small">Daily gross margin</text>
      </svg>
    );
  }

  function ByLineBars({data}){
    const max = Math.max(...data.map(d=>d.margin), 1);
    return (
      <svg width="100%" height={data.length*28+20}>
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

      <div className="card">
        <h1 className="h1">Quick Check — Profit Snapshot</h1>
        <p className="sub">Pick your area and home port. Choose a market size. We’ll estimate daily profits and the fleet needed to capture it.</p>

        <div className="row">
          <div>
            <label className="label">Service area</label>
            <select className="select" value={area} onChange={e=>setArea(e.target.value)}>
              {AREAS.map(a=>(<option key={a}>{a}</option>))}
            </select>
          </div>
          <div>
            <label className="label">Home port</label>
            <select className="select" value={home} onChange={e=>setHome(e.target.value)}>
              {DIST[area].ports.map(p=>(<option key={p}>{p}</option>))}
            </select>
            <div className="small" style={{marginTop:6}}>We consider only lines that include this port.</div>
          </div>
          <div>
            <label className="label">Average fare per segment (USD)</label>
            <input className="input" type="number" value={fare} onChange={e=>setFare(Number(e.target.value))}/>
          </div>
        </div>

        <div className="row">
          <div>
            <label className="label">Market size</label>
            <div style={{display:'flex',gap:8}}>
              <button className="btn" style={{background:preset==='S'?'#eab308':'#94a3b8'}} onClick={()=>setPreset('S')}>Small</button>
              <button className="btn" style={{background:preset==='M'?'#0ea5e9':'#94a3b8'}} onClick={()=>setPreset('M')}>Medium</button>
              <button className="btn" style={{background:preset==='L'?'#22c55e':'#94a3b8'}} onClick={()=>setPreset('L')}>Large</button>
            </div>
            <div className="small" style={{marginTop:6}}>Small≈10% • Medium≈25% • Large≈40% capture</div>
          </div>
          <div>
            <label className="label">Ops hrs/day (advanced)</label>
            <input className="input" type="number" value={opsH} onChange={e=>setOpsH(Number(e.target.value))}/>
          </div>
          <div>
            <label className="label">Load factor (advanced)</label>
            <input className="input" type="number" step="0.05" value={load} onChange={e=>setLoad(Number(e.target.value))}/>
          </div>
        </div>

        <div className="kpis">
          <div className="kpi"><div className="v">{fmt(summary.dailyRev*365)}</div><div className="t">Potential annual revenue</div></div>
          <div className="kpi"><div className="v">{fmt(summary.margin*365)}</div><div className="t">Potential annual gross margin</div></div>
          <div className="kpi"><div className="v">{fmtK(Math.round(summary.dailyPax))}</div><div className="t">Passengers served / day</div></div>
          <div className="kpi"><div className="v">{summary.fleetWithReserve}</div><div className="t">Recommended fleet (incl. reserve)</div></div>
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
          <div className="small" style={{marginTop:8}}>Assumes 75 kn, {DEFAULT_OPS_H} ops hrs/day, {DEFAULT_DWELL_MIN} min dwell, {Math.round(DEFAULT_LOAD*100)}% target load. Segments &gt; 500 nm excluded.</div>
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

      <footer>© Pacific Seaflight — Demonstration only</footer>
    </div>
  );
}
