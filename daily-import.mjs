export const stateOf = r => r.status === 'En preparación' ? 'En curso' : r.status || 'Pendiente';
export function dayOf(r){
 const s=String(r.date||''); let m=s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
 if(m)return `${m[3].length===2?'20':''}${m[3]}-${m[2]}-${m[1]}`;
 return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}
export function dailyRows(rows,f){return rows.filter(r=>(!f.day||dayOf(r)===f.day)&&['operator','route','plate'].every(k=>!f[k]||(r[k]||'')===f[k]));}
export function counts(rows){return Object.fromEntries(['Pendiente','En curso','Finalizada'].map(s=>[s,rows.filter(r=>stateOf(r)===s).length]));}
export async function fingerprint(file){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}
export function revised(old,incoming,hash,now=new Date().toISOString()){
 const next={...old,...incoming,pdfHash:hash,importedAt:old?.importedAt||now,updatedAt:now,warehouseParsingVersion:1};
 for(const k of ['operator','started','finished','status','automaticEnd','automaticEndReason','manualTimeEdited'])next[k]=old?.[k]??({operator:'',status:'Pendiente',started:null,finished:null}[k]??false);
 next.status=stateOf(next);
 if(!incoming.route&&old?.route)next.route=old.route;
 next.importHistory=[...(old?.importHistory||[]),{at:now,source:incoming.source,hash,previous:old?{weight:old.weight,refs:old.refs,date:old.date,pdfHash:old.pdfHash||null}:null}];
 return next;
}
