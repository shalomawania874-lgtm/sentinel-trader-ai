import {NextResponse} from "next/server";
export async function GET(){
  const checks:any[]=[];
  for(const [name,url] of [["Binance","https://data-api.binance.vision/api/v3/time"],["Yahoo","https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d"]]){
    const t=Date.now(); try{const r=await fetch(url,{cache:"no-store"});checks.push({name,ok:r.ok,latencyMs:Date.now()-t,status:r.status});}catch(e:any){checks.push({name,ok:false,latencyMs:Date.now()-t,error:e?.message||"unavailable"});}
  }
  return NextResponse.json({status:checks.every(x=>x.ok)?"HEALTHY":"DEGRADED",checks,generatedAt:new Date().toISOString(),rules:["real data only","no fabricated signals","stale or unavailable data => NO TRADE"]},{headers:{"Cache-Control":"no-store"}});
}
