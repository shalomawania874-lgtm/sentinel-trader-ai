import type {Candle} from "./sentinel-engine";

type Model={w:number[];b:number};
type MLResult={probability:number;averageProbability:number;signal:"BULLISH"|"BEARISH"|"NEUTRAL";models:number;totalModels:number;trainSamples:number;calibrated:boolean;regime:string;horizon:number;validationAccuracy:number|null;brierScore:number|null};

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const sigmoid=(x:number)=>1/(1+Math.exp(-clamp(x,-30,30)));
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))||1};
const ema=(a:number[],n:number)=>{const k=2/(n+1);let e=a[0]??0;for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e};
const ret=(a:number[],n:number)=>a.length>n?(a[a.length-1]/a[a.length-1-n]-1):0;

function features(c:Candle[],i:number){
 const closes=c.slice(0,i+1).map(x=>x.c), vols=c.slice(0,i+1).map(x=>x.v);
 const e12=ema(closes.slice(-80),12),e26=ema(closes.slice(-100),26),e50=ema(closes.slice(-140),50);
 const rs=ret(closes,1),r3=ret(closes,3),r8=ret(closes,8),r21=ret(closes,21);
 const vol=mean(vols.slice(-10))/(mean(vols.slice(-60,-10))||1);
 const atr=mean(c.slice(Math.max(1,i-13),i+1).map((x,j,arr)=>j?Math.max(x.h-x.l,Math.abs(x.c-arr[j-1].c),Math.abs(x.l-arr[j-1].c)):x.h-x.l));
 const atrp=atr/(closes.at(-1)||1), trend=(e12-e26)/(closes.at(-1)||1);
 return [rs,r3,r8,r21,(closes.at(-1)!-e12)/(closes.at(-1)||1),(e12-e26)/(closes.at(-1)||1),(e26-e50)/(closes.at(-1)||1),vol-1,atrp,trend];
}
function train(X:number[][],y:number[],epochs=70,lr=.08):Model{
 const d=X[0]?.length||10,w=Array(d).fill(0),b=0;
 for(let ep=0;ep<epochs;ep++){const g=Array(d).fill(0);let gb=0;
  for(let i=0;i<X.length;i++){const p=sigmoid(w.reduce((s,v,j)=>s+v*X[i][j],b));const e=p-y[i];for(let j=0;j<d;j++)g[j]+=e*X[i][j];gb+=e}
  const reg=.002;for(let j=0;j<d;j++)w[j]-=lr*(g[j]/X.length+reg*w[j]);b-=lr*gb/X.length;
 }
 return {w,b};
}
function predict(m:Model,x:number[]){return sigmoid(m.b+m.w.reduce((s,w,j)=>s+w*x[j],0))}
function regime(c:Candle[]):string{
 const x=c.slice(-80).map(z=>z.c), v=sd(x.map((z,j)=>j?z/x[j-1]-1:0));
 const e20=ema(x,20),e50=ema(x,50);
 if(v>.018)return "HIGH_VOLATILITY"; if(Math.abs(e20-e50)/(x.at(-1)||1)<.004)return "RANGE"; return e20>e50?"TREND_UP":"TREND_DOWN";
}
function calibrate(raw:number[],ys:number[]){
 if(raw.length<30)return {a:1,b:0,ok:false};
 let a=1,b=0;for(let k=0;k<120;k++){let ga=0,gb=0;for(let i=0;i<raw.length;i++){const z=a*Math.log(clamp(raw[i],.001,.999)/(1-clamp(raw[i],.001,.999)))+b,p=sigmoid(z),e=p-ys[i];ga+=e*Math.log(clamp(raw[i],.001,.999)/(1-clamp(raw[i],.001,.999)));gb+=e}a-=.03*ga/raw.length;b-=.03*gb/raw.length}
 return {a,b,ok:true};
}
export function trainedEnsemble(c:Candle[],horizon=1):MLResult{
 if(c.length<260)return {probability:.5,averageProbability:.5,signal:"NEUTRAL",models:0,totalModels:0,trainSamples:0,calibrated:false,regime:"UNKNOWN",horizon,validationAccuracy:null,brierScore:null};
 const X:number[][]=[],Y:number[]=[];
 for(let i=80;i<c.length-horizon;i++){X.push(features(c,i));Y.push(c[i+horizon].c>c[i].c?1:0)}
 const split=Math.max(20,Math.floor(X.length*.8)),trainX=X.slice(0,split),trainY=Y.slice(0,split),valX=X.slice(split),valY=Y.slice(split);
 const variants=[[1,1,1,1,1,1,1,1,1,1],[1.4,1,1.1,.8,1.2,1.4,1,.8,.7,1.2],[.8,1.2,1.4,1.1,.9,.8,1.3,1.1,1.2,.8]];
 const models=variants.map(mask=>train(trainX.map(x=>x.map((v,j)=>v*mask[j])),trainY));
 const raws=valX.map((x)=>mean(models.map((m,k)=>predict(m,x.map((v,j)=>v*variants[k][j])))));
 const cal=calibrate(raws,valY);
 const validationAccuracy=raws.length?raws.reduce((s,p,i)=>s+((p>.5?1:0)===(valY[i]||0)?1:0),0)/raws.length:null;
 const brierScore=raws.length?raws.reduce((s,p,i)=>s+(p-(valY[i]||0))**2,0)/raws.length:null;
 const x=features(c,c.length-1);
 const p0=mean(models.map((m,k)=>predict(m,x.map((v,j)=>v*variants[k][j]))));
 const z=cal.a*Math.log(clamp(p0,.001,.999)/(1-clamp(p0,.001,.999)))+cal.b;
 const p=clamp(sigmoid(z),.001,.999), edge=Math.abs(p-.5);
 return {probability:p,averageProbability:p,signal:edge<.045?"NEUTRAL":p>.5?"BULLISH":"BEARISH",models:models.length,totalModels:models.length,trainSamples:trainX.length,calibrated:cal.ok,regime:regime(c),horizon,validationAccuracy,brierScore};
}
