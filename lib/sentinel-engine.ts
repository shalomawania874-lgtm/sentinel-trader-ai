export type Candle = { t:number;o:number;h:number;l:number;c:number;v:number };

const finite=(n:number)=>Number.isFinite(n)?n:0;
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;

export function ema(a:number[],p:number){
  if(a.length<p)return 0;
  const k=2/(p+1); let e=mean(a.slice(0,p));
  for(let i=p;i<a.length;i++) e=a[i]*k+e*(1-k);
  return e;
}
export function rsi(a:number[],p=14){
  if(a.length<p+1)return 50;
  let g=0,l=0;
  for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d;}
  if(l===0)return 100;
  return 100-100/(1+g/l);
}
export function atr(c:Candle[],p=14){
  if(c.length<p+1)return 0;
  const tr=c.slice(1).map((x,i)=>Math.max(x.h-x.l,Math.abs(x.h-c[i].c),Math.abs(x.l-c[i].c)));
  return mean(tr.slice(-p));
}
const stdev=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
const clean=(n:number)=>Number.isFinite(n)?Number(n.toFixed(6)):0;

export type Decision={
 signal:"STRONG BUY"|"BUY"|"WAIT"|"SELL"|"STRONG SELL"|"NO TRADE";
 confidence:number; score:number; agreement:number; maxAgreement:number;
 trend:"UP"|"DOWN"|"MIXED"; regime:"TREND"|"RANGE"|"HIGH VOLATILITY";
 reasons:string[]; plainEnglish:string[]; freshness:"FRESH"|"STALE";
 price:number; levels:{support:number;resistance:number;stop:number;target1:number;target2:number};
 indicators:{ema12:number;ema26:number;ema50:number;ema200:number;rsi:number;atr:number;macd:number;momentum:number;volumeRatio:number;volatility:number};
};

export function decide(raw:Candle[], interval="1h"):Decision{
  const c=raw.filter(x=>[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite));
  if(c.length<60) throw new Error("Not enough verified market data.");
  const closes=c.map(x=>x.c), last=closes.at(-1)!;
  const e12=ema(closes,12),e26=ema(closes,26),e50=ema(closes,50),e200=ema(closes,200);
  const rr=rsi(closes), aa=atr(c), macd=e12-e26;
  const prevE12=ema(closes.slice(0,-1),12),prevE26=ema(closes.slice(0,-1),26),prevMacd=prevE12-prevE26;
  const base=Math.max(Math.abs(closes.at(-7)??last),1e-9);
  const momentum=(last-(closes.at(-7)??last))/base;
  const recent=c.slice(-40),volNow=mean(c.slice(-10).map(x=>x.v)),volBase=mean(c.slice(-40,-10).map(x=>x.v));
  const volumeRatio=volBase>0?volNow/volBase:1;
  const volatility=stdev(recent.map(x=>(x.h-x.l)/Math.max(x.c,1e-9)));
  const highs=recent.map(x=>x.h).sort((a,b)=>b-a).slice(0,5);
  const lows=recent.map(x=>x.l).sort((a,b)=>a-b).slice(0,5);
  const support=mean(lows),resistance=mean(highs);
  const age=Date.now()-c.at(-1)!.t;
  const maxAge=interval==="1d"?172800000:interval==="4h"?28800000:interval==="1h"?7200000:3600000;
  const fresh=age<=maxAge;
  let score=0,agreement=0; const reasons:string[]=[],plain:string[]=[];
  const add=(dir:number,weight:number,reason:string,plainText:string)=>{
    score+=dir*weight;if(dir!==0)agreement++;if(reason)reasons.push(reason);if(plainText)plain.push(plainText);
  };
  if(last>e50){add(1,2,"Price is above EMA 50.","Price is above its recent average, so the trend leans upward.");}
  else {add(-1,2,"Price is below EMA 50.","Price is below its recent average, so the trend leans downward.");}
  if(e12>e26){add(1,2,"EMA 12 is above EMA 26.","Short-term direction is stronger than the medium-term direction.");}
  else {add(-1,2,"EMA 12 is below EMA 26.","Short-term direction is weaker than the medium-term direction.");}
  if(macd>0 && macd>=prevMacd){add(1,1.5,"MACD is positive and rising.","Momentum is improving in the upward direction.");}
  else if(macd<0 && macd<=prevMacd){add(-1,1.5,"MACD is negative and falling.","Momentum is worsening in the downward direction.");}
  else {reasons.push("MACD is mixed.");plain.push("Momentum is not clearly aligned.");}
  if(rr>=52&&rr<=70){add(1,1,"RSI supports bullish momentum without being extremely stretched.","Momentum is positive without looking extremely stretched.");}
  else if(rr<=48&&rr>=30){add(-1,1,"RSI supports bearish momentum without being extremely stretched.","Momentum is negative without looking extremely stretched.");}
  else if(rr>70||rr<30){reasons.push("RSI is stretched.");plain.push("Momentum is stretched, so the system becomes more cautious.");}
  if(momentum>0.002){add(1,1,"Recent price momentum is positive.","Price has risen over the recent candles.");}
  else if(momentum<-0.002){add(-1,1,"Recent price momentum is negative.","Price has fallen over the recent candles.");}
  if(volumeRatio>1.15){reasons.push("Trading activity is above its recent baseline.");plain.push("More activity is supporting the current move.");}
  else {reasons.push("Trading activity is near its recent baseline.");}
  const regime=volatility>0.012?"HIGH VOLATILITY":Math.abs(momentum)<0.0015?"RANGE":"TREND";
  const riskPenalty=regime==="HIGH VOLATILITY"?2:0;
  const aligned=Math.abs(score)>=5 && agreement>=3 && fresh;
  let signal:"STRONG BUY"|"BUY"|"WAIT"|"SELL"|"STRONG SELL"|"NO TRADE"="NO TRADE";
  if(aligned){
    if(score>=7)signal="STRONG BUY"; else if(score>=5)signal="BUY"; else if(score<=-7)signal="STRONG SELL"; else if(score<=-5)signal="SELL";
    else signal="WAIT";
  } else if(fresh && Math.abs(score)>=3 && agreement>=3) signal=score>0?"BUY":"SELL";
  else if(fresh) signal="WAIT";
  if(!fresh){signal="NO TRADE";plain.unshift("The newest candle is too old for this timeframe, so I refuse to force a trade.");}
  if(regime==="HIGH VOLATILITY"){plain.push("The market is moving fast, so confidence is reduced.");}
  if(Math.abs(score)<5||agreement<3) plain.push("The checks are not aligned strongly enough to call this a high-conviction setup.");
  const confidence=signal==="NO TRADE"?0:Math.max(0,Math.min(99,50+Math.abs(score)*5+agreement*4-riskPenalty*7-(regime==="RANGE"?5:0)));
  const risk=Math.max(aa,last*0.003);
  const stop=score>=0?last-risk*1.5:last+risk*1.5;
  return {
    signal,confidence:Math.round(confidence),score:clean(score),agreement,maxAgreement:6,
    trend:last>e50&&e50>=e200?"UP":last<e50&&e50<=e200?"DOWN":"MIXED",regime,reasons:reasons.slice(0,8),
    plainEnglish:plain.slice(0,8),freshness:fresh?"FRESH":"STALE",price:last,
    levels:{support:clean(support),resistance:clean(resistance),stop:clean(stop),
      target1:clean(score>=0?last+risk*1.5:last-risk*1.5),target2:clean(score>=0?last+risk*2.5:last-risk*2.5)},
    indicators:{ema12:clean(e12),ema26:clean(e26),ema50:clean(e50),ema200:clean(e200),rsi:clean(rr),atr:clean(aa),macd:clean(macd),momentum:clean(momentum),volumeRatio:clean(volumeRatio),volatility:clean(volatility)}
  };
}
