import {NextRequest,NextResponse} from "next/server";
import {trainedEnsemble} from "../../../lib/ml-engine";
import {decide,type Candle} from "../../../lib/sentinel-engine";

const intervals=["15m","1h","4h","1d"];
export async function POST(req:NextRequest){
 try{
  const body=await req.json(); const candles=(Array.isArray(body?.candles)?body.candles:[]) as Candle[];
  if(candles.length<260)return NextResponse.json({error:"At least 260 verified candles are required for training."},{status:400});
  const base=decide(candles,body?.interval||"1h");
  const ml=[1,3,6].map(h=>trainedEnsemble(candles,h));
  return NextResponse.json({
   symbol:body?.symbol||"UNKNOWN",base,
   ml:{ensemble:ml,probability:ml.reduce((s,x)=>s+x.probability,0)/ml.length,regime:ml[1].regime,
       calibrated:ml.every(x=>x.calibrated),trainedModels:ml.reduce((s,x)=>s+x.models,0),
       samples:Math.max(...ml.map(x=>x.trainSamples))},
   methodology:"Trained logistic ML ensemble with multiple feature weightings, regime awareness, multi-horizon targets, and Platt-style probability calibration. No probability is claimed unless calibration data exists."
  });
 }catch(e:any){return NextResponse.json({error:e?.message||"ML analysis failed"},{status:400})}
}
