import asyncio
from playwright.async_api import async_playwright
JS="""(()=>{const t=__ff.tube, c=Math.cos(t.phi), s=Math.sin(t.phi);
 const A=[3.45*c,1.8,-3.45*s], B=[2.7*c,1.8,-2.7*s]; const D=[B[0]-A[0],B[1]-A[1],B[2]-A[2]]; const L2=D[0]*D[0]+D[1]*D[1]+D[2]*D[2];
 let worst=1e9, wo=null, cnt=0;
 for(const o of __ff.G.things){ if(o.kind!=='fish'||!o.alive||o.tubeP||o.locked) continue;
  const P=[o.pos.x-A[0],o.pos.y-A[1],o.pos.z-A[2]]; let k=(P[0]*D[0]+P[1]*D[1]+P[2]*D[2])/L2; k=Math.max(0,Math.min(1,k));
  const q=[P[0]-D[0]*k,P[1]-D[1]*k,P[2]-D[2]*k]; const d=Math.hypot(...q);
  const half=(o.parts.hx||.4)*(o.sz||1); const gap=d-.26-half*.6; if(gap<worst){worst=gap;wo={d:+d.toFixed(2),half:+half.toFixed(2),ex:o.exitT,id:o.type}} if(d<.45) cnt++; }
 return {worst:+worst.toFixed(2),wo,cnt,vis:t.g.visible,state:t.state}})()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':430,'height':880}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.add_init_script("localStorage.setItem('findfish_v1', JSON.stringify({tut:true,unlocked:15,g1:1,gRot:1,gZoom:1,gTilt:1,iBackup:1,iHint:1,iClear:1,iSquid:1,iClam:1,iSwarm:1}))")
        await pg.goto('file://'+__import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','index.html'))); await pg.wait_for_timeout(3000)
        await pg.evaluate('__ff.newLevel(7)'); await pg.wait_for_timeout(3000)
        await pg.evaluate("__ff.G.completed=__ff.G.waves[0].t")
        await pg.wait_for_function("__ff.tube.state==='emit'",timeout=60000)
        for i in range(16):
            await pg.wait_for_timeout(350); r=await pg.evaluate(JS); print(r['worst'],r['wo'],r['state'])
        print(errs); await b.close()
asyncio.run(main())
