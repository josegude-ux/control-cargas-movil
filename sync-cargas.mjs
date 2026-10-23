// Primera fase de intercambio manual: UNA carga por pulsación.
// Nunca modifica cargas remotas ya guardadas, cargas locales ni PDF originales.
// RLS en Supabase limita las operaciones a administradores activos.
const TABLE = 'cargas_compartidas';

function ensureReady(client) {
  if (!client || typeof client.from !== 'function') throw new Error('Supabase no está disponible.');
}

export async function subirCargaPrueba(client, user, carga) {
  ensureReady(client);
  if (!user?.id) throw new Error('Inicia sesión antes de enviar cargas.');
  const clave = String(carga?.id || '').trim();
  if (!clave || !carga || typeof carga !== 'object' || Array.isArray(carga)) {
    throw new Error('La carga seleccionada no es válida.');
  }
  // Verificar antes de insertar: una carga con esa clave nunca se sobreescribe.
  const { data: previo, error: errorLectura } = await client.from(TABLE)
    .select('id,clave_local').eq('clave_local', clave).limit(1);
  if (errorLectura) throw errorLectura;
  if (previo?.length) return { estado: 'ya_existe', clave };
  const { data, error } = await client.from(TABLE).insert({
    propietario_id: user.id,
    clave_local: clave,
    datos: JSON.parse(JSON.stringify(carga)),
    actualizado_en: new Date().toISOString()
  }).select('id,clave_local').single();
  if (error) throw error;
  if (data?.clave_local !== clave) throw new Error('La confirmación de Supabase no coincide con la carga.');
  return { estado: 'enviada', clave };
}

export async function recibirCargaPrueba(client, idsLocales) {
  ensureReady(client);
  const { data, error } = await client.from(TABLE)
    .select('clave_local,datos,actualizado_en')
    .order('actualizado_en', { ascending: false }).limit(20);
  if (error) throw error;
  if (!Array.isArray(data) || !data.length) return { estado: 'sin_cargas' };
  for (const fila of data) {
    const clave = String(fila?.clave_local || '').trim();
    const carga = fila?.datos;
    if (!clave || !carga || typeof carga !== 'object' || Array.isArray(carga)
      || String(carga.id || '').trim() !== clave) continue;
    if (!idsLocales.has(clave)) return { estado: 'recibida', clave, carga };
  }
  return { estado: 'sin_nuevas' };
}
