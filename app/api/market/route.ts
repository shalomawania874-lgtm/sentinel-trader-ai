import { NextRequest, NextResponse } from "next/server";

const BINANCE_HOSTS=[
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
];
const YAHOO="https://query1.finance.yahoo.com/v8/finance/chart/";
const intervalMap:Record<string,string>={"1m":"1m","5m":"5m","15m":"15m","1h":"1h","4h":"1h","1d":"1d"};
const rangeMap:Record<string,string>={"1m":"7d","5m":"60d","15m":"60d","1h":"730d","4h":"730d","1d":"10y"};

type Candle={t:number;o:number;h:number;l:number;c:number;v:number};
type ProviderResult={provider:string;symbol:string;interval:string;candles:Candle[];price:number;updatedAt:string};

const json=(x:any,status=200)=>NextResponse.json(x,{status,headers:{"Cache-Control":"no-store"}});

function aggregate4h(rows:Candle[]){
  const out:Candle[]=[];
  for(let i=0;i<rows.length;i+=4){
    const g=rows.slice(i,i+4); if(g.length<4) continue;
    out.push({t:g[0].t,o:g[0].o,h:Math.max(...g.map(x=>x.h)),l:Math.min(...g.map(x=>x.l)),c:g[g.length-1].c,v:g.reduce((s,x)=>s+x.v,0)});
  }
  return out;
}
function clean(rows:Candle[],limit:number){
  return rows.filter(x=>[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite)).slice(-limit);
}
function yahooSymbol(s:string){
  return s.includes("=")||s.startsWith("^")||s.includes("-")?s:s;
}
function normalizeYahoo(raw:any,limit:number){
  const r=raw?.chart?.result?.[0]; const q=r?.indicators?.quote?.[0]; const ts=r?.timestamp||[];
  if(!q||ts.length<40) throw new Error("Yahoo returned insufficient candles");
  const rows=Candle[]=[];
  for(let i=0;i<ts.length;i++){
    const o=Number(q.open?.[i]),h=Number(q.high?.[i]),l=Number(q.low?.[i]),c=Number(q.close?.[i]),v=Number(q.volume?.[i]??0);
    if([o,h,l,c].every(Number.isFinite)) rows.push({t:ts[i]*1000,o,h,l,c,v:Number.isFinite(v)?v:0});
  }
  return clean(rows,limit);
}
async function fetchJson(url:string,timeout=7000){
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{cache:"no-store",headers:{accept:"application/json","user-agent":"SentinelTraderAI/1.0"}});
    if(!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  } finally {clearTimeout(timer);}
}
async function tryBinance(symbol:string,interval:string,limit:number):Promise<ProviderResult>{
  const s=symbol.replace(/[^A-Za-z0-9]/g,"").toUpperCase();
  const bi=interval==="4h"?"1h":interval;
  const lim=Math.min(1000,limit*(interval==="4h"?4:1));
  let last="";
  for(const host of BINANCE_HOSTS){
    try{
      const raw=await fetchJson(host+"/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval="+bi+"&limit="+lim);
      if(!Array.isArray(raw)||raw.length<40) throw new Error("insufficient candles");
      let rows=raw.map((x:any)=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])}));
      if(interval==="4h") rows=aggregate4h(rows);
      rows=clean(rows,limit);
      if(rows.length<40) throw new Error("insufficient candles");
      return {provider:"Binance "+new URL(host).hostname,symbol:s,interval,candles:rows,price:rows.at(-1)!.c,updatedAt:new Date().toISOString()};
    }catch(e:any){last=e?.message||"unavailable";}
  }
  throw new Error("Binance redundant endpoints failed: "+last);
}
async function tryYahoo(symbol:string,interval:string,limit:number):Promise<ProviderResult>{
  const normal=symbol.includes("/")?symbol.replace("/",""):yahooSymbol(symbol);
  const yi=intervalMap[interval]||"1h", range=rangeMap[interval]||"730d";
  const url=YAHOO+encodeURIComponent(normal)+"?interval="+yi+"&range="+range;
  const rows=normalizeYahoo(await fetchJson(url),limit);
  const out=interval==="4h"?aggregate4h(rows):rows;
  if(out.length<40) throw new Error("Yahoo insufficient candles");
  return {provider:"Yahoo Finance",symbol:normal,interval,candles:out.slice(-limit),price:out.at(-1)!.c,updatedAt:new Date().toISOString()};
}
async function tryTwelveData(symbol:string,interval:string,limit:number):Promise<ProviderResult>{
  const key=process.env.TWELVE_DATA_API_KEY; if(!key) throw new Error("Twelve Data key not configured");
  const map:Record<string,string>={"1m":"1min","5m":"5min","15m":"15min","1h":"1h","4h":"4h","1d":"1day"};
  const raw=await fetchJson("https://api.twelvedata.com/time_series?symbol="+encodeURIComponent(symbol)+"&interval="+map[interval]+"&outputsize="+Math.min(5000,limit)+"&apikey="+encodeURIComponent(key));
  if(!Array.isArray(raw?.values)||raw.values.length<40) throw new Error(raw?.message||"Twelve Data insufficient candles");
  const rows=raw.values.reverse().map((x:any)=>({t:Date.parse(x.datetime),o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close),v:Number(x.volume||0)}));
  const out=clean(rows,limit); if(out.length<40) throw new Error("Twelve Data insufficient candles");
  return {provider:"Twelve Data",symbol,interval,candles:out,price:out.at(-1)!.c,updatedAt:new Date().toISOString()};
}
async function tryFinnhub(symbol:string,interval:string,limit:number):Promise<ProviderResult>{
  const key=process.env.FINNHUB_API_KEY; if(!key) throw new Error("Finnhub key not configured");
  const sec:Record<string,number>={"1m":60,"5m":300,"15m":900,"1h":3600,"4h":3600,"1d":86400};
  const to=Math.floor(Date.now()/1000),from=to-sec[interval]*Math.max(limit*2,250);
  const raw=await fetchJson("https://finnhub.io/api/v1/stock/candle?symbol="+encodeURIComponent(symbol)+"&resolution="+(interval==="4h"?"60":interval==="1h"?"60":interval==="1d"?"D":interval.replace("m",""))+"&from="+from+"&to="+to+"&token="+encodeURIComponent(key));
  if(raw?.s!=="ok"||!Array.isArray(raw.t)||raw.t.length<40) throw new Error("Finnhub insufficient candles");
  let rows=raw.t.map((t:number,i:number)=>({t:t*1000,o:Number(raw.o[i]),h:Number(raw.h[i]),l:Number(raw.l[i]),c:Number(raw.c[i]),v:Number(raw.v?.[i]||0)}));
  if(interval==="4h") rows=aggregate4h(rows);
  const out=clean(rows,limit); if(out.length<40) throw new Error("Finnhub insufficient candles");
  return {provider:"Finnhub",symbol,interval,candles:out,price:out.at(-1)!.c,updatedAt:new Date().toISOString()};
}
async function tryPolygon(symbol:string,interval:string,limit:number):Promise<ProviderResult>{
  const key=process.env.POLYGON_API_KEY||process.env.MASSIVE_API_KEY; if(!key) throw new Error("Polygon/Massive key not configured");
  const mult=interval==="4h"?4:interval==="1h"?1:interval==="1d"?1:Number(interval.replace("m",""));
  const unit=interval.endsWith("m")?"minute":interval==="1d"?"day":"hour";
  const end=new Date(),start=new Date(end.getTime()-1000*60*60*24*(interval==="1d"?Math.max(limit*2,400):Math.max(limit*8,120)));
  const url="https://api.polygon.io/v2/aggs/ticker/"+encodeURIComponent(symbol)+"/range/"+mult+"/"+unit+"/"+start.toISOString().slice(0,10)+"/"+end.toISOString().slice(0,10)+"?adjusted=true&sort=asc&limit="+Math.min(50000,limit*4)+"&apiKey="+encodeURIComponent(key);
  const raw=await fetchJson(url);
  if(!Array.isArray(raw?.results)||raw.results.length<40) throw new Error(raw?.status||"Polygon/Massive insufficient candles");
  let rows=raw.results.map((x:any)=>({t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)}));
  if(interval==="4h"&&mult===4){} else if(interval==="4h") rows=aggregate4h(rows);
  const out=clean(rows,limit); if(out.length<40) throw new Error("Polygon/Massive insufficient candles");
  return {provider:"Polygon/Massive",symbol,interval,candles:out,price:out.at(-1)!.c,updatedAt:new Date().toISOString()};
}
export async function GET(req:NextRequest){
  const sp=req.nextUrl.searchParams;
  const symbol=(sp.get("symbol")||"BTCUSDT").trim().toUpperCase();
  const interval=sp.get("interval")||"1h";
  const limit=Math.min(500,Math.max(220,Number(sp.get("limit"))||300));
  const isCrypto=/USDT$|USDC$|BTC$|ETH$/.test(symbol);
  const providers=[
    ...(isCrypto?[()=>tryBinance(symbol,interval,limit)]:[]),
    ()=>tryPolygon(symbol,interval,limit),
    ()=>tryTwelveData(symbol,interval,limit),
    ()=>tryFinnhub(symbol,interval,limit),
    ()=>tryYahoo(symbol,interval,limit),
  ];
  const failures:string[]=[];
  for(const p of providers){
    try{
      const result=await p();
      const last=result.candles.at(-1);
      const maxAge:Record<string,number>={"1m":180000,"5m":900000,"15m":1800000,"1h":7200000,"4h":28800000,"1d":172800000};
      if(!last||Date.now()-last.t>maxAge[interval]) throw new Error("provider returned stale data");
      return json(result);
    }catch(e:any){failures.push(e?.message||"provider failed");}
  }
  return json({error:"DATA_UNAVAILABLE",reason:"All verified market-data providers failed or returned stale/insufficient data.",symbol,interval,providersAttempted:providers.length,failures},503);
}
