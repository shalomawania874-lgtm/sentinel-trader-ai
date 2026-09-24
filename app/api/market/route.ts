import { NextRequest, NextResponse } from "next/server";

const BINANCE = "https://data-api.binance.vision/api/v3/klines";
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

const binanceSymbol = (s:string) => s.replace(/[^A-Z0-9]/g,"").toUpperCase();
const yahooInterval:Record<string,string> = {"1m":"1m","5m":"5m","15m":"15m","1h":"1h","4h":"1h","1d":"1d"};
const yahooRange:Record<string,string> = {"1m":"7d","5m":"60d","15m":"60d","1h":"730d","4h":"730d","1d":"10y"};

function aggregate4h(rows:any[]){
  const out:any[]=[];
  for(let i=0;i<rows.length;i+=4){
    const g=rows.slice(i,i+4); if(g.length<4) continue;
    out.push({t:g[0].t,o:g[0].o,h:Math.max(...g.map(x=>x.h)),l:Math.min(...g.map(x=>x.l)),c:g[g.length-1].c,v:g.reduce((s,x)=>s+x.v,0)});
  }
  return out;
}

export async function GET(req:NextRequest){
  const sp=req.nextUrl.searchParams;
  const symbol=(sp.get("symbol")||"BTCUSDT").trim().toUpperCase();
  const interval=sp.get("interval")||"1h";
  const limit=Math.min(500,Math.max(40,Number(sp.get("limit")||180)));
  try{
    if(/^[A-Z0-9]{3,20}USDT$/.test(symbol)){
      const q=`?symbol=${encodeURIComponent(binanceSymbol(symbol))}&interval=${encodeURIComponent(interval==="4h"?"1h":interval)}&limit=${Math.min(1000,limit*(interval==="4h"?4:1))}`;
      const r=await fetch(BINANCE+q,{cache:"no-store"});
      if(r.ok){
        const raw=await r.json();
        let candles=raw.filter((x:any[])=>Array.isArray(x)&&x.length>=6).map((x:any[])=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])}));
        if(interval==="4h") candles=aggregate4h(candles);
        candles=candles.slice(-limit);
        if(candles.length>=40) return NextResponse.json({provider:"Binance Vision",symbol,interval,candles,price:candles.at(-1)?.c,updatedAt:new Date().toISOString()});
      }
    }
    const normalized=symbol.includes("=")||symbol.startsWith("^")||symbol.includes("-")?symbol:symbol;
    const yi=yahooInterval[interval]||"1h", range=yahooRange[interval]||"730d";
    const url=`${YAHOO}${encodeURIComponent(normalized)}?interval=${yi}&range=${range}`;
    const r=await fetch(url,{headers:{accept:"application/json"},cache:"no-store"});
    if(!r.ok) throw new Error("Yahoo Finance unavailable");
    const j=await r.json(), res=j?.chart?.result?.[0];
    const ts=res?.timestamp||[], q=res?.indicators?.quote?.[0];
    if(!q||ts.length<40) throw new Error("No usable market data returned");
    let candles=ts.map((t:number,i:number)=>({t:t*1000,o:Number(q.open?.[i]),h:Number(q.high?.[i]),l:Number(q.low?.[i]),c:Number(q.close?.[i]),v:Number(q.volume?.[i]||0)})).filter((x:any)=>[x.o,x.h,x.l,x.c].every(Number.isFinite));
    candles=candles.slice(-limit);
    if(candles.length<40) throw new Error("Insufficient market data");
    return NextResponse.json({provider:"Yahoo Finance",symbol:res.meta?.symbol||symbol,interval,candles,price:candles.at(-1)?.c,updatedAt:new Date().toISOString()});
  }catch(e:any){
    return NextResponse.json({error:"DATA UNAVAILABLE",reason:e?.message||"No verified provider returned usable data."},{status:503});
  }
}