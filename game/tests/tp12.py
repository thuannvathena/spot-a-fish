import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':430,'height':880}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.add_init_script("localStorage.setItem('findfish_v1', JSON.stringify({tut:true,unlocked:15,g1:1,gRot:1,gZoom:1,gTilt:1,iBackup:1,iHint:1,iClear:1,iSquid:1,iClam:1,iSwarm:1}))")
        await pg.goto('file://'+__import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','index.html'))); await pg.wait_for_timeout(3000)
        for L in (7,10,13):
            await pg.evaluate(f'__ff.newLevel({L})'); await pg.wait_for_timeout(3000)
            tot=0; viol=0; nb=await pg.evaluate("__ff.themeBoxes(Math.min(4,Math.floor(({L}-1)/3))).length".replace('{L}',str(L)))
            for i in range(12):
                await pg.wait_for_timeout(700)
                v=await pg.evaluate("""(()=>{let n=0,t=0; const T=Math.min(4,Math.floor(("""+str(L)+"""-1)/3)); const B=__ff.themeBoxes(T);
                  for(const o of __ff.G.things){ if(o.kind!=='fish'||!o.alive||o.tubeP||o.locked) continue; t++; const r=Math.max(.2,(o.rad||.4)*Math.sqrt(o.sz||1)*.75)*.7;
                    for(const b of B){ if(o.pos.x>b.min.x+r&&o.pos.x<b.max.x-r&&o.pos.y>b.min.y+r&&o.pos.y<b.max.y-r&&o.pos.z>b.min.z+r&&o.pos.z<b.max.z-r){n++;break;} } }
                  return [n,t]})()""")
                viol+=v[0]; tot+=v[1]
            print(L,'boxes',nb,'viol',viol,'of',tot)
        print(errs); await b.close()
asyncio.run(main())
