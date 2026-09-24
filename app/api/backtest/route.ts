import {NextRequest,NextResponse} from "next/server";
import {decide,Candle} from "../../../lib/sentinel-engine";
function pct(n:number){return Number((n*100).toFixed(2))}
export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const candles=(Array.isArray(body?.candles)?body.candles:[]) as Candle[];
    const horizon=Math.max(1,Math.min(20,Number(body?.horizon)||1));
    const feeBps=Math.max(0,Number(body?.feeBps)||10);
    const minTrain=Math.max(200,Number(body?.minTrain)||200);
    if(candles.length<minTrain+horizon+20)return NextResponse.json({error:"Need more historical candles for a meaningful walk-forward test."},{status:400});
    let trades=0,wins=0,losses=0,abstain=0,equity=1,peak=1,maxDrawdown=0; const returns:number[]=[];
    const bySignal:Record<string,{n:number;wins:number;avg:number}>={};
    for(let i=minTrain;i<=candles.length-horizon-1;i++){
      const d=decide(candles.slice(0,i),body?.interval||"1h");
      if(d.signal==="NO TRADE"||d.signal==="WAIT"){abstain++;continue;}
      const entry=candles[i-1].c,next=candles[i+horizon];
      const gross=d.signal.includes("BUY")?(next.c/entry-1):(entry.c/next.c-1), r=gross-(feeBps/10000)*2;
      trades++; if(r>0)wins++; else losses++; returns.push(r); equity*=1+r; peak=Math.max(peak,equity); maxDrawdown=Math.max(maxDrawdown,1-equity/peak);
      const k=d.signal; bySignal[k]??={n:0,wins:0,avg:0}; bySignal[k].n++; bySignal[k].wins+=r>0?1:0; bySignal[k].avg+=r;
    }
    const avg=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0, variance=returns.length?returns.reduce((a,b)=>a+(b-avg)**2,0)/returns.length:0;
    const sharpe=variance>0?(avg/Math.sqrt(variance))*Math.sqrt(252/horizon):0;
    const bySignalOut=Object.fromEntries(Object.entries(bySignal).map(([k,v])=>[k,{trades:v.n,winRate:pct(v.wins/Math.max(1,v.n)),avgReturnPct:pct(v.avg/Math.max(1,v.n))}]));
    return NextResponse.json({methodology:"Strict chronological walk-forward. Each prediction uses only candles before the decision; fees are deducted on entry and exit. Historical evidence is not a guarantee.",sample:{candles:candles.length,minTrain,horizon,trades,abstentions:abstain,abstentionRate:pct(abstain/Math.max(1,trades+abstain))},metrics:{winRate:pct(wins/Math.max(1,trades)),lossRate:pct(losses/Math.max(1,trades)),netReturnPct:pct(equity-1),maxDrawdownPct:pct(maxDrawdown),sharpe:Number(sharpe.toFixed(2)),avgTradePct:pct(avg),feeBps},bySignal:bySignalOut});
  }catch(e:any){return NextResponse.json({error:e?.message||"Backtest failed"},{status:400});}
}
