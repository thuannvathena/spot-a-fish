import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':430,'height':880})
        await pg.add_init_script("localStorage.setItem('findfish_v1', JSON.stringify({tut:true,unlocked:15,g1:1,gRot:1,gZoom:1,gTilt:1,iBackup:1,iHint:1,iClear:1,iSquid:1,iClam:1,iSwarm:1}))")
        await pg.goto('file://'+__import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','index.html'))); await pg.wait_for_timeout(3000)
        for L in range(1,16):
            await pg.evaluate(f'__ff.newLevel({L})'); await pg.wait_for_timeout(900)
            r=await pg.evaluate("""(()=>{const G=__ff.G,c=G.cfg; const fish=G.things.filter(o=>o.kind==='fish'); const obs=G.things.filter(o=>o.kind!=='fish'); const types=new Set(fish.map(o=>o.type));
              const cnt={}; obs.forEach(o=>{const k=o.kind==='obstacle'?o.id:o.kind; cnt[k]=(cnt[k]||0)+1});
              return {goal:c.goal,per:c.per,fish:fish.length,species:types.size,waves:(G.waves||[]).length,wavefish:(G.waves||[]).reduce((n,w)=>n+w.specs.length,0),obs:cnt,tube:c.tube,swarm:!!c.swarm,bounty:c.bounty||null}})()""")
            print(L,json.dumps(r))
        await b.close()
asyncio.run(main())
