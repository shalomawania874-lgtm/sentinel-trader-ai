import { NextRequest,NextResponse } from "next/server";
const yahooRange:Record<string,string>={"1m":"7d","5m":"60d","15m":"60d","1h":"730d","4h":"730d","1d":"10y"};
function aggregate4h(rows:any[]){const out:any[]=[];for(let i=0;i<rows.length;i+=4){const g=rows.slice(i,i+4);if(g.length<4)continue;out.push({t:g[0].t,o:g[0].o,h:Math.max(...g.map(x=>x.h)),l:Math.min(...g.map(x=>x.l)),c:g[g.length-1].c,v:g.reduce((s:number,x:any)=>s+(x.v||0),0)})}return out}
export async function GET(req:NextRequest){
 const symbol=(req.nextUrl.searchParams.get("symbol")||"BTCUSDT").trim().toUpperCase().replace(/\s+/g,"");
 const interval=req.nextUrl.searchParams.get("interval")||"1h";const limit=Math.min(500,Math.max(40,Number(req.nextUrl.searchParams.get("limit"))||180));
 try{
  if(/^[A-Z0-9]{3,20}USDT$/.test(symbol)){
   const q="?symbol="+encodeURIComponent(symbol)+"&interval="+encodeURIComponent(interval)+"&limit="+limit;
   for(const endpoint of ["https://data-api.binance.vision/api/v3/klines"+q,"https://api.binance.com/api/v3/klines"+q])try{
    const r=await fetch(endpoint,{cache:"no-store"});if(!r.ok)continue;const rows=await r.json();if(!Array.isArray(rows)||rows.length<2)continue;
    const candles=rows.map((x:any[])=>({t:Number(x[0]),o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4]),v:Number(x[5])}));
    return NextResponse.json({provider:endpoint.startsWith("https://data-api")?"Binance Vision":"Binance",symbol,interval,candles,price:candles.at(-1)?.c,updatedAt:new Date().toISOString()});
   }catch{}
   return NextResponse.json({error:"DATA UNAVAILABLE",reason:"No crypto provider returned valid data"},{status:503});
  }
  const sourceInterval=interval==="4h"?"60m":interval,range=yahooRange[interval]||"6mo";
  const endpoint="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval="+encodeURIComponent(sourceInterval)+"&range="+range;
  const response=await fetch(endpoint,{cache:"no-store"});if(!response.ok)throw new Error("Yahoo Finance provider unavailable");
  const json=await response.json(),result=json?.chart?.result?.[0],timestamps=result?.timestamp||[],quote=result?.indicators?.quote?.[0];
  if(!quote||timestamps.length<2)throw new Error("No market data returned for "+symbol);
  let candles=timestamps.map((t:number,i:number)=>({t:t*1000,o:Number(quote.open?.[i]),h:Number(quote.high?.[i]),l:Number(quote.low?.[i]),c:Number(quote.close?.[i]),v:Number(quote.volume?.[i]||0)})).filter((x:any)=>Number.isFinite(x.c)&&Number.isFinite(x.h)&&Number.isFinite(x.l));
  if(interval==="4h")candles=aggregate4h(candles);candles=candles.slice(-limit);if(candles.length<2)throw new Error("No usable market data returned");
  return NextResponse.json({provider:"Yahoo Finance",symbol,interval,candles,price:candles.at(-1)?.c,updatedAt:new Date().toISOString()});
 }catch(error:any){return NextResponse.json({error:"DATA UNAVAILABLE",reason:error instanceof Error?error.message:"Market provider unavailable"},{status:503})}
}
