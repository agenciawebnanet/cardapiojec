import { addons, groups } from './menu.js';

const products = new Map(groups.flatMap(group => group.items.map(item => [item.id,item])));
const extrasById = new Map(addons.map(extra => [extra[0],extra]));
const encoder = new TextEncoder();
const states = {novo:['preparo','cancelado'],preparo:['entregue','cancelado'],entregue:['fechado']};

function equal(a,b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i=0;i<a.length;i++) mismatch |= a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch === 0;
}

async function tableToken(key,number) {
  const hmac = await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',hmac,encoder.encode('jc-table:'+number)));
  return Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function json(data,status=200) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

function normalizeLines(input) {
  if (!Array.isArray(input) || !input.length || input.length>50) return null;
  const lines = [];
  for (const row of input) {
    const item = products.get(row?.id);
    if (!item || !Number.isInteger(row.qty) || row.qty<1 || row.qty>30 || !Array.isArray(row.extras)) return null;
    const ids = [...new Set(row.extras)];
    if (ids.length>8 || (!item.extras && ids.length) || ids.some(id=>!extrasById.has(id))) return null;
    const extras = ids.sort().map(id=>extrasById.get(id));
    const unit = item.price+extras.reduce((sum,extra)=>sum+extra[2],0);
    lines.push({name:item.name,qty:row.qty,extras:extras.map(extra=>extra[1]),unit});
  }
  return lines;
}

async function api(req,env,url) {
  if (url.pathname==='/api/menu' && req.method==='GET') {
    const table = url.searchParams.get('table');
    const valid = !table || Boolean(env.ADMIN_KEY && /^(0[1-9]|10)$/.test(table) && equal(url.searchParams.get('k'),await tableToken(env.ADMIN_KEY,table)));
    return json({groups,addons,valid});
  }
  if (!env.DB || !env.ADMIN_KEY) return json({error:'Sistema de mesas indisponível.'},503);
  if (url.pathname==='/api/orders' && req.method==='POST') {
    if (!req.headers.get('content-type')?.startsWith('application/json')) return json({error:'Formato inválido.'},415);
    const raw = await req.text();
    if (raw.length>24000) return json({error:'Pedido muito grande.'},413);
    let body;
    try { body=JSON.parse(raw); } catch { return json({error:'Pedido inválido.'},400); }
    const table=body?.table;
    if (typeof table!=='string' || !/^(0[1-9]|10)$/.test(table) || !equal(body.token,await tableToken(env.ADMIN_KEY,table))) {
      return json({error:'Link da mesa inválido. Use o link fornecido no local.'},403);
    }
    const name=typeof body.name==='string'?body.name.trim():'';
    const notes=typeof body.notes==='string'?body.notes.trim():'';
    const lines=normalizeLines(body.items);
    if (!name || name.length>70 || notes.length>400 || !lines || typeof body.id!=='string' || !/^[0-9a-f-]{36}$/.test(body.id)) {
      return json({error:'Confira o nome e os itens da comanda.'},400);
    }
    const total=lines.reduce((sum,line)=>sum+line.unit*line.qty,0);
    const encoded=JSON.stringify(lines);
    await env.DB`
      INSERT INTO orders (id, table_number, customer, lines, notes, total, created_at)
      VALUES (${body.id}, ${Number(table)}, ${name}, ${encoded}, ${notes}, ${total}, ${Date.now()})
      ON CONFLICT (id) DO NOTHING
    `;
    const [saved] = await env.DB`
      SELECT table_number, customer, lines, notes, total FROM orders WHERE id = ${body.id}
    `;
    if (saved.table_number!==Number(table) || saved.customer!==name || saved.lines!==encoded || saved.notes!==notes) return json({error:'A comanda já foi registrada com outros dados.'},409);
    return json({number:body.id.slice(0,8).toUpperCase(),total:saved.total});
  }
  if (!url.pathname.startsWith('/api/admin/')) return json({error:'Rota indisponível.'},404);
  if (!equal(req.headers.get('X-JC-Key'),env.ADMIN_KEY)) return json({error:'Chave de acesso inválida.'},401);
  if (url.pathname==='/api/admin/tables' && req.method==='GET') {
    const links=await Promise.all(Array.from({length:10},async (_,i)=>{
      const n=String(i+1).padStart(2,'0');
      return {n,path:'/mesa/'+n+'?k='+await tableToken(env.ADMIN_KEY,n)};
    }));
    return json(links);
  }
  if (url.pathname==='/api/admin/orders' && req.method==='GET') {
    const results = await env.DB`
      SELECT * FROM orders
      WHERE status IN ('novo','preparo','entregue') OR created_at > ${Date.now()-86400000}
      ORDER BY created_at DESC
    `;
    return json(results.map(row=>({...row,created_at:Number(row.created_at),lines:JSON.parse(row.lines)})));
  }
  if (url.pathname==='/api/admin/status' && req.method==='POST') {
    const body=await req.json().catch(()=>null);
    if (!body || !Object.hasOwn(states,body.from) || !states[body.from].includes(body.to) || typeof body.id!=='string') return json({error:'Alteração inválida.'},400);
    const updated = await env.DB`
      UPDATE orders SET status = ${body.to} WHERE id = ${body.id} AND status = ${body.from}
      RETURNING id
    `;
    return updated.length===1?json({ok:true}):json({error:'A comanda já foi atualizada. Recarregue a lista.'},409);
  }
  return json({error:'Rota indisponível.'},404);
}

export async function handleApi(req,env) {
  const url=new URL(req.url);
  if (url.pathname==='/api/handler') {
    const route=url.searchParams.get('route');
    if (route && /^(menu|orders|admin\/(tables|orders|status))$/.test(route)) url.pathname='/api/'+route;
  }
  try {
    return await api(req,env,url);
  } catch (error) {
    console.error('Falha na API de comandas',error.code||error.name);
    return json({error:'Falha temporária. Tente novamente.'},500);
  }
}
