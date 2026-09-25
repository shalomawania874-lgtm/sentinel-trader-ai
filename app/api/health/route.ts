import {NextResponse} from "next/server";
export async function GET(){
  const endpoints=[
    ["Binance-Primary","https://data-api.binance.vision/api/v3/time"],
    ["Binance-Secondary","https://api.binance.com/api/v3/time"],
    ["Binance-GCP","https://api-gcp.binance.com/api/v3/time"],
    ["Yahoo","https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d"],
    ...(process.env.TWELVE_DATA_API_KEY?[["TwelveData","https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=2&apikey="+encodeURIComponent(process.env.TWELVE_DATA_API_KEY)]]:[]),
    ...(process.env.FINNHUB_API_KEY?[["Finnhub","https://finnhub.io/api/v1/quote?symbol=AAPL&token="+encodeURIComponent(process.env.FINNHUB_API_KEY)]]:[])
  ] as string[][];
  const checks:any[]=[];
  for(const [name,url] of endpoints){
    const t=Date.now();
    try{const r=await fetch(url,{cache:"no-store"});checks.push({name,ok:r.ok,status:r.status,latencyMs:Date.now()-t});}
    catch(e:any){checks.push({name,ok:false,latencyMs:Date.now()-t,error:e?.message||"unavailable"});}
  }
  const live=checks.filter(x=>x.ok).length;
  return NextResponse.json({status:live>=2?"HEALTHY":live===1?"DEGRADED":"DOWN",liveProviders:live,totalProviders:checks.length,checks,generatedAt:new Date().toISOString(),policy:"real data only; stale/unavailable data => NO TRADE"});
}