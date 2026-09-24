import { NextRequest, NextResponse } from "next/server";

type Candle={o:number;h:number;l:number;c:number;v:number;t:number};
const ema=(a:number[],p:number)=>{if(a.length<p)return 0;let e=a.slice(0,p).reduce((s,x)=>s+x,0)/p,k=2/(p+1);for(let i=p;i<a.length;i++)e=a[i]*k+e*(1-k);return e};
const rsi=(a:number[],p=14)=>{if(a.length<p+1)return 50;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)};
const atr=(c:Candle[],p=14)=>{if(c.length<p+1)return 0;const tr=c.slice(1).map((x,i)=>Math.max(x.h-x.l,Math.abs(x.h-c[i].c),Math.abs(x.l-c[i].c)));return tr.slice(-p).reduce((s,x)=>s+x,0)/p};
const std=(a:number[])=>{const m=a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,a.length))};
const clean=(n:number)=>Number.isFinite(n)?n:0;

export async function POST(req:NextRequest){
 try{
  const {candles,symbol="",interval="1h"}=await req.json();
  if(!Array.isArray(candles)||candles.length<60)return NextResponse.json({error:"Not enough verified market data."},{status:400});
  const c:Candle[]=candles.map((x:any)=>({t:+x.t,o:+x.o,h:+x.h,l:+x.l,c:+x.c,v:+x.v||0})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite));
  if(c.length<60)return NextResponse.json({error:"Not enough verified market data."},{status:400});
  const closes=c.map(x=>x.c), last=closes.at(-1)!, previous=closes.at(-2)!;
  const e12=ema(closes,12),e26=ema(closes,26),e50=ema(closes,50),e200=ema(closes,200),R=rsi(closes),A=atr(c),macd=e12-e26;
  const prevMacd=ema(closes.slice(0,-1),12)-ema(closes.slice(0,-1),26);
  const momentum=(last-(closes.at(-6)!))/Math.max(Math.abs(closes.at(-6)!),1e-9);
  const recent=c.slice(-50),volNow=recent.slice(-10).reduce((s,x)=>s+x.v,0)/10,volBase=recent.slice(-40,-10).reduce((s,x)=>s+x.v,0)/30,volRatio=volBase>0?volNow/volBase:1;
  const range=recent.map(x=>x.h-x.l), volatility=std(range)/Math.max(last,1e-9);
  const highs=recent.slice(-30).map(x=>x.h).sort((a,b)=>b-a).slice(0,4), lows=recent.slice(-30).map(x=>x.l).sort((a,b)=>a-b).slice(0,4);
  const support=lows.reduce((a,b)=>a+b,0)/Math.max(1,lows.length),resistance=highs.reduce((a,b)=>a+b,0)/Math.max(1,highs.length);
  const age=Date.now()-c.at(-1)!.t, maxAge=interval==="1d"?172800000:interval==="4h"?28800000:interval==="1h"?7200000:3600000;
  const fresh=age<=maxAge;
  let score=0, agreement=0; const reasons:string[]=[]; const plain:string[]=[];
  if(last>e50){score+=2;agreement++;reasons.push("Price is above the 50-period average.");plain.push("Price is above its recent average, so the trend is leaning up.")}else{score-=2;agreement++;reasons.push("Price is below the 50-period average.");plain.push("Price is below its recent average, so the trend is leaning down.")}
  if(e12>e26){score+=2;agreement++;reasons.push("The fast average is above the slow average.");plain.push("Short-term momentum is stronger than longer-term momentum.")}else{score-=2;agreement++;reasons.push("The fast average is below the slow average.");plain.push("Short-term momentum is weaker than longer-term momentum.")}
  if(macd>0&&macd>=prevMacd){score+=1.5;agreement++;reasons.push("MACD is positive and improving.");plain.push("Momentum is moving in the same direction as the trend.")}else if(macd<0&&macd<=prevMacd){score-=1.5;agreement++;reasons.push("MACD is negative and weakening.");plain.push("Momentum is moving down with the trend.")}else reasons.push("MACD is mixed.");
  if(R>=52&&R<=70){score+=1;agreement++;reasons.push("RSI shows healthy bullish momentum.");plain.push("Momentum is positive without looking extremely stretched.")}else if(R<=48&&R>=30){score-=1;agreement++;reasons.push("RSI shows bearish momentum.");plain.push("Momentum is negative without looking extremely stretched.")}else if(R>70||R<30){reasons.push("RSI is stretched.");plain.push("Momentum is stretched, so the system is more cautious.")}
  if(momentum>0.003){score+=1;agreement++;plain.push("Price has risen over the last few candles.")}else if(momentum<-0.003){score-=1;agreement++;plain.push("Price has fallen over the last few candles.")}
  if(volRatio>1.15){agreement++;reasons.push("Trading volume is above its recent baseline.");plain.push("More activity is supporting the current move.")}else reasons.push("Volume is not strongly above its recent baseline.");
  if(Math.abs(score)>=3&&fresh&&agreement>=3){/* directional */}
  const regime=volatility>0.012?"HIGH VOLATILITY":Math.abs(momentum)<0.0015?"RANGE":"TREND";
  const riskPenalty=regime==="HIGH VOLATILITY"?8:0;
  let signal="NO TRADE";
  if(fresh&&agreement>=3&&Math.abs(score)>=4)signal=score>0?"STRONG BUY":"STRONG SELL";
  else if(fresh&&agreement>=2&&Math.abs(score)>=2)signal=score>0?"BUY":"SELL";
  else if(fresh)signal="WAIT";
  const confidence=signal==="NO TRADE"?0:Math.min(94,Math.max(51,Math.round(50+Math.abs(score)*6+agreement*3-riskPenalty)));
  if(!fresh)plain.unshift("The newest candle is too old for this time frame, so I refuse to force a trade.");
  if(signal==="WAIT")plain.unshift("The signals do not agree strongly enough, so waiting is safer than forcing a direction.");
  if(signal==="NO TRADE")plain.unshift("There is not enough fresh agreement between the checks to issue a trade signal.");
  if(regime==="HIGH VOLATILITY")plain.push("The market is moving fast, so the system lowers confidence.");
  const stop=score>=0?last-Math.max(A*1.5,last*.003):last+Math.max(A*1.5,last*.003), risk=Math.abs(last-stop);
  const target1=score>=0?last+risk*1.5:last-risk*1.5,target2=score>=0?last+risk*2.5:last-risk*2.5;
  return NextResponse.json({
   signal,confidence,price:last,symbol,interval,
   indicators:{ema12:clean(e12),ema26:clean(e26),ema50:clean(e50),ema200:clean(e200),rsi:clean(R),atr:clean(A),macd:clean(macd),volumeRatio:clean(volRatio)},
   trend:last>e50?"UP":"DOWN",regime,agreement,maxAgreement:6,
   levels:{support:clean(support),resistance:clean(resistance),stop:clean(stop),target1:clean(target1),target2:clean(target2)},
   reasons:reasons.slice(0,8),plainEnglish:plain.slice(0,8),
   freshness:fresh?"FRESH":"STALE",updatedAt:new Date().toISOString()
  });
 }catch(e:any){return NextResponse.json({error:e instanceof Error?e.message:"Analysis failed"},{status:400})}
}