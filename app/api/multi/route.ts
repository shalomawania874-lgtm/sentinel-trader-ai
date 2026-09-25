import {NextRequest,NextResponse} from "next/server";
import {decide,Candle} from "../../../lib/sentinel-engine";
import {trainedEnsemble} from "../../../lib/ml-engine";

const TF=["1h","4h","1d"] as const;
export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get("symbol")||"BTCUSDT").trim().toUpperCase();
  try{
    const rows:any[]=[];
    for(const interval of TF){
      const r=await fetch(new URL("/api/market?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit=300",req.url),{cache:"no-store"});
      if(!r.ok){rows.push({interval,status:"DATA_UNAVAILABLE"});continue;}
      const j=await r.json(); const c=(j.candles||[]) as Candle[];
      if(c.length<220){rows.push({interval,status:"INSUFFICIENT_DATA"});continue;}
      const d=decide(c,interval);
      const ml=c.length>=260?trainedEnsemble(c,1):null;
      rows.push({interval,status:"LIVE_VERIFIED",provider:j.provider,signal:d.signal,confidence:d.confidence,trend:d.trend,regime:d.regime,price:d.price,freshness:d.freshness,ml:ml?{probability:ml.probability,signal:ml.signal,calibrated:ml.calibrated,validationAccuracy:ml.validationAccuracy}:null});
    }
    const usable=rows.filter(x=>x.status==="LIVE_VERIFIED");
    if(!usable.length)return NextResponse.json({symbol,status:"NO_TRADE",reason:"No timeframe returned verified data.",timeframes:rows});
    const dir=(s:string)=>s.includes("BUY")?1:s.includes("SELL")?-1:0;
    const votes=usable.map(x=>dir(x.signal));
    const sum=votes.reduce((a,b)=>a+b,0);
    const consensus=sum>=2?"BUY":sum<=-2?"SELL":sum===3?"STRONG BUY":sum===-3?"STRONG SELL":"WAIT";
    return NextResponse.json({symbol,status:"LIVE_VERIFIED",consensus,timeframes:rows,agreement:votes.filter(v=>v===Math.sign(sum)&&v!==0).length,updatedAt:new Date().toISOString(),methodology:"Independent 1h/4h/1d provider-verified analyses. Consensus never substitutes for missing data."},{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){return NextResponse.json({symbol,status:"ERROR",reason:e?.message||"Multi-timeframe analysis failed"},{status:500});}
}
