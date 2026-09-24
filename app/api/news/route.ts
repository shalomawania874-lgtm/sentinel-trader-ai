import { NextRequest, NextResponse } from "next/server";
const strip=(s:string)=>s.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').trim();
const tag=(b:string,t:string)=>{const a=b.indexOf("<"+t+">"),z=b.indexOf("</"+t+">");return a<0||z<0?"":strip(b.slice(a+t.length+2,z))};
export async function GET(req:NextRequest){
  const q=req.nextUrl.searchParams.get("q")||"markets";
  try{
    const u="https://news.google.com/rss/search?q="+encodeURIComponent(q+" markets trading")+"&hl=en-US&gl=US&ceid=US:en";
    const r=await fetch(u,{cache:"no-store"}); if(!r.ok)throw new Error("News unavailable");
    const x=await r.text();
    const items=x.split("<item>").slice(1,11).map(b=>({title:tag(b,"title"),link:tag(b,"link"),pub:tag(b,"pubDate")})).filter(x=>x.title);
    return NextResponse.json({items});
  }catch(e:any){return NextResponse.json({items:[],error:e?.message||"News unavailable"},{status:503})}
}