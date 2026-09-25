import {NextRequest,NextResponse} from "next/server";
import {decide,Candle} from "../../../lib/sentinel-engine";
import {trainedEnsemble} from "../../../lib/ml-engine";

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const candles=(Array.isArray(body?.candles)?body.candles:[]) as Candle[];
    const interval=body?.interval||"1h";
    const symbol=body?.symbol||"UNKNOWN";
    if(candles.length<220)return NextResponse.json({error:"INSUFFICIENT_DATA",reason:"At least 220 verified candles are required.",dataStatus:"INVALID"},{status:400});

    const clean=candles.filter(c=>[c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
    if(clean.length<220)return NextResponse.json({error:"INVALID_DATA",reason:"Verified OHLCV data is incomplete.",dataStatus:"INVALID"},{status:400});

    const age=Date.now()-clean.at(-1)!.t;
    const maxAge:Record<string,number>={"5m":10*60_000,"15m":30*60_000,"1h":2*60*60_000,"4h":8*60*60_000,"1d":48*60*60_000};
    if(age<0 || age>(maxAge[interval]||2*60*60_000))
      return NextResponse.json({signal:"NO TRADE",decision:"NO TRADE",action:"NO TRADE",symbol,interval,dataStatus:"STALE",reason:"Latest verified candle is stale.",candleCount:clean.length,lastCandleAt:new Date(clean.at(-1)!.t).toISOString()});

    const result=decide(clean,interval);
    let ml:any=null;
    if(clean.length>=260){ try{ ml=trainedEnsemble(clean,1); }catch{} }

    const engineSignal=result.signal;
    const mlProbability=typeof ml?.probability==="number"?ml.probability:null;
    const mlBias=mlProbability==null?0:mlProbability>.58?1:mlProbability<.42?-1:0;
    let signal=engineSignal;
    if((engineSignal==="WAIT"||engineSignal==="NEUTRAL") && mlBias!==0){
      signal=mlBias>0?"BUY":"SELL";
    } else if((engineSignal==="BUY"||engineSignal==="STRONG BUY") && mlBias<0){
      signal="WAIT";
    } else if((engineSignal==="SELL"||engineSignal==="STRONG SELL") && mlBias>0){
      signal="WAIT";
    }
    const payload={
      ...result,
      signal,
      decision:signal,
      action:signal,
      symbol,interval,
      dataStatus:"LIVE_VERIFIED",
      candleCount:clean.length,
      lastCandleAt:new Date(clean.at(-1)!.t).toISOString(),
      ml:ml?{probability:ml.probability,signal:ml.signal,regime:ml.regime,calibrated:ml.calibrated,totalModels:ml.totalModels,trainSamples:ml.trainSamples,validationAccuracy:ml.validationAccuracy,brierScore:ml.brierScore}:null,
      updatedAt:new Date().toISOString(),
      methodology:"Live verified OHLCV + deterministic technical ensemble + correctly trained/calibrated chronological logistic ensemble when enough history exists. Conflicting model evidence can force WAIT. No simulated prices or signals."
    };
    return NextResponse.json(payload,{headers:{"Cache-Control":"no-store, no-cache, must-revalidate"}});
  }catch(e:any){
    return NextResponse.json({error:"ANALYSIS_FAILED",reason:e?.message||"Analysis failed",dataStatus:"ERROR"},{status:500});
  }
}
