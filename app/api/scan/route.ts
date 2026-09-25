import {NextRequest,NextResponse} from "next/server";
export async function POST(req:NextRequest){
 try{
  const b=await req.json();const symbols=Array.isArray(b?.symbols)?b.symbols.map(String).slice(0,5000):[];
  if(!symbols.length)return NextResponse.json({error:"Provide a verified symbol universe."},{status:400});
  const concurrency=Number(b?.concurrency)||8;const results:any[]=[];
  for(let i=0;i<symbols.length;i+=concurrency){
   const batch=symbols.slice(i,i+concurrency);
   const rows=await Promise.all(batch.map(async symbol=>{try{
    const r=await fetch(new URL("/api/market?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=300",req.url),{cache:"no-store"});if(!r.ok)return {symbol,status:"DATA_UNAVAILABLE"};const j=await r.json();const c=j.candles||[];if(c.length<220)return {symbol,status:"DATA_UNAVAILABLE"};const close=c.at(-1).c,old=c.at(-9)?.c;
    let signal="WAIT",confidence=null,regime=null;
    try{
      const ar=await fetch(new URL("/api/analyze",req.url),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({candles:c,symbol,interval:"1h"})});
      const aj=await ar.json();
      if(ar.ok){signal=aj.signal||"WAIT";confidence=aj.confidence??null;regime=aj.regime??null;}
    }catch{}
    return {symbol,status:"OK",price:close,momentum:old?close/old-1:0,signal,confidence,regime,provider:j.provider};
   }catch{return {symbol,status:"DATA_UNAVAILABLE"}}}));
   results.push(...rows);
  }
  const rank=(x:any)=>x.status==="OK"?(x.signal==="STRONG BUY"?5:x.signal==="BUY"?4:x.signal==="WAIT"?3:x.signal==="SELL"?2:x.signal==="STRONG SELL"?1:0):0;
  results.sort((a,b)=>(rank(b)-rank(a))||((b.confidence??0)-(a.confidence??0))||((b.momentum??-Infinity)-(a.momentum??-Infinity)));
  return NextResponse.json({scanned:results.length,results,limit:5000,methodology:"Provider-verified market scan with the same live analysis engine used by single-symbol analysis; unavailable instruments are excluded rather than fabricated."});
 }catch(e:any){return NextResponse.json({error:e?.message||"Scanner failed"},{status:400})}
}
