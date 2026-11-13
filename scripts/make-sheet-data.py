"""Builds the rows of the new "Level System" tab for the design sheet from game/src/levels.json and the win rates of the bot (game/tools/wr-sim.mjs --json <file>).
Usage: python3 scripts/make-sheet-data.py <wr.json> <out.json>   (out.json holds the rows and an HTML table that can be pasted into Google Sheets)"""
import json, sys, html
L=json.load(open('game/src/levels.json')); wr={r['L']:r for r in json.load(open(sys.argv[1]))}
EV={3:'waltz',6:'swirl',9:'drop (pearl)',12:'squabble',15:'feed (food bucket)',18:'hide',21:'startle (falling rock)'}
SHAPE=['cylinder','bowl','rounded box','hexagon','flower','heart']; shape=lambda i:SHAPE[(i-1)//10%6]
seen=set(); newf={}
for i,l in enumerate(L,1):
    ks=[k.replace('fish_','').replace('_',' ') for k in l['fishKeys']]; newf[i]=[k for k in ks if k not in seen]; seen|=set(ks)
f2=next(i for i,l in enumerate(L,1) if max(l['tanks'])==2); f3=next(i for i,l in enumerate(L,1) if max(l['tanks'])==3)
fu=next(i for i,l in enumerate(L,1) if l['urchin']>0); fj=next(i for i,l in enumerate(L,1) if l['jelly']>0)
def notes(i,l):
    n=[]
    if i==1: n.append('Tutorial: camera guide (rotate, zoom, tilt) and "Tap a fish". Only target fish, no wrong fish')
    if i==2: n.append('Only target fish, no wrong fish')
    if i==3: n.append('Backup Slot intro (7 slots) + first wrong fish (3). Cannot lose yet')
    if i==4: n.append('Booster 1: Hint. 5 wrong fish (still cannot fill the Backup)')
    if i==5: n.append('7 wrong fish: the Backup can fill, first level that can be lost')
    if i==7: n.append('Booster 2: Tank Clear')
    if i==9: n.append('Booster 3: Backup Clear')
    if i==11: n.append('Feature 1: Squid')
    if i==16: n.append('Pump: fish come in through the pipe (waves)')
    if i==21: n.append('Feature 2: Shell (clam)')
    if i==31: n.append('Feature 3: Fish Swarm')
    if i in EV: n.append('Event unlocked: '+EV[i])
    if i==1: n.append('Tank shape: cylinder')
    elif i in (11,21,31,41,51): n.append('Tank shape: '+shape(i)+' + new theme')
    if i==f2: n.append('Fish per tank: 2 appears')
    if i==f3: n.append('Fish per tank: 3 appears')
    if i==fu: n.append('First sea urchin')
    if i==fj: n.append('First jellyfish')
    if i==1: n.append('Colour noise: none in levels 1-10 (wrong fish look different from the targets)')
    if i==11: n.append('Colour noise starts: 1 colour copy of a target')
    if i in (21,31,46): n.append('Colour copies: %d'%l['look'])
    if i in (25,35,45,55,60): n.append('Bounty tank: '+', '.join(l['bounty']))
    if l['tube']['enabled'] and i%5==0: n.append('CHOKE POINT: the last pump wave comes when one tank is left and holds back the last %d target fish, so the finish is a crowded hunt'%l['tube']['waves'][-1]['holdFish'])
    elif i in (5,10,15): n.append('Hard level: the last tanks are searched among mostly wrong fish')
    nf=[k+(' (decoy only)' if k in ('sea horse','shark','whale') else '') for k in newf[i]]
    if nf: n.append('New fish: '+', '.join(nf))
    return n
BG={'Easy':'#93c47d','Medium':'#f6b26b','Hard':'#e06666','Very Hard':'#ff0000'}
hdr=["Difficulty","Level","Status","Feature/Note","Winrate (est)","est. Playtime (s)","Total Target Fish","Total Target Type","Total Type","Total Tanks","Start Fish","Pump","urchin","jelly","Squid","Shell","Fish Swarm","est time per tap (s)","Total Fish (with pump)","Decoy Fish","Colour copies","Pump waves","Bounty","Tank shape","Theme #","New fish"]
rows=[]
for i,l in enumerate(L,1):
    t=l['tanks']; n=len(t); pump=l['tube']['extraFish'] if l['tube']['enabled'] else 0; waves=len(l['tube']['waves']) if l['tube']['enabled'] else 0
    rows.append([l['difficulty'],i,'W.I.P','\n'.join('• '+x for x in notes(i,l)),f"{wr[i]['sim']:.0f}%",sum(t)*5,sum(t),n,len(l['fishKeys'])+l['look'],n,l['startFish'],pump or '',l['urchin'] or '',l['jelly'] or '',l['squid'] or '',l['clam'] or '',1 if l['swarm'] else '',5 if i==1 else '',l['maxFish'],l['decoyFish'],l['look'] or '',waves or '',', '.join(l['bounty']),shape(i),l['theme']+1,', '.join(k+(' (decoy only)' if k in ('sea horse','shark','whale') else '') for k in newf[i])])
fix={11:lambda i:i<16,14:lambda i:i<11,15:lambda i:i<21,16:lambda i:i<31}   # Pump, Squid, Shell, Fish Swarm: black while the feature does not exist yet
def td(v,bg='#ffffff',fg=None,bold=False,center=True):
    st=['background-color:'+bg]
    if fg: st.append('color:'+fg)
    if bold: st.append('font-weight:bold')
    st.append('text-align:'+('center' if center else 'left'))
    return '<td style="%s">%s</td>'%(';'.join(st), html.escape(str(v)).replace('\n','<br>'))
H=['<table>']
for i,r in enumerate(rows,1):
    H.append('<tr>')
    for c,v in enumerate(r):
        bg='#ffffff'; fg=None; bold=False
        if c==0: bg=BG[v]; bold=True; fg='#ffffff' if v=='Very Hard' else '#000000'
        if c in fix and fix[c](i): bg='#000000'; v=''
        H.append(td(v,bg,fg,bold,c not in (3,25)))
    H.append('</tr>')
H.append('</table>')
HH='<table><tr>'+''.join(td(h,'#d9ead3',None,True,True) for h in hdr[18:])+'</tr></table>'
json.dump({'rows':rows,'html':''.join(H),'hdrhtml':HH,'hdr':hdr},open(sys.argv[2],'w'))
print(len(rows),'rows;',len(''.join(H)),'bytes of html')
for i in (5,20,60): print(i,'|',rows[i-1][3].replace('\n',' / '))
