"use client";
import {useEffect,useMemo,useRef,useState} from "react";

type Candle={t:number;o:number;h:number;l:number;c:number;v:number};
type Result={symbol:string;name?:string;exchange?:string;type?:string};

const quick:Result[]=[{symbol:"BTCUSDT",name:"Bitcoin / USDT",exchange:"BINANCE",type:"CRYPTO"},{symbol:"ETHUSDT",name:"Ethereum / USDT",exchange:"BINANCE",type:"CRYPTO"},{symbol:"EURUSD=X",name:"EUR / USD",exchange:"GLOBAL",type:"FOREX"},{symbol:"GBPUSD=X",name:"GBP / USD",exchange:"GLOBAL",type:"FOREX"},{symbol:"GC=F",name:"Gold",exchange:"GLOBAL",type:"COMMODITY"},{symbol:"CL=F",name:"Crude Oil",exchange:"GLOBAL",type:"COMMODITY"},{symbol:"^GSPC",name:"S&P 500",exchange:"US",type:"INDEX"},{symbol:"^NDX",name:"Nasdaq 100",exchange:"US",type:"INDEX"}];

function fmt(n:number|undefined){return n==null||!Number.isFinite(n)?"—":n.toLocaleString(undefined,{maximumFractionDigits:8})}
function Chart({data}:{data:Candle[]}){const pts=useMemo(()=>{if(!data.length)return"";const lo=Math.min(...data.map(x=>x.l)),hi=Math.max(...data.map(x=>x.h));const span=Math.max(hi-lo,1e-9);return data.map((x,i)=>`${(i/(data.length-1))*900},${330-((x.c-lo)/span)*300}`).join(" ")},[data]);return <svg viewBox="0 0 900 340" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="3" points={pts}/></svg>}

export default function Home(){
 const [symbol,setSymbol]=useState("BTCUSDT"),[query,setQuery]=useState("BTCUSDT"),[interval,setInterval]=useState("1h"),[data,setData]=useState<Candle[]>([]),[analysis,setAnalysis]=useState<any>(null),[news,setNews]=useState<any[]>([]),[provider,setProvider]=useState(""),[results,setResults]=useState<Result[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[image,setImage]=useState(""),fileRef=useRef<HTMLInputElement>(null);
 async function search(q=query){setQuery(q);if(q.trim().length<2){setResults([]);return}try{const r=await fetch("/api/search?q="+encodeURIComponent(q),{cache:"no-store"});setResults((await r.json()).results||[])}catch{setResults([])}}
 async function load(s=symbol){setLoading(true);setError("");setAnalysis(null);try{const r=await fetch("/api/market?symbol="+encodeURIComponent(s)+"&interval="+interval+"&limit=180",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.reason||"DATA UNAVAILABLE");setData(j.candles);setProvider(j.provider);setSymbol(j.symbol);const a=await fetch("/api/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({candles:j.candles})});const aj=await a.json();if(!a.ok)throw new Error(aj.error||"Analysis failed");setAnalysis(aj);const n=await fetch("/api/news?q="+encodeURIComponent(j.symbol),{cache:"no-store"});setNews((await n.json()).items||[])}catch(e:any){setData([]);setError("DATA UNAVAILABLE / NO TRADE — "+(e.message||"verified provider unavailable"))}finally{setLoading(false)}}
 useEffect(()=>{load("BTCUSDT")},[]);
 const decision=analysis?.signal||"WAIT";
 function choose(r:Result){setSymbol(r.symbol);setQuery(r.symbol);setResults([]);load(r.symbol)}
 function onFile(e:any){const f=e.target.files?.[0];if(!f)return;const u=URL.createObjectURL(f);setImage(u)}
 return <div className="app">
  <header><div className="brand"><b>◉</b><span>SENTINEL<strong> AI</strong></span></div><div className="live">● LIVE GLOBAL MARKETS</div><button className="upload" onClick={()=>fileRef.current?.click()}>＋ Upload chart</button></header>
  <main>
   <section className="hero"><small>MARKET INTELLIGENCE / VERIFIED DATA</small><h1>See the market.<br/><i>Then make the call.</i></h1><p>Real-time market discovery, multi-factor analysis, chart upload, and news context. No fabricated candles, prices, signals or P&amp;L.</p>
    <div className="search"><span>⌕</span><input value={query} onChange={e=>{setQuery(e.target.value);search(e.target.value)}} onKeyDown={e=>{if(e.key==="Enter"&&query.trim())choose({symbol:query.trim().toUpperCase()})}} placeholder="Search BTC, EUR/USD, Apple, Gold, Nasdaq…"/><small>{results.length?"SELECT":"SEARCH"}</small>
    {results.length>0&&<div className="results">{results.map((r,i)=><button key={r.symbol+i} onClick={()=>choose(r)}><b>{r.symbol}</b><span>{r.name}</span><em>{r.exchange||"GLOBAL"} · {r.type||"MARKET"}</em></button>)}</div>}</div>
    <div className="quick">{quick.map(r=><button key={r.symbol} className={symbol===r.symbol?"sel":""} onClick={()=>choose(r)}>{r.symbol}</button>)}</div>
   </section>
   <section className="market"><div><small>CONNECTED MARKET</small><h2>{symbol}</h2><span>{provider||"Awaiting verified provider"} · ●</span></div><div className="price">{fmt(analysis?.price)} <small>LIVE</small></div><div className="frames">{["1m","5m","15m","1h","4h","1d"].map(x=><button key={x} className={interval===x?"on":""} onClick={()=>{setInterval(x);setTimeout(()=>load(symbol),0)}}>{x}</button>)}</div><button className="analyze" onClick={()=>load(symbol)} disabled={loading}>{loading?"ANALYZING…":"ANALYZE ↗"}</button></section>
   <section className="grid">
    <aside><div className="panel"><small>DISCOVER / LIVE</small>{quick.map(r=><button className={symbol===r.symbol?"row active":"row"} key={r.symbol} onClick={()=>choose(r)}><b>{r.symbol}</b><span>{r.name}</span></button>)}<p className="tiny">Coverage is provider-driven. Search returns instruments exposed by connected public providers; unsupported symbols return NO TRADE.</p></div>
    <div className="panel scanner"><small>CHART SCANNER</small><h3>Upload a chart from your phone.</h3><p>Images stay in this browser. The platform will not invent a market identity or pretend an image was analyzed when no verified vision engine is connected.</p><button onClick={()=>fileRef.current?.click()}>TAKE PHOTO / CHOOSE IMAGE</button>{image&&<div className="preview"><img src={image}/><button onClick={()=>{URL.revokeObjectURL(image);setImage("")}}>Remove</button></div>}</div></aside>
    <div className="center"><div className="chartCard"><div className="chartHead"><div><small>PRICE ACTION</small><b>{symbol} · {interval}</b></div><span>REAL-TIME FEED</span></div><div className="chart">{data.length?<Chart data={data}/>:<div className="empty">{loading?"Connecting to verified market…":"Search a market to load its live chart."}</div>}</div><div className="foot"><span>◉ VERIFIED LIVE DATA</span><span>{data.length} candles</span><span>{provider||"—"}</span></div></div>
     <div className="metrics">{[["EMA 20",analysis?.ema20],["EMA 50",analysis?.ema50],["RSI 14",analysis?.rsi],["ATR 14",analysis?.atr]].map(([k,v]:any)=><div key={k}><small>{k}</small><b>{fmt(v)}</b></div>)}</div></div>
    <aside><div className="panel decision"><small>SENTINEL DECISION</small><div className={"signal "+decision.toLowerCase().replaceAll(" ","-")}>{loading?"ANALYZING…":decision}</div><div className="confidence"><b>{analysis?.confidence??"—"}%</b><span>confidence</span></div><div className="meter"><i style={{width:(analysis?.confidence||0)+"%"}}/></div><div className="reasons"><small>WHY</small>{(analysis?.reasons||["Analyze verified market data to receive evidence."]).slice(0,6).map((x:string,i:number)=><p key={i}>› {x}</p>)}</div><div className="guard"><b>NO GUARANTEE</b><span>Signals are analytical evidence, not certainty and never place trades automatically.</span></div></div></aside>
   </section>
   <section className="news"><div><small>MARKET INTELLIGENCE</small><h2>Latest headlines</h2></div>{news.length?news.slice(0,6).map((n,i)=><a key={i} href={n.link} target="_blank" rel="noreferrer">{n.title}<small>{n.pub}</small></a>):<p>News appears after a market is loaded.</p>}</section>
   {error&&<div className="error">{error}</div>}
  </main>
  <footer>REAL DATA ONLY · PROVIDER VERIFIED · NO GUARANTEED PROFITS · NO AUTOMATIC EXECUTION</footer>
  <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={onFile}/>
 </div>
}