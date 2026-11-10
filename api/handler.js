import { neon } from '@neondatabase/serverless';
import { handleApi } from '../lib/app.js';

const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DB = connection ? neon(connection) : null;
const upstream = process.env.ORDERS_BACKEND_URL;
const allowedRoutes = new Set(['menu','orders','admin/tables','admin/orders','admin/status']);

export default {
  async fetch(request) {
    if (DB || !upstream) return handleApi(request, { DB, ADMIN_KEY: process.env.ADMIN_KEY });

    const incoming = new URL(request.url);
    const route = incoming.pathname === '/api/handler'
      ? incoming.searchParams.get('route')
      : incoming.pathname.slice('/api/'.length);
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
};
