import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayOf,dailyRows,counts,revised,fingerprint} from '../daily-import.mjs';
test('fechas del PDF y filtros combinados sin inventar fecha de importación',()=>{
 assert.equal(dayOf({date:'23/10/26'}),'2026-10-23');assert.equal(dayOf({date:'23/10/2026'}),'2026-10-23');assert.equal(dayOf({importedAt:'2026-10-23'}),'');
 const rows=[{date:'23/10/2026',operator:'Ana',plate:'1234',route:'Norte',status:'En preparación'},{date:'23/10/2026',operator:'Ana',plate:'5678',status:'Finalizada'},{date:'22/10/2026',operator:'Ana'}];
 assert.equal(dailyRows(rows,{day:'2026-10-23',operator:'Ana',plate:'1234',route:'Norte'}).length,1);
 assert.deepEqual(counts(dailyRows(rows,{day:'2026-10-23'})),{'Pendiente':0,'En curso':1,'Finalizada':1});
});
test('corrección preserva preparación y metadatos, sin mutar registro previo',()=>{
 const old={id:'LP26-10000',operator:'Ana',status:'Finalizada',started:'a',finished:'b',manualTimeEdited:true,automaticEnd:true,automaticEndReason:'siguiente carga',weight:50,importedAt:'primera',notes:'nota'};
 const next=revised(old,{id:old.id,weight:100,source:'corregido.pdf'},'hash','ahora');
 for(const key of ['operator','status','started','finished','manualTimeEdited','automaticEnd','automaticEndReason','importedAt','notes'])assert.equal(next[key],old[key]);
 assert.equal(next.weight,100);assert.equal(old.weight,50);assert.equal(next.importHistory[0].previous.weight,50);
});
test('huella detecta PDF idéntico con otro nombre',async()=>{
 assert.equal(await fingerprint(new Blob(['pdf'])),await fingerprint(new Blob(['pdf'])));
 assert.notEqual(await fingerprint(new Blob(['pdf'])),await fingerprint(new Blob(['pdf corregido'])));
});
