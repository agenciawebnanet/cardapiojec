import { neon } from '@neondatabase/serverless';
import { handleApi } from '../lib/app.js';

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DB = connection ? neon(connection) : null;
const upstream = process.env.ORDERS_BACKEND_URL;
const allowedRoutes = new Set(['menu','orders','admin/tables','admin/orders','admin/status']);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const route = incoming.pathname === '/api/handler'
      ? incoming.searchParams.get('route')
      : incoming.pathname.slice('/api/'.length);
    const session = request.headers.get('X-JC-Session') === '1';
    const cookie = '__Host-jc-admin';
    const cookieOptions = 'Path=/; Secure; HttpOnly; SameSite=Strict';
    if (route === 'admin/logout' && request.method === 'POST' && session) {
      return Response.json({ok:true}, {headers:{'Set-Cookie':cookie+'=; Max-Age=0; '+cookieOptions,'Cache-Control':'no-store'}});
    }
    if (route?.startsWith('admin/') && session) {
      const headers = new Headers(request.headers);
      const saved = (headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-jc-admin=([A-Za-z0-9_-]+)/)?.[1];
      const supplied = headers.get('X-JC-Key');
      if (!supplied && saved) headers.set('X-JC-Key', saved);
      const response = await dispatch(new Request(request,{headers}), incoming, route);
      if (response.ok && route === 'admin/tables' && request.method === 'GET' && /^[A-Za-z0-9_-]+$/.test(supplied || '')) {
        const result = new Response(response.body, response);
        result.headers.set('Set-Cookie', cookie+'='+supplied+'; Max-Age=31536000; '+cookieOptions);
        return result;
      }
      return response;
    }
    return dispatch(request, incoming, route);
  }
};

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
