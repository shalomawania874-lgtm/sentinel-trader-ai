import { NextRequest, NextResponse } from "next/server";

const ema=(a:number[],n:number)=>{if(a.length<n)return 0;let e=a.slice(0,n).reduce((s,x)=>s+x,0)/n,k=2/(n+1);for(let i=n;i<a.length;i++)e=a[i]*k+e*(1-k);return e};
const rsi=(a:number[],n=14)=>{if(a.length<n+1)return 50;let g=0,l=0;for(let i=a.length-n;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}if(l===0)return 100;return 100-100/(1+g/l)};
const atr=(c:any[],n=14)=>{if(c.length<n+1)return 0;const tr=c.slice(1).map((x:any,i:number)=>Math.max(x.h-x.l,Math.abs(x.h-c[i].c),Math.abs(x.l-c[i].c)));return tr.slice(-n).reduce((s:number,x:number)=>s+x,0)/n};
const macd=(a:number[])=>ema(a,12)-ema(a,26);
const slope=(a:number[],n=20)=>{const x=a.slice(-n);if(x.length<2)return 0;return (x.at(-1)-x[0])/Math.max(1,Math.abs(x[0]))};

export async function POST(req:NextRequest){
  try{
    const body=await req.json(), c=body?.candles||[];
    if(!Array.isArray(c)||c.length<40) throw new Error("At least 40 verified candles are required.");
    const close=c.map((x:any)=>Number(x.c)), last=close.at(-1), e20=ema(close,20), e50=ema(close,50), e200=ema(close,200), R=rsi(close), A=atr(c), M=macd(close), S=slope(close);
    const recent=c.slice(-40), support=Math.min(...recent.map((x:any)=>x.l)), resistance=Math.max(...recent.map((x:any)=>x.h));
    let score=0; const reasons:string[]=[];
    if(last>e20){score+=1;reasons.push("Price is above the 20-period EMA.")}else{score-=1;reasons.push("Price is below the 20-period EMA.")}
    if(e20>e50){score+=1;reasons.push("20 EMA is above 50 EMA, supporting bullish trend structure.")}else{score-=1;reasons.push("20 EMA is below 50 EMA, supporting bearish trend structure.")}
    if(e200){if(last>e200){score+=1;reasons.push("Price is above the 200-period EMA.")}else{score-=1;reasons.push("Price is below the 200-period EMA.")}}
    if(R>=55&&R<=72){score+=1;reasons.push("RSI has positive momentum without being deeply overbought.")}else if(R<=45&&R>=28){score-=1;reasons.push("RSI has negative momentum without being deeply oversold.")}else reasons.push("RSI is extended or neutral, so momentum is less reliable.");
    if(M>0){score+=1;reasons.push("MACD spread is positive.")}else{score-=1;reasons.push("MACD spread is negative.")}
    if(S>0.005){score+=1;reasons.push("Recent price slope is positive.")}else if(S<-0.005){score-=1;reasons.push("Recent price slope is negative.")}else reasons.push("Recent price slope is relatively flat.");
    const strength=Math.abs(score);
    let signal="NEUTRAL";
    if(strength>=4) signal=score>0?"STRONG BUY":"STRONG SELL"; else if(strength>=2) signal=score>0?"BUY":"SELL";
    if((R>75&&score>0)||(R<25&&score<0)) {signal="WAIT";reasons.push("Momentum is extended; the engine suppresses a directional call.");}
    const confidence=Math.min(95,Math.max(35,Math.round(50+strength*8+Math.min(10,Math.abs(S)*500))));
    return NextResponse.json({signal,confidence,price:last,ema20:e20,ema50:e50,ema200:e200,rsi:R,atr:A,macd:M,support,resistance,reasons,model:"Deterministic multi-factor technical engine v2",updatedAt:new Date().toISOString()});
  }catch(e:any){return NextResponse.json({error:e?.message||"Analysis failed"},{status:400})}
}