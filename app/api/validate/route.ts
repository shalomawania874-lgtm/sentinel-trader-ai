import {NextRequest,NextResponse} from "next/server";
import {trainedEnsemble} from "../../../lib/ml-engine";
import type {Candle} from "../../../lib/sentinel-engine";

export async function POST(req:NextRequest){
 try{
  const b=await req.json();const c=(Array.isArray(b?.candles)?b.candles:[]) as Candle[];
  const folds=Math.max(3,Math.min(8,Number(b?.folds)||5)), embargo=Math.max(1,Number(b?.embargo)||6),h=Math.max(1,Number(b?.horizon)||1);
  if(c.length<500)return NextResponse.json({error:"Validation requires at least 500 candles."},{status:400});
  const n=c.length, foldSize=Math.floor((n-220)/folds),out:any[]=[];
  for(let f=0;f<folds;f++){const testStart=220+f*foldSize,testEnd=f===folds-1?n:testStart+foldSize;const trainEnd=Math.max(220,testStart-embargo-h);
    const train=c.slice(0,trainEnd),test=c.slice(testStart,testEnd);let correct=0,total=0;
    for(let i=260;i<train.length;i+=Math.max(1,Math.floor(train.length/80))){trainedEnsemble(train.slice(0,i),h)}
    for(let i=0;i<test.length-h;i++){const hist=c.slice(0,testStart+i),m=trainedEnsemble(hist,h),actual=test[i+h].c>test[i].c?1:0;const pred=m.probability>.5?1:0;correct+=pred===actual?1:0;total++}
    out.push({fold:f+1,trainEnd,testStart,testEnd,embargo,accuracy:total?correct/total:null,n:total});
  }
  return NextResponse.json({protocol:"chronological walk-forward with label-horizon purge plus embargo",folds:out,averageAccuracy:out.length?out.reduce((s,x)=>s+(x.accuracy||0),0)/out.length:0,note:"Training observations whose labels overlap the test boundary are purged, then an embargo is applied. This is a validation harness, not proof of future profitability. The final holdout must remain untouched."});
 }catch(e:any){return NextResponse.json({error:e?.message||"Validation failed"},{status:400})}
}
