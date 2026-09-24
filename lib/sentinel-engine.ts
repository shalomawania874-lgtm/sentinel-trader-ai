export type Candle = { t:number;o:number;h:number;l:number;c:number;v:number };

const finite=(n:number)=>Number.isFinite(n)?n:0;
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const std=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))||0};
const clean=(n:number)=>Number.isFinite(n)?Number(n.toFixed(6)):0;

export type Decision={
 signal:"STRONG BUY"|"BUY"|"WAIT"|"SELL"|"STRONG SELL"|"NO TRADE";
 confidence:number;score:number;agreement:number;maxAgreement:number;
 trend:"UP"|"DOWN"|"MIXED";regime:"TREND"|"RANGE"|"HIGH VOLATILITY";
 reasons:string[];plainEnglish:string[];freshness:"FRESH"|"STALE";price:number;
 levels:{support:number;resistance:number;stop:number;target1:number;target2:number};
 indicators:{ema12:number;ema26:number;ema50:number;ema200:number;rsi:number;atr:number;macd:number;momentum:number;volumeRatio:number;volatility:number;knnEdge:number;knnAgreement:number};
};

function ema(a:number[],p:number){if(a.length<p)return mean(a);let e=mean(a.slice(0,p)),k=2/(p+1);for(let i=p;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a:number[],p=14){if(a.length<p+1)return 50;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}return l===0?100:100-100/(1+g/l)}
function atr(c:Candle[],p=14){if(c.length<p+1)return 0;const tr=c.slice(1).map((x,i)=>Math.max(x.h-x.l,Math.abs(x.h-c[i].c),Math.abs(x.l-c[i].c)));return mean(tr.slice(-p))}
function feature(c:Candle[],i:number){const s=c.slice(0,i+1),cl=s.map(x=>x.c),last=cl.at(-1)!;const e12=ema(cl,12),e26=ema(cl,26),e50=ema(cl,50);const a=atr(s,14)||last*.001;const r=rsi(cl);const ret=(n:number)=>cl.length>n?(last/cl.at(-1-n)!-1):0;const vr=mean(s.slice(-10).map(x=>x.v))/(mean(s.slice(-50,-10).map(x=>x.v))||1);const vol=std(s.slice(-24).map(x=>(x.h-x.l)/Math.max(x.c,1)));return [ret(1),ret(3),ret(6),ret(12),ret(24), (last-e12)/a,(e12-e26)/a,(last-e50)/a,(r-50)/20,Math.log(Math.max(vr,.01)),a/Math.max(last,1),vol]}

function distance(a:number[],b:number[]){let s=0;for(let i=0;i<a.length;i++){const z=(a[i]-b[i])/(Math.abs(a[i])+Math.abs(b[i])+1e-6);s+=z*z}return Math.sqrt(s)}

function knn(c:Candle[],currentIndex:number){
 const cur=feature(c,currentIndex), rows:{d:number;r:number}[]=[];
 const start=Math.max(30,currentIndex-1500), end=currentIndex-2;
 for(let j=start;j<=end;j++){
   const next=c[j+1].c/c[j].c-1;
   rows.push({d:distance(cur,feature(c,j)),r:next});
 }
 rows.sort((a,b)=>a.d-b.d);
 const k=Math.min(40,rows.length), top=rows.slice(0,k);
 const w=top.map(x=>1/(x.d+.02)); const sw=w.reduce((a,b)=>a+b,0)||1;
 const edge=top.reduce((s,x,i)=>s+x.r*w[i],0)/sw;
 const agreement=top.filter(x=>Math.sign(x.r)===Math.sign(edge)&&Math.abs(x.r)>0.0001).length/Math.max(1,k);
 return {edge,agreement,k};
}

export function decide(raw:Candle[],interval="1h"):Decision{
 const c=raw.filter(x=>[x.o,x.h,x.l,x.c,x.v].every(Number.isFinite));
 if(c.length<220)throw new Error("Not enough verified market data.");
 const cl=c.map(x=>x.c),last=cl.at(-1)!;
 const e12=ema(cl,12),e26=ema(cl,26),e50=ema(cl,50),e200=ema(cl,200),rr=rsi(cl),aa=atr(c,14);
 const prevMacd=ema(cl.slice(0,-1),12)-ema(cl.slice(0,-1),26),macd=e12-e26;
 const momentum=cl.length>7?(last/cl.at(-8)!-1):0;
 const volNow=mean(c.slice(-10).map(x=>x.v)),volBase=mean(c.slice(-50,-10).map(x=>x.v))||1,volumeRatio=volNow/volBase;
 const volatility=std(c.slice(-24).map(x=>(x.h-x.l)/Math.max(x.c,1)));
 const kn=knn(c,c.length-1);
 const age=Date.now()-c.at(-1)!.t;
 const maxAge=interval==="1d"?172800000:interval==="4h"?28800000:interval==="1h"?7200000:interval==="15m"?1800000:interval==="5m"?600000:900000;
 const fresh=age<=maxAge;
 const trend=last>e50&&e50>=e200?"UP":last<e50&&e50<=e200?"DOWN":"MIXED";
 const regime=volatility>.012?"HIGH VOLATILITY":Math.abs(momentum)<.0015?"RANGE":"TREND";
 let score=0,agreement=0;const reasons:string[]=[],plain:string[]=[];
 const add=(dir:number,w:number,r:string,p:string)=>{score+=dir*w;if(dir){agreement++;reasons.push(r);plain.push(p)}};
 add(last>e50?1:-1,2,last>e50?"Price is above EMA 50.":"Price is below EMA 50.",last>e50?"Price is above its medium-term average, so buyers have the edge.":"Price is below its medium-term average, so sellers have the edge.");
 add(e12>e26?1:-1,2,e12>e26?"EMA 12 is above EMA 26.":"EMA 12 is below EMA 26.",e12>e26?"Short-term trend is above the medium-term trend.":"Short-term trend is below the medium-term trend.");
 add(macd>=prevMacd?1:-1,1.5,macd>=prevMacd?"MACD is rising.":"MACD is falling.",macd>=prevMacd?"Momentum is improving upward.":"Momentum is weakening downward.");
 add(rr>=52&&rr<=70?1:rr<=48&&rr>=30?-1:0,1.2,rr>=52&&rr<=70?"RSI supports upside without being extreme.":rr<=48&&rr>=30?"RSI supports downside without being extreme.":"RSI is not giving a clean directional edge.","");
 add(momentum>.0015?1:momentum<-.0015?-1:0,1.2,momentum>.0015?"Recent momentum is positive.":momentum<-.0015?"Recent momentum is negative.":"Recent momentum is mixed.",momentum>.0015?"Price has been rising recently.":momentum<-.0015?"Price has been falling recently.":"Recent price movement is mixed.");
 add(kn.edge>.00015?1:kn.edge<-.00015?-1:0,3,kn.edge>.00015?"Historical analogs lean upward.":kn.edge<-.00015?"Historical analogs lean downward.":"Historical analogs are mixed.",kn.edge>.00015?"Similar past market conditions leaned upward.":kn.edge<-.00015?"Similar past market conditions leaned downward.":"Similar past market conditions did not show a clear edge.");
 if(volumeRatio>1.15){reasons.push("Trading activity is above its recent baseline.");plain.push("More activity is backing the current move.");}
 if(regime==="HIGH VOLATILITY"){reasons.push("Volatility is high.");plain.push("The market is moving fast, so the system becomes more selective.");}
 if(!fresh){return {signal:"NO TRADE",confidence:0,score:clean(score),agreement,maxAgreement:6,trend,regime,reasons:["The newest candle is too old for this timeframe."],plainEnglish:["The data is stale, so I refuse to force a trade."],freshness:"STALE",price:last,levels:{support:clean(Math.min(...c.slice(-20).map(x=>x.l))),resistance:clean(Math.max(...c.slice(-20).map(x=>x.h))),stop:clean(last-aa*1.5),target1:clean(last+aa*1.5),target2:clean(last+aa*2.5)},indicators:{ema12:clean(e12),ema26:clean(e26),ema50:clean(e50),ema200:clean(e200),rsi:clean(rr),atr:clean(aa),macd:clean(macd),momentum:clean(momentum),volumeRatio:clean(volumeRatio),volatility:clean(volatility),knnEdge:clean(kn.edge),knnAgreement:clean(kn.agreement)}}}
 const strong=Math.abs(score)>=7&&agreement>=4&&kn.agreement>=.55&&Math.abs(kn.edge)>.00015&&regime!=="RANGE";
 const normal=Math.abs(score)>=4.5&&agreement>=3&&kn.agreement>=.5;
 let signal:"STRONG BUY"|"BUY"|"WAIT"|"SELL"|"STRONG SELL"|"NO TRADE"="WAIT";
 if(strong)signal=score>0?"STRONG BUY":"STRONG SELL"; else if(normal)signal=score>0?"BUY":"SELL";
 const confidence=signal==="WAIT"?Math.max(0,Math.round(50+Math.abs(score)*4+kn.agreement*10)):Math.min(95,Math.round(55+Math.abs(score)*4+kn.agreement*12-(regime==="HIGH VOLATILITY"?12:0)));
 const support=Math.min(...c.slice(-30).map(x=>x.l)),resistance=Math.max(...c.slice(-30).map(x=>x.h)),risk=aa*1.5;
 const stop=score>=0?last-risk:last+risk;
 return {signal,confidence,score:clean(score),agreement,maxAgreement:6,trend,regime,reasons:reasons.slice(0,8),plainEnglish:plain.filter(Boolean).slice(0,8),freshness:"FRESH",price:last,levels:{support:clean(support),resistance:clean(resistance),stop:clean(stop),target1:clean(score>=0?last+risk*1.5:last-risk*1.5),target2:clean(score>=0?last+risk*2.5:last-risk*2.5)},indicators:{ema12:clean(e12),ema26:clean(e26),ema50:clean(e50),ema200:clean(e200),rsi:clean(rr),atr:clean(aa),macd:clean(macd),momentum:clean(momentum),volumeRatio:clean(volumeRatio),volatility:clean(volatility),knnEdge:clean(kn.edge),knnAgreement:clean(kn.agreement)}};
}
