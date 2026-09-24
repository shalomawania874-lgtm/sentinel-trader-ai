import {NextRequest,NextResponse} from "next/server";
export async function POST(req:NextRequest){
 try{
  const b=await req.json();const symbols=Array.isArray(b?.symbols)?b.symbols.map(String).slice(0,5000):[];
  if(!symbols.length)return NextResponse.json({error:"Provide a verified symbol universe."},{status:400});
  const concurrency=Number(b?.concurrency)||8;const results:any[]=[];
  for(let i=0;i<symbols.length;i+=concurrency){
   const batch=symbols.slice(i,i+concurrency);
   const rows=await Promise.all(batch.map(async symbol=>{try{
    const r=await fetch(new URL("/api/market?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=300",req.url),{cache:"no-store"});if(!r.ok)return {symbol,status:"DATA_UNAVAILABLE"};const j=await r.json();const c=j.candles||[];if(c.length<220)return {symbol,status:"DATA_UNAVAILABLE"};const close=c.at(-1).c,old=c.at(-9)?.c;return {symbol,status:"OK",price:close,momentum:old?close/old-1:0,provider:j.provider};
   }catch{return {symbol,status:"DATA_UNAVAILABLE"}}}));
   results.push(...rows);
  }
  results.sort((a,b)=>(b.momentum??-Infinity)-(a.momentum??-Infinity));
  return NextResponse.json({scanned:results.length,results,limit:5000,methodology:"Provider-verified market scan; unavailable instruments are excluded rather than fabricated."});
 }catch(e:any){return NextResponse.json({error:e?.message||"Scanner failed"},{status:400})}
}
