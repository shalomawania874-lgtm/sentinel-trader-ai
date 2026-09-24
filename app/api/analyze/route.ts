import { NextRequest, NextResponse } from "next/server";

type C={o:number;h:number;l:number;c:number;v:number;t:number};
const ema=(a:number[],p:number)=>{if(!a.length)return 0;const k=2/(p+1);let e=a[0];for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e};
function rsi(a:number[],p=14){if(a.length<p+1)return 50;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}if(l===0)return 100;return 100-100/(1+(g/p)/(l/p))}
function atr(c:C[],p=14){if(c.length<2)return 0;let s=0,n=0;for(let i=Math.max(1,c.length-p);i<c.length;i++){s+=Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c));n++}return n?s/n:0}
function stdev(a:number[]){const m=a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,a.length))}
function levels(c:C[]){const tail=c.slice(-60);const highs=[...tail].sort((a,b)=>b.h-a.h).slice(0,5).map(x=>x.h);const lows=[...tail].sort((a,b)=>a.l-b.l).slice(0,5).map(x=>x.l);return {resistance:[...new Set(highs)].slice(0,3),support:[...new Set(lows)].slice(0,3)}}
function clean(n:number){return Number.isFinite(n)?n:0}
export async function POST(req:NextRequest){try{
 const {candles,news=[],symbol="",interval="1h"}=await req.json();
 if(!Array.isArray(candles)||candles.length<60)return NextResponse.json({error:"Insufficient verified market data"},{status:400});
 const c:C[]=candles.map((x:any)=>({t:+x.t,o:+x.o,h:+x.h,l:+x.l,c:+x.c,v:+x.v||0})).filter(x=>[x.o,x.h,x.l,x.c].every(Number.isFinite));
 if(c.length<60)return NextResponse.json({error:"Insufficient verified market data"},{status:400});
 const closes=c.map(x=>x.c),last=closes.at(-1)!,prev=closes.at(-2)!;
 const e12=ema(closes,12),e26=ema(closes,26),r=rsi(closes),a=atr(c),returns=closes.slice(-30).map((x,i)=>i?Math.log(x/closes[closes.length-30+i-1]):0).slice(1),vol=stdev(returns);
 const slope=(last-closes.at(-21)!)/Math.max(a,1e-9),trend=slope>1?"BULLISH":slope<-1?"BEARISH":"RANGE";
 const regime=vol>0.018?"HIGH VOLATILITY":Math.abs(slope)<.35?"RANGE":trend;
 const macd=e12-e26,prevMacd=ema(closes.slice(0,-1),12)-ema(closes.slice(0,-1),26);
 const momentum=last-closes.at(-6)!;const volNow=c.slice(-10).reduce((s,x)=>s+x.v,0)/10;const volPrev=c.slice(-30,-10).reduce((s,x)=>s+x.v,0)/20;const volumeRatio=volPrev>0?volNow/volPrev:1;
 const newsText=news.map((n:any)=>String(n.title||"")).join(" ").toLowerCase();const pos=(newsText.match(/surge|rally|gain|growth|bull|rise|strong|beat|upgrade/g)||[]).length;const neg=(newsText.match(/fall|drop|loss|bear|risk|crash|weak|cut|downgrade/g)||[]).length;
 let score=0;const reasons:string[]=[];let agreement=0;
 if(e12>e26){score+=2;agreement++;reasons.push("EMA 12 is above EMA 26, supporting an upward trend structure")}else{score-=2;agreement++;reasons.push("EMA 12 is below EMA 26, supporting a downward trend structure")}
 if(macd>0&&macd>=prevMacd){score+=1.25;agreement++;reasons.push("MACD momentum is positive and improving")}else if(macd<0&&macd<=prevMacd){score-=1.25;agreement++;reasons.push("MACD momentum is negative and weakening")}else reasons.push("MACD momentum is not strongly aligned")
 if(r>=52&&r<=70){score+=1;agreement++;reasons.push("RSI "+r.toFixed(1)+" supports bullish momentum without being deeply overbought")}else if(r<=48&&r>=30){score-=1;agreement++;reasons.push("RSI "+r.toFixed(1)+" supports bearish momentum without being deeply oversold")}else reasons.push("RSI "+r.toFixed(1)+" is extended or neutral; momentum evidence is weaker")
 if(momentum>0){score+=.75;reasons.push("Short-term price momentum is positive")}else if(momentum<0){score-=.75;reasons.push("Short-term price momentum is negative")}
 if(volumeRatio>1.15){agreement++;reasons.push("Recent volume is "+volumeRatio.toFixed(2)+"x its 20-bar baseline")}else reasons.push("Volume expansion is not strong enough to confirm the move")
 if(pos>neg&&newsText){score+=.35;reasons.push("Recent headlines have a mildly positive tone")}else if(neg>pos&&newsText){score-=.35;reasons.push("Recent headlines have a mildly negative tone")}else reasons.push("Headline evidence is mixed or unavailable")
 const lvl=levels(c);const nearSupport=Math.max(...lvl.support.filter(x=>x<last),-Infinity);const nearResistance=Math.min(...lvl.resistance.filter(x=>x>last),Infinity);
 if(Number.isFinite(nearSupport)&&last-nearSupport<=a*1.5)reasons.push("Price is close to a recent support area");
 if(Number.isFinite(nearResistance)&&nearResistance-last<=a*1.5)reasons.push("Price is close to a recent resistance area");
 const freshnessMs=interval==="1d"?172800000:interval==="4h"?28800000:interval==="1h"?7200000:3600000;
 const dataFresh=Date.now()-c.at(-1)!.t<freshnessMs;let signal="NO TRADE";
 if(dataFresh&&agreement>=3&&Math.abs(score)>=3)signal=score>=0?"STRONG BUY":"STRONG SELL";
 else if(dataFresh&&agreement>=2&&Math.abs(score)>=1.75)signal=score>=0?"BUY":"SELL";
 else if(dataFresh)signal="WAIT";
 const confidence=signal==="NO TRADE"?0:Math.min(96,Math.max(51,Math.round(50+Math.abs(score)/6*43+agreement*1.5-(regime==="HIGH VOLATILITY"?7:0))));
 if(signal==="NO TRADE")reasons.push("Data freshness or evidence agreement is below the minimum threshold; Sentinel refuses to force a trade");
 if(regime==="HIGH VOLATILITY")reasons.push("Volatility regime is elevated; confidence is penalized and risk must be smaller");
 const stop=score>=0?last-Math.max(a*1.5,last*.003):last+Math.max(a*1.5,last*.003);const risk=Math.abs(last-stop);const target1=score>=0?last+risk*1.5:last-risk*1.5;const target2=score>=0?last+risk*2.5:last-risk*2.5;
 return NextResponse.json({signal,confidence,price:last,emaFast:clean(e12),emaSlow:clean(e26),rsi:clean(r),atr:clean(a),trend,regime,agreement,reasons:reasons.slice(0,8),levels:lvl,risk:{stop:clean(stop),target1:clean(target1),target2:clean(target2),rr:2.5},freshness:dataFresh?"DATA FRESH":"DATA STALE",updatedAt:new Date().toISOString(),symbol,interval,volumeRatio:clean(volumeRatio),previousPrice:prev});
}catch(e:any){return NextResponse.json({error:e instanceof Error?e.message:"analysis failed"},{status:400})}}