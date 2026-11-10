import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { handleApi, tableToken } from '../lib/app.js';

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DB = connection ? neon(connection) : null;
const upstream = process.env.ORDERS_BACKEND_URL;
const allowedRoutes = new Set(['menu','orders','admin/tables','admin/orders','admin/status']);

const cookieName='__Host-jc-admin';
const cookieOptions='Path=/; Secure; HttpOnly; SameSite=Strict';
const sessionSeconds=31536000;
const sessionSecret=process.env.PANEL_SESSION_SECRET;
const credentials=JSON.parse(process.env.PANEL_CREDENTIALS||'null');
const ordersKey=DB?process.env.ADMIN_KEY:process.env.ORDERS_ADMIN_KEY;

function panelReply(body,status=200,cookie) {
  const headers={'Cache-Control':'no-store'};
  if(cookie)headers['Set-Cookie']=cookie;
  return Response.json(body,{status,headers});
}
function equalSecret(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  const digest=value=>createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a),digest(b));
}
function signature(expiry) {
  return createHmac('sha256',sessionSecret).update(JSON.stringify([credentials.username,credentials.password,expiry])).digest('hex');
}
function validPanelSession(request) {
  const saved=request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-jc-admin=(\d{10})\.([0-9a-f]{64})(?:;|$)/);
  return Boolean(saved&&Number(saved[1])>Date.now()/1000&&equalSecret(saved[2],signature(saved[1])));
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const route = incoming.pathname === '/api/handler'
      ? incoming.searchParams.get('route')
      : incoming.pathname.slice('/api/'.length);
    if (route === 'waiter-order') return submitWaiterOrder(request, incoming);
    if (route?.startsWith('admin/')) {
      if (request.headers.get('X-JC-Session')!=='1') return panelReply({error:'Entre no painel.'},401);
      if (route==='admin/logout' && request.method==='POST') {
        return panelReply({ok:true},200,cookieName+'=; Max-Age=0; '+cookieOptions);
      }
      if(!credentials||!sessionSecret||!ordersKey)return panelReply({error:'Painel indisponível no momento.'},503);
      if (route==='admin/login') {
        if(request.method!=='POST')return panelReply({error:'Método indisponível.'},405);
        const login=await request.json().catch(()=>null);
        const userOk=equalSecret(login?.username,credentials.username);
        const passwordOk=equalSecret(login?.password,credentials.password);
        if(!userOk||!passwordOk)return panelReply({error:'Usuário ou senha inválidos.'},401);
        const expiry=String(Math.floor(Date.now()/1000)+sessionSeconds);
        return panelReply({ok:true},200,cookieName+'='+expiry+'.'+signature(expiry)+'; Max-Age='+sessionSeconds+'; '+cookieOptions);
      }
      if(!validPanelSession(request))return panelReply({error:'Entre no painel.'},401);
      const headers=new Headers(request.headers);
      headers.set('X-JC-Key',ordersKey);
      return dispatch(new Request(request,{headers}),incoming,route);
    }
    return dispatch(request, incoming, route);
  }
};

async function submitWaiterOrder(request, incoming) {
  const reply=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
  if (request.method!=='POST') return reply('Método indisponível.',405);
  if (request.headers.get('Content-Type')?.split(';')[0]!=='application/json') return reply('Formato inválido.',415);
  const raw=await request.text();
  if(raw.length>24000) return reply('Pedido muito grande.',413);
  let body;
  try { body=JSON.parse(raw); } catch { return reply('Pedido inválido.',400); }
  if(typeof body?.table!=='string'||!/^(0[1-9]|10)$/.test(body.table)) return reply('Escolha uma mesa de 01 a 10.',400);

  const signingKey=process.env.ADMIN_KEY;
  const token=DB&&signingKey
    ? await tableToken(signingKey,body.table)
    : process.env.WAITER_TABLE_TOKENS?.split(',')[Number(body.table)-1];
  if(!token) return reply('O envio à cozinha está indisponível no momento.',503);

  const target=new URL('/api/orders',incoming);
  const order={id:body.id,table:body.table,token,name:body.name||'Garçom',notes:body.notes,items:body.items};
  return dispatch(new Request(target,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(order)}),target,'orders');
}

async function dispatch(request, incoming, route) {
    if (DB || !upstream) return handleApi(request, { DB, ADMIN_KEY: process.env.ADMIN_KEY });
    if (!allowedRoutes.has(route)) return new Response('Rota indisponível.', { status: 404 });
    const target = new URL('/api/'+route, upstream);
    for (const field of ['table','k']) {
      if (incoming.searchParams.has(field)) target.searchParams.set(field,incoming.searchParams.get(field));
    }
    const headers = new Headers();
    for (const name of ['Content-Type','X-JC-Key']) {
      const value = request.headers.get(name);
      if (value) headers.set(name,value);
    }
    try {
      const response = await fetch(target, {
        method:request.method, headers, redirect:'error',
        body:request.method==='POST' ? await request.text() : undefined
      });
      return new Response(response.body, {status:response.status,headers:{
        'Content-Type':response.headers.get('Content-Type')||'application/json',
        'Cache-Control':'no-store'
      }});
    } catch {
      return Response.json({error:'Falha temporária. Tente novamente.'},{status:502});
    }
}
