const $=selector=>document.querySelector(selector);
const root=$('#root'), dialog=$('#dialog'), content=$('#dialog-content'), cartButton=$('#cart');
const table=location.pathname.startsWith('/mesa/')?location.pathname.split('/')[2]:'';
const token=new URLSearchParams(location.search).get('k')||'';
const price=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=value=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const close='<button type="button" class="secondary" data-close aria-label="Fechar">✕</button>';
let menu, selected='', search='', cart=[], draft={}, attempt=null, busy=false;

async function api(path,options={}) {
  const response=await fetch(path,options);
  const data=await response.json();
  if (!response.ok) throw new Error(data.error||'Falha de conexão.');
  return data;
}
function show(title,body) {
  content.innerHTML='<div class="heading"><h2>'+title+'</h2>'+close+'</div>'+body;
  content.querySelector('[data-close]').onclick=()=>dialog.close();
  if (!dialog.open) dialog.showModal();
}
function cartTotal() {return cart.reduce((total,line)=>total+line.unit*line.qty,0);}
function refreshCart() {
  const count=cart.reduce((sum,line)=>sum+line.qty,0);
  cartButton.hidden=!count;
  cartButton.innerHTML='<span>Ver pedido · '+count+' '+(count===1?'item':'itens')+'</span><span>'+price(cartTotal())+'</span>';
}
function drawMenu() {
  const tabs=[['','Todos'],...menu.groups.map(g=>[g.id,g.title])];
  root.querySelector('.filters').innerHTML=tabs.map(([id,title])=>'<button data-group="'+id+'" aria-pressed="'+(id===selected)+'">'+title+'</button>').join('');
  const query=fold(search.trim());
  root.querySelector('#menu-items').innerHTML=menu.groups.filter(g=>!selected||g.id===selected).map(group=>{
    const items=group.items.filter(i=>fold(i.name+' '+(i.description||'')).includes(query));
    if (!items.length) return '';
    return '<section class="section"><header class="section-head"><img src="/img/'+group.id+'.webp" alt="" loading="lazy"><h2>'+group.title+'</h2></header><div class="grid">'+items.map(item=>
      '<article class="row"><span class="item-photo photo-'+item.id+'" aria-hidden="true"></span><div class="item-info"><b>'+escape(item.name)+'</b>'+(item.description?'<p>'+escape(item.description)+'</p>':'')+
      '<strong>'+price(item.price)+'</strong></div><button class="icon" data-item="'+item.id+'" aria-label="Adicionar '+escape(item.name)+'">+</button></article>'
    ).join('')+'</div></section>';
  }).join('')||'<p class="muted">Nenhum item encontrado.</p>';
}
function add(item,extraIds=[]) {
  const key=[item.id,...extraIds].join('|');
  const existing=cart.find(line=>line.key===key);
  if (existing) existing.qty=Math.min(30,existing.qty+1);
  else if (cart.length<50) {
    const extras=extraIds.map(id=>menu.addons.find(extra=>extra[0]===id));
    cart.push({key,id:item.id,name:item.name,qty:1,extraIds,extras:extras.map(e=>e[1]),unit:item.price+extras.reduce((sum,e)=>sum+e[2],0)});
  }
  refreshCart();
}
function choose(item) {
  if (!item.extras) return add(item);
  show(escape(item.name),'<p class="muted">Escolha os adicionais do seu lanche.</p><form id="extras"><div class="choices">'+menu.addons.map(([id,name,cents])=>
    '<label class="choice"><input type="checkbox" name="extra" value="'+id+'"><span>'+name+'</span><strong>+'+price(cents)+'</strong></label>'
  ).join('')+'</div><button class="primary wide" id="add-extra">Adicionar · '+price(item.price)+'</button></form>');
  const form=$('#extras');
  form.onchange=()=>{
    const selected=new FormData(form).getAll('extra');
    $('#add-extra').textContent='Adicionar · '+price(item.price+menu.addons.filter(e=>selected.includes(e[0])).reduce((s,e)=>s+e[2],0));
  };
  form.onsubmit=e=>{e.preventDefault();add(item,new FormData(form).getAll('extra'));dialog.close();};
}
function checkout() {
  const deliveryFields=table?'': '<label>Como vai receber?<select name="mode"><option value="retirada">Retirada no balcão</option><option value="entrega">Entrega</option></select></label>'+
    '<div id="delivery" hidden><label>Rua e número<input name="address" maxlength="160" autocomplete="street-address"></label><label>Bairro<input name="district" maxlength="80"></label><label>Complemento ou referência<input name="reference" maxlength="100"></label><p class="muted">Taxa e disponibilidade confirmadas pelo WhatsApp.</p></div>';
  show(table?'Comanda · Mesa '+escape(table):'Seu pedido',cart.map((line,i)=>
    '<div class="line"><div><b>'+escape(line.name)+'</b><small>'+escape(line.extras.join(', '))+'</small><small>'+price(line.unit*line.qty)+'</small></div>'+
    '<div class="actions"><button class="icon" data-i="'+i+'" data-step="-1" aria-label="Remover uma unidade">−</button><b>'+line.qty+'</b><button class="icon" data-i="'+i+'" data-step="1" aria-label="Adicionar uma unidade">+</button></div></div>'
  ).join('')+'<div class="total"><span>'+(table?'Total':'Subtotal')+'</span><span>'+price(cartTotal())+'</span></div>'+
    '<form id="checkout"><label>'+ (table?'Seu nome na comanda':'Seu nome') +'<input name="name" required maxlength="70" autocomplete="given-name" placeholder="Ex. Pedro"></label>'+deliveryFields+
    '<label>Observações<textarea name="notes" rows="2" maxlength="400" placeholder="Ex. sem cebola"></textarea></label><p id="checkout-error" class="error" role="alert"></p>'+
    '<button class="primary wide">'+(table?'Enviar comanda para o balcão':'Abrir pedido no WhatsApp')+'</button></form>');
  const form=$('#checkout');
  for (const [name,value] of Object.entries(draft)) if(form.elements[name]) form.elements[name].value=value;
  function updateDelivery() {
    if(table) return;
    const deliver=form.elements.mode.value==='entrega';
    $('#delivery').hidden=!deliver;
    form.elements.address.required=deliver;
    form.elements.district.required=deliver;
  }
  updateDelivery();
  form.onchange=updateDelivery;
  for (const button of content.querySelectorAll('[data-step]')) button.onclick=()=>{
    if (busy) return;
    draft=Object.fromEntries(new FormData(form));
    const index=Number(button.dataset.i);
    cart[index].qty=Math.min(30,cart[index].qty+Number(button.dataset.step));
    if (!cart[index].qty) cart.splice(index,1);
    refreshCart();
    if(cart.length) checkout();else dialog.close();
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    if(busy) return;
    draft=Object.fromEntries(new FormData(form));
    for (const key of Object.keys(draft)) draft[key]=draft[key].trim();
    if (!draft.name || (draft.mode==='entrega'&&(!draft.address||!draft.district))) {
      $('#checkout-error').textContent='Preencha o nome e os dados obrigatórios.';return;
    }
    if (!table) {
      const message=['🍔 *Pedido J&C*','👤 '+draft.name,draft.mode==='entrega'?'🛵 Entrega':'🏪 Retirada no balcão','',
        ...cart.map(line=>line.qty+'× '+line.name+(line.extras.length?' + '+line.extras.join(', '):'')+' — '+price(line.unit*line.qty)),
        '', '💰 *Subtotal '+price(cartTotal())+'*'];
      if(draft.mode==='entrega') message.push('📍 '+draft.address+' · '+draft.district+(draft.reference?' · '+draft.reference:''),'Confirmar taxa de entrega.');
      if(draft.notes) message.push('📝 '+draft.notes);
      location.href='https://wa.me/5511973599064?text='+encodeURIComponent(message.join('\n'));
      return;
    }
    const order={table,token,name:draft.name,notes:draft.notes,items:cart.map(line=>({id:line.id,qty:line.qty,extras:line.extraIds}))};
    const fingerprint=JSON.stringify(order);
    if(attempt?.fingerprint!==fingerprint) attempt={fingerprint,id:crypto.randomUUID()};
    busy=true;
    for(const control of content.querySelectorAll('button,input,textarea,select')) control.disabled=true;
    try {
      const result=await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...order,id:attempt.id})});
      cart=[];attempt=null;refreshCart();
      show('Comanda enviada','<p class="ok">Pedido recebido no sistema.</p><p><b>'+escape(draft.name)+'</b> · Mesa '+escape(table)+'<br>Comanda #'+escape(result.number)+' · '+price(result.total)+'</p><p class="muted">Cada pessoa da mesa pode enviar seu próprio pedido pelo mesmo link.</p>');
      draft={};
    } catch(error) {
      $('#checkout-error').textContent=error.message+' Você pode tentar novamente.';
    } finally {
      busy=false;
      for(const control of content.querySelectorAll('button,input,textarea,select')) control.disabled=false;
    }
  };
}
dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
cartButton.onclick=checkout;

async function openMenu() {
  $('#mode').textContent=table?'MESA '+table:'PEDIDO ONLINE';
  menu=await api('/api/menu?'+new URLSearchParams({table,k:token}));
  if (!menu.valid) {
    root.innerHTML='<p class="error">Este link de mesa está incompleto ou inválido. Peça ao balcão o link completo da sua mesa, com o código no final.</p><a href="/">Abrir cardápio online</a>';
    return;
  }
  root.innerHTML='<section class="hero"><div class="hero-copy"><p class="eyebrow">Petiscos • Lanches • Bebidas</p>'+
    (table?'<h1>Peça da sua mesa.</h1><p>Escolha seus itens e envie ao balcão com seu nome. Cada pessoa pode fazer o próprio pedido.</p>':
    '<h1>Sabor de verdade.</h1><p>Escolha seus favoritos e combine a entrega ou retirada pelo WhatsApp.</p>')+
    '</div><img src="/img/hero.webp" alt="J&C Cardápio com batatas fritas e hambúrguer"></section>'+
    '<nav class="filters" aria-label="Categorias"></nav><input type="search" class="search" placeholder="Buscar no cardápio" aria-label="Buscar no cardápio"><div id="menu-items"></div>';
  root.querySelector('.search').oninput=event=>{search=event.target.value;drawMenu();};
  root.querySelector('.filters').onclick=event=>{
    const button=event.target.closest('[data-group]');
    if(button){selected=button.dataset.group;drawMenu();root.querySelector('[aria-pressed=true]').focus({preventScroll:true});}
  };
  $('#menu-items').onclick=event=>{
    const button=event.target.closest('[data-item]');
    if(button) choose(menu.groups.flatMap(g=>g.items).find(item=>item.id===button.dataset.item));
  };
  drawMenu();
}

const statusLabels={novo:'Novo',preparo:'Em preparo',entregue:'Entregue',fechado:'Fechado',cancelado:'Cancelado'};
const nextSteps={novo:[['preparo','Iniciar preparo'],['cancelado','Cancelar']],preparo:[['entregue','Marcar entregue'],['cancelado','Cancelar']],entregue:[['fechado','Fechar comanda']]};
const localTime=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'});
let adminKey='', timer, audio, seen=new Set(), loading=false;
function adminApi(path,options={}) {
  return api('/api/admin/'+path,{...options,headers:{'X-JC-Key':adminKey,...options.headers}});
}
function beep() {
  if(audio?.state!=='running')return;
  for(const [offset,frequency] of [[0,740],[.18,980],[.36,1140]]) {
    const start=audio.currentTime+offset;
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(.18,start);
    gain.gain.exponentialRampToValueAtTime(.001,start+.17);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.start(start);oscillator.stop(start+.18);
  }
}
function renderBoard(orders) {
  const board=$('#board');
  const filter=$('#table-filter').value;
  const showHistory=$('#history').checked;
  const visible=orders.filter(order=>(!filter||order.table_number===Number(filter))&&(showHistory||nextSteps[order.status]));
  const tables=[...new Set(visible.map(o=>o.table_number))].sort((a,b)=>a-b);
  board.innerHTML=tables.map(number=>{
    const rows=visible.filter(o=>o.table_number===number);
    const total=rows.filter(o=>nextSteps[o.status]).reduce((sum,o)=>sum+o.total,0);
    return '<section class="box"><div class="heading"><h2>Mesa '+String(number).padStart(2,'0')+'</h2><span class="pill">'+price(total)+' em aberto</span></div>'+rows.map(o=>
      '<article class="order"><div class="heading"><b>'+escape(o.customer)+'</b><span class="status">'+statusLabels[o.status]+'</span></div>'+
      '<small class="muted">#'+escape(o.id.slice(0,8).toUpperCase())+' · '+localTime.format(o.created_at)+'</small>'+
      '<ul>'+o.lines.map(line=>'<li>'+line.qty+'× '+escape(line.name)+(line.extras.length?' <small>+ '+escape(line.extras.join(', '))+'</small>':'')+' · '+price(line.unit*line.qty)+'</li>').join('')+'</ul>'+
      (o.notes?'<p>Obs. '+escape(o.notes)+'</p>':'')+'<p><b>'+price(o.total)+'</b></p>'+
      '<div class="actions">'+(nextSteps[o.status]||[]).map(([to,label])=>'<button class="secondary" data-order="'+escape(o.id)+'" data-from="'+o.status+'" data-to="'+to+'">'+label+'</button>').join('')+'</div></article>'
    ).join('')+'</section>';
  }).join('')||'<p class="muted">Nenhuma comanda neste filtro.</p>';
}
async function openAdmin() {
  $('#mode').textContent='PAINEL DO LOJISTA';
  root.className='wrap dashboard';
  root.innerHTML='<p class="eyebrow">Operação • J&C</p><h1>Comandas de mesa</h1><form class="box" id="login"><label>Chave de acesso<input type="password" name="key" required autocomplete="current-password"></label><button class="primary">Entrar</button><p class="error" id="login-error" role="alert"></p></form>';
  $('#login').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget, button=form.querySelector('button');
    button.disabled=true;
    adminKey=new FormData(form).get('key').trim();
    try {
      const [links,orders]=await Promise.all([adminApi('tables'),adminApi('orders')]);
      dashboard(links,orders);
    } catch(error) {
      adminKey='';$('#login-error').textContent=error.message;button.disabled=false;
    }
  };
}
function dashboard(links,orders) {
  let current=orders;
  seen=new Set(orders.map(o=>o.id));
  root.innerHTML='<p class="eyebrow">Operação • J&C</p><h1>Comandas de mesa</h1><div class="actions"><button class="primary" id="sound">Ativar alerta sonoro</button><button class="secondary" id="print">Imprimir comandas exibidas</button><button class="secondary" id="exit">Sair</button></div>'+
    '<p class="muted" id="connection" role="status"></p><details class="box"><summary>Links das 10 mesas</summary><div class="table-links">'+links.map(link=>
    '<div class="box"><a href="'+escape(link.path)+'" target="_blank" rel="noopener noreferrer">Mesa '+link.n+'</a><button class="secondary" data-copy="'+escape(link.path)+'">Copiar link</button></div>'
  ).join('')+'</div></details><div class="box"><label>Filtrar por mesa<select id="table-filter"><option value="">Todas as mesas</option>'+links.map(link=>'<option value="'+Number(link.n)+'">Mesa '+link.n+'</option>').join('')+'</select></label><label class="choice"><input type="checkbox" id="history"><span>Mostrar fechadas e canceladas das últimas 24h</span></label></div><p class="error" id="board-error" role="alert"></p><div class="board" id="board"></div>';
  function connection() {
    $('#connection').textContent='Atualização automática a cada 4 segundos. '+(audio?.state==='running'?'Som ativo. Mantenha o painel aberto.':'Ative o som para ouvir novas comandas.');
  }
  async function refresh() {
    if(loading||!adminKey) return;
    loading=true;
    try {
      const data=await adminApi('orders');
      if(!$('#board'))return;
      if(data.some(o=>o.status==='novo'&&!seen.has(o.id)))beep();
      for(const order of data) seen.add(order.id);
      if(JSON.stringify(data)!==JSON.stringify(current)){current=data;renderBoard(current);}
      connection();
    } catch {
      if($('#connection')) $('#connection').textContent='Falha de atualização. Tentando reconectar…';
    } finally {loading=false;}
  }
  $('#sound').onclick=async()=>{
    try {
      audio??=new (window.AudioContext||window.webkitAudioContext)();
      await audio.resume();beep();connection();$('#sound').textContent='Testar alerta sonoro';
    } catch {$('#connection').textContent='Este navegador não conseguiu ativar o som.';}
  };
  $('#table-filter').onchange=$('#history').onchange=()=>renderBoard(current);
  $('#print').onclick=()=>window.print();
  $('#exit').onclick=()=>{clearInterval(timer);adminKey='';audio?.close();audio=null;openAdmin();};
  for(const button of root.querySelectorAll('[data-copy]'))button.onclick=async()=>{
    try {await navigator.clipboard.writeText(new URL(button.dataset.copy,location.origin).href);button.textContent='Link copiado';}
    catch {button.textContent='Abra o link para copiar';}
  };
  $('#board').onclick=async event=>{
    const button=event.target.closest('[data-order]');
    if(!button)return;
    const {order,from,to}=button.dataset;
    if(to==='cancelado'&&!confirm('Cancelar esta comanda?'))return;
    button.disabled=true;
    $('#board-error').textContent='';
    try {
      await adminApi('status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:order,from,to})});
      await refresh();
    } catch(error) {$('#board-error').textContent=error.message;}
    finally {button.disabled=false;}
  };
  connection();renderBoard(current);timer=setInterval(refresh,4000);
}

(location.pathname==='/painel'?openAdmin():openMenu()).catch(()=>{
  root.innerHTML='<p class="error">Não foi possível carregar. Recarregue a página para tentar novamente.</p>';
});
