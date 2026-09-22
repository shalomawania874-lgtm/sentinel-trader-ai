"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type Candle = { t:number;o:number;h:number;l:number;c:number;v:number };
type Result = { symbol:string;name:string;exchange?:string;type?:string };
type Analysis = { signal?:string;confidence?:number;price?:number;emaFast?:number;emaSlow?:number;rsi?:number;atr?:number;reasons?:string[] };

const QUICK = [["BTCUSDT","Bitcoin"],["ETHUSDT","Ethereum"],["SOLUSDT","Solana"],["EURUSD=X","EUR / USD"],["GBPUSD=X","GBP / USD"],["USDJPY=X","USD / JPY"],["GC=F","Gold"],["CL=F","Crude Oil"],["AAPL","Apple"],["NVDA","NVIDIA"],["TSLA","Tesla"],["^GSPC","S&P 500"],["^NDX","Nasdaq 100"],["^FTSE","FTSE 100"]];

export default function Home(){
 const [symbol,setSymbol]=useState("BTCUSDT"),[query,setQuery]=useState("BTCUSDT"),[tf,setTf]=useState("1h");
 const [data,setData]=useState<Candle[]>([]),[analysis,setAnalysis]=useState<Analysis|null>(null),[news,setNews]=useState<any[]>([]);
 const [results,setResults]=useState<Result[]>([]),[searching,setSearching]=useState(false),[loading,setLoading]=useState(false),[err,setErr]=useState("");
 const [image,setImage]=useState(""),[imageName,setImageName]=useState(""),[tab,setTab]=useState("Home"),[source,setSource]=useState("");
 const cameraRef=useRef<HTMLInputElement>(null),fileRef=useRef<HTMLInputElement>(null);

 async function searchMarkets(q:string){
  setQuery(q); if(q.trim().length<2){setResults([]);return} setSearching(true);
  try{const r=await fetch("/api/search?q="+encodeURIComponent(q.trim()),{cache:"no-store"});const j=await r.json();setResults(j.results||[])}catch{setResults([])}finally{setSearching(false)}
 }
 function choose(r:Result){setSymbol(r.symbol);setQuery(r.symbol);setResults([]);setTab("Chart")}
 async function loadMarket(){
  setLoading(true);setErr("");setAnalysis(null);
  try{
   const m=await fetch("/api/market?symbol="+encodeURIComponent(symbol)+"&interval="+tf+"&limit=180",{cache:"no-store"}).then(r=>r.json());
   if(!m.candles?.length)throw new Error(m.reason||"DATA UNAVAILABLE");
   setData(m.candles);setSource(m.provider||"Live provider");
   const n=await fetch("/api/news?q="+encodeURIComponent(symbol),{cache:"no-store"}).then(r=>r.json()).catch(()=>({items:[]}));
   setNews(n.items||[]);
   const a=await fetch("/api/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({candles:m.candles,news:n.items||[]})}).then(r=>r.json());
   setAnalysis(a);
  }catch(e:any){setData([]);setErr(e?.message||"DATA UNAVAILABLE / NO TRADE")}finally{setLoading(false)}
 }
 useEffect(()=>{loadMarket()},[symbol,tf]);
 function onImage(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0]; if(!f||!f.type.startsWith("image/"))return;
  if(image)URL.revokeObjectURL(image);setImage(URL.createObjectURL(f));setImageName(f.name);setTab("Scanner");setErr("");e.target.value="";
 }
 const price=analysis?.price??data.at(-1)?.c,signal=analysis?.signal||"WAIT";
 const signalClass=signal.includes("BUY")?"buy":signal.includes("SELL")?"sell":"wait",confidence=Math.round(analysis?.confidence||0);
 const lo=data.length?Math.min(...data.map(x=>x.l)):0,hi=data.length?Math.max(...data.map(x=>x.h)):1;
 const points=data.map((x,i)=>(i*900)/Math.max(1,data.length-1)+","+(310-((x.c-lo)/Math.max(1,hi-lo))*270)).join(" ");

 return <div className="app">
  <header className="topbar"><div className="brand"><span className="brandMark">✦</span><span>SENTINEL</span><b>AI</b></div><div className="livePill"><i/> LIVE GLOBAL MARKETS</div><button className="headerScan" onClick={()=>fileRef.current?.click()}>＋ Upload chart</button><div className="avatar">S</div></header>
  <main className="shell">
   <section className="hero"><div className="eyebrow">MARKET INTELLIGENCE / REAL DATA</div><h1>Find it. Scan it.<br/><em>Know the market.</em></h1><p>Search by ticker, company, pair, index or commodity. Connect to the exact symbol exposed by live providers.</p>
    <div className="searchBox"><span>⌕</span><input value={query} onChange={e=>searchMarkets(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&query.trim())choose({symbol:query.trim().toUpperCase(),name:query.trim()})}} placeholder="Search BTC, EUR/USD, Apple, Gold, Nasdaq..."/>{searching&&<small>SEARCHING</small>}
     {results.length>0&&<div className="searchResults">{results.map((r,i)=><button key={r.symbol+"-"+i} onClick={()=>choose(r)}><strong>{r.symbol}</strong><span>{r.name}</span><small>{r.exchange||"GLOBAL"} · {r.type||"MARKET"}</small></button>)}</div>}
    </div>
    <div className="quick">{QUICK.map(([s,n])=><button key={s} className={symbol===s?"selected":""} onClick={()=>choose({symbol:s,name:n})}>{s}</button>)}</div>
   </section>

   <section className="marketBar"><div><small>CONNECTED MARKET</small><h2>{symbol}</h2><span>{source||"Waiting for live provider"} <i className="dot"/></span></div><div className="price">{price!=null?Number(price).toLocaleString(undefined,{maximumFractionDigits:8}):"—"} <small>LIVE</small></div>
    <div className="timeframes">{["1m","5m","15m","1h","4h","1d"].map(x=><button key={x} className={tf===x?"on":""} onClick={()=>setTf(x)}>{x}</button>)}</div><button className="analyze" onClick={loadMarket} disabled={loading}>{loading?"ANALYZING…":"ANALYZE ↗"}</button>
   </section>

   <section className="grid"><aside className="panel discovery"><div className="panelTitle">DISCOVER <b>LIVE</b></div><div className="coverage"><strong>GLOBAL</strong><span>Provider coverage</span><i>●</i></div>
    {QUICK.slice(0,8).map(([s,n])=><button key={s} className={s===symbol?"marketRow active":"marketRow"} onClick={()=>choose({symbol:s,name:n})}><b>{s}</b><span>{n}</span></button>)}
    <p className="tiny">Coverage follows instruments exposed by the connected free providers. No fake symbols or prices are invented.</p>
   </aside>
   <div className="center"><div className="chartCard"><div className="chartHead"><div><small>PRICE ACTION</small><b>{symbol} · {tf}</b></div><span>REAL-TIME FEED</span></div>
    <div className="chart">{data.length?<svg viewBox="0 0 900 340" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="4" points={points}/></svg>:<div className="empty">{loading?"Connecting to live market…":"Search a market to load its live chart."}</div>}</div>
    <div className="chartFoot"><span>● VERIFIED LIVE DATA</span><span>{data.length} candles</span><span>{source||"—"}</span></div></div>
    <div className="metrics"><div><small>EMA 12 / 26</small><b>{analysis?.emaFast?.toFixed(2)||"—"} / {analysis?.emaSlow?.toFixed(2)||"—"}</b></div><div><small>RSI 14</small><b>{analysis?.rsi?.toFixed(1)||"—"}</b></div><div><small>ATR 14</small><b>{analysis?.atr?.toFixed(4)||"—"}</b></div></div>
   </div>
   <aside className="panel decisionPanel"><div className="decision"><small>SENTINEL DECISION</small><div className={"signal "+signalClass}>{loading?"ANALYZING…":signal}</div><div className="confidence"><b>{confidence}%</b><span>confidence</span></div><div className="meter"><i style={{width:confidence+"%"}}/></div>
    <div className="reasons"><small>WHY</small>{analysis?.reasons?.slice(0,5).map((r,i)=><p key={i}>✦ {r}</p>)||<p className="muted">Analyze the selected market for current evidence.</p>}</div>
    <div className="guard"><b>NO GUARANTEE</b><span>Signals are analysis, not certainty or automatic trade execution.</span></div>
   </aside></section>

   <section className="lower"><div className="panel scanner"><div><small>CHART SCANNER</small><h2>Upload a chart — from your phone.</h2><p>Take a photo or choose an image from your gallery. The selected image stays in this browser until you choose another.</p></div>
    <div className="scannerActions"><button className="primary" onClick={()=>cameraRef.current?.click()}>◉ TAKE PHOTO</button><button className="secondary" onClick={()=>fileRef.current?.click()}>▣ CHOOSE IMAGE</button></div>
    {image?<div className="preview"><img src={image} alt="Uploaded trading chart"/><div><b>{imageName}</b><span>Chart image loaded ✓</span><button onClick={()=>{URL.revokeObjectURL(image);setImage("");setImageName("")}}>Remove</button></div></div>:<div className="dropHint">DROP / TAP / CAMERA <span>PNG · JPG · WEBP · HEIC</span></div>}
   </div>
   <div className="panel news"><small>MARKET INTELLIGENCE</small><h2>Latest headlines</h2>{news.slice(0,5).map((n,i)=><a key={i} href={n.link} target="_blank" rel="noreferrer">{n.title}</a>)}{!news.length&&<p className="muted">Headlines appear after a market is loaded.</p>}</div></section>
   {err&&<div className="error">DATA UNAVAILABLE / NO TRADE <span>{err}</span></div>}
  </main>
  <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={onImage}/>
  <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={onImage}/>
  <nav className="bottomNav">{["Home","Markets","Chart","Scanner","Signals","AI"].map(x=><button key={x} className={tab===x?"active":""} onClick={()=>{setTab(x);if(x==="Scanner")fileRef.current?.click()}}><span>{x==="Scanner"?"◫":x==="Chart"?"⌁":x==="Signals"?"◈":x==="AI"?"✦":"●"}</span>{x}</button>)}</nav>
  <footer>REAL DATA ONLY · PROVIDER VERIFIED · NO GUARANTEED PROFITS · NO AUTOMATIC EXECUTION</footer>
 </div>
}
