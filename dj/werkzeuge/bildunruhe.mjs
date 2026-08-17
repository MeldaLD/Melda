/*
 * Die Kontrolle, die ich haette zuerst machen muessen.
 *
 * Ich habe BLA vorgeworfen, dass sein Fehler "einzeln liegt und von Bild zu
 * Bild wechselt" - also flimmert. Nur: Flimmert das Bild an diesen Stellen
 * nicht ohnehin? Punkte dicht am Rand der Menge haben eine Ausstiegszeit,
 * die auf winzigste Aenderungen springt. Sie liegen naturgemaess einzeln
 * (das ist das Filigran), und sie aendern sich bei jeder Fahrtbewegung.
 *
 * Gemessen wird deshalb dasselbe Mass wie bei BLA, aber *ohne* BLA: einmal
 * bei Tiefe 16,0000 und einmal bei 16,0002. Das ist ein Zoomschritt, wie er
 * zwischen zwei Bildern passiert - viel kleiner als alles, was ein Auge
 * trennt.
 */
const NACHKOMMA=200n,EINS=1n<<NACHKOMMA,TEILER=2**200;
const fkMal=(a,b)=>(a*b)>>NACHKOMMA;
function fk(t){const neg=t.trim().startsWith('-');const[g,b='']=t.trim().replace(/^[-+]/,'').split('.');let w=BigInt(g)*EINS,d=10n;for(const z of b){w+=(BigInt(z)*EINS)/d;d*=10n;}return neg?-w:w;}
const Z={x:'-0.743643887037158704752191506114774',y:'0.131825904205311970493132056385139'};
function bahnBauen(s){const D=new Float32Array(s*4);let zr=0n,zi=0n;const cr=fk(Z.x),ci=fk(Z.y),v=4n*EINS;
for(let i=0;i<s;i++){const r=Number(zr)/TEILER,j=Number(zi)/TEILER;const rG=Math.fround(r),jG=Math.fround(j);
D[i*4]=rG;D[i*4+1]=Math.fround(r-rG);D[i*4+2]=jG;D[i*4+3]=Math.fround(j-jG);
const a=fkMal(zr,zr),b=fkMal(zi,zi);if(a+b>v)return{daten:D,laenge:i+1};zi=2n*fkMal(zr,zi)+ci;zr=a-b+cr;}
return{daten:D,laenge:s};}

function punkt(B,L,vx,vy,deckel){
  let dx=0,dy=0,m=0,n=0;
  while(n<deckel){
    const gx=B[m*4]+B[m*4+1],gy=B[m*4+2]+B[m*4+3];
    const ax=gx*dx-gy*dy,ay=gx*dy+gy*dx,cx=dx*dx-dy*dy,cy=2*dx*dy;
    dx=2*ax+cx+vx;dy=2*ay+cy+vy;m++;n++;
    const nx=B[m*4]+B[m*4+1]+dx,ny=B[m*4+2]+B[m*4+3]+dy,r2=nx*nx+ny*ny;
    if(r2>65536)return n;
    if(r2<dx*dx+dy*dy||m>=L-1){dx=nx;dy=ny;m=0;}
  }
  return -1;
}

const bahn=bahnBauen(12500),B=bahn.daten,L=bahn.laenge;
const BREIT=200,HOCH=112,SEITE=HOCH/BREIT,DREH=0.7,DECKEL=12467;
const farbstelle=(n)=>(n<0?-1:(Math.pow(Math.max(n,1),0.45)*0.5)%1);

function feld(tiefe){
  const spanne=1.6/Math.pow(10,tiefe),sd=Math.sin(DREH),cd=Math.cos(DREH);
  const f=new Int32Array(BREIT*HOCH);
  for(let py=0;py<HOCH;py++)for(let px=0;px<BREIT;px++){
    const bx=((px+0.5)/BREIT)*2-1,by=(((py+0.5)/HOCH)*2-1)*SEITE;
    f[py*BREIT+px]=punkt(B,L,(bx*cd-by*sd)*spanne,(bx*sd+by*cd)*spanne,DECKEL);
  }
  return f;
}

function vergleich(a,b){
  const anders=new Uint8Array(BREIT*HOCH);
  let sichtbar=0;
  for(let i=0;i<BREIT*HOCH;i++){
    const fa=farbstelle(a[i]),fb=farbstelle(b[i]);
    const d=Math.abs(fa-fb);
    if(a[i]!==b[i]&&Math.min(d,1-d)>0.02){sichtbar++;anders[i]=1;}
  }
  let einzeln=0;
  for(let y=0;y<HOCH;y++)for(let x=0;x<BREIT;x++){
    if(!anders[y*BREIT+x])continue;
    let nb=0;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=BREIT||ny>=HOCH)continue;
      if(anders[ny*BREIT+nx])nb++;
    }
    if(nb===0)einzeln++;
  }
  return {sichtbar,einzeln,anders};
}

console.log('Wie unruhig ist das Bild von sich aus? (Tiefe 16, ohne jedes BLA)\n');
console.log('  Tiefenschritt   sichtbar geaendert   davon einzeln');
const grund=feld(16);
const felder=new Map();
for(const d of [0.0002,0.002,0.02]){
  const f=feld(16+d);
  felder.set(d,f);
  const v=vergleich(grund,f);
  console.log(`  ${String(d).padEnd(13)}   ${((v.sichtbar/(BREIT*HOCH))*100).toFixed(1).padStart(17)} %   ${v.sichtbar?((v.einzeln/v.sichtbar)*100).toFixed(0):0} %`);
}

/*
 * Und die zweite Haelfte: Sind es bei zwei aufeinanderfolgenden Schritten
 * dieselben Punkte? Wenn schon die Fahrt allein die unruhigen Punkte jedes
 * Mal neu wuerfelt, ist "BLA wuerfelt sie neu" kein Vorwurf mehr.
 */
const a=vergleich(grund,felder.get(0.0002)).anders;
const b=vergleich(felder.get(0.0002),felder.get(0.002)).anders;
let gem=0,ver=0;
for(let i=0;i<a.length;i++){ if(a[i]||b[i])ver++; if(a[i]&&b[i])gem++; }
console.log(`\n  Ueberschneidung der unruhigen Punkte zwischen zwei Schritten: ${ver?((gem/ver)*100).toFixed(0):0} %`);
