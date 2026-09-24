import {NextRequest,NextResponse} from "next/server";
import {decide,Candle} from "../../../lib/sentinel-engine";
export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const candles=(Array.isArray(body?.candles)?body.candles:[]) as Candle[];
    if(candles.length<60)return NextResponse.json({error:"Not enough verified market data."},{status:400});
    const result=decide(candles,body?.interval||"1h");
    return NextResponse.json({...result,symbol:body?.symbol||"UNKNOWN",updatedAt:new Date().toISOString(),methodology:"Deterministic multi-factor ensemble with freshness gating. Confidence is evidence strength, not win probability."});
  }catch(e:any){return NextResponse.json({error:e?.message||"Analysis failed"},{status:400});}
}
