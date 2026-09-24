import { NextRequest, NextResponse } from "next/server";

export async function GET(req:NextRequest){
  const q=(req.nextUrl.searchParams.get("q")||"").trim();
  if(q.length<2) return NextResponse.json({results:[]});
  const results:any[]=[];
  try{
    const y=await fetch("https://query1.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(q)+"&quotesCount=40&newsCount=0",{cache:"no-store"});
    if(y.ok){
      const j=await y.json();
      for(const x of j?.quotes||[]) if(x.symbol) results.push({symbol:x.symbol,name:x.longname||x.shortname||x.symbol,exchange:x.exchange||"GLOBAL",type:x.quoteType||"MARKET"});
    }
  }catch{}
  try{
    const b=await fetch("https://api.binance.com/api/v3/exchangeInfo",{cache:"no-store"});
    if(b.ok){
      const j=await b.json(), needle=q.toUpperCase();
      for(const x of j?.symbols||[]) if(x.status==="TRADING"&&x.quoteAsset==="USDT"&&(x.symbol.includes(needle)||x.baseAsset.includes(needle)))
        results.push({symbol:x.symbol,name:x.baseAsset+" / USDT",exchange:"BINANCE",type:"CRYPTO"});
    }
  }catch{}
  const seen=new Set<string>();
  return NextResponse.json({results:results.filter(x=>{if(seen.has(x.symbol))return false;seen.add(x.symbol);return true}).slice(0,40)});
}