const $=selector=>document.querySelector(selector);
const root=$('#root'), dialog=$('#dialog'), content=$('#dialog-content'), cartButton=$('#cart');
const waiter=location.pathname==='/garcom';
const installApp=waiter?'garcom':location.pathname==='/painel'?'painel':location.pathname==='/'?'cardapio':'';
let installPrompt;
if(installApp) {
  for(const [rel,href] of [['manifest','/'+installApp+'.webmanifest'],['apple-touch-icon','/img/garcom-192.png']]) {
    const link=document.createElement('link');
    link.rel=rel;
    link.href=href;
    document.head.append(link);
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
  });
  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    const button=$('#app-install');
    if(button) button.hidden=true;
  });
}
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
  if (!response.ok) throw Object.assign(new Error(data.error||'Falha de conexão.'),{status:response.status});
  return data;
}
function show(title,body) {
  content.innerHTML='<div class="heading"><h2>'+title+'</h2>'+close+'</div>'+body;
  content.querySelector('[data-close]').onclick=()=>dialog.close();
  if (!dialog.open) dialog.showModal();
}
function setupInstallButton(installButton) {
  installButton.hidden=matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  installButton.onclick=async()=>{
    if(installPrompt) {
      const prompt=installPrompt;
      installPrompt=null;
      try {
        await prompt.prompt();
        const choice=await prompt.userChoice;
        if(choice.outcome==='accepted')installButton.hidden=true;
        return;
      } catch { /* Show manual installation steps if the prompt expired. */ }
    }
    show('Instalar aplicativo J&C','<p><b>Windows:</b> no Chrome ou Edge, procure <b>Instalar aplicativo</b> na barra de endereço ou no menu do navegador.</p><p><b>Android:</b> no Chrome, abra o menu ⋮ e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p><p><b>iPhone:</b> no Safari, toque em <b>Compartilhar</b>, depois em <b>Adicionar à Tela de Início</b>.</p>');
  };
}

if(installApp&&!waiter) {
  const bar=document.createElement('div');
  bar.className='wrap';
  bar.innerHTML='<button class="secondary" id="app-install">Instalar '+(installApp==='painel'?'painel':'cardápio')+'</button>';
  root.before(bar);
  setupInstallButton($('#app-install'));
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/garcom-sw.js').catch(()=>{});
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
  const deliveryFields=(table||waiter)?'': '<label>Como vai receber?<select name="mode"><option value="retirada">Retirada no balcão</option><option value="entrega">Entrega</option></select></label>'+
    '<div id="delivery" hidden><label>Rua e número<input name="address" maxlength="160" autocomplete="street-address"></label><label>Bairro<input name="district" maxlength="80"></label><label>Complemento ou referência<input name="reference" maxlength="100"></label><p class="muted">Taxa e disponibilidade confirmadas pelo WhatsApp.</p></div>';
  show(waiter?'Comanda para a cozinha':table?'Comanda · Mesa '+escape(table):'Seu pedido',cart.map((line,i)=>
    '<div class="line"><div><b>'+escape(line.name)+'</b><small>'+escape(line.extras.join(', '))+'</small><small>'+price(line.unit*line.qty)+'</small></div>'+
    '<div class="actions"><button class="icon" data-i="'+i+'" data-step="-1" aria-label="Remover uma unidade">−</button><b>'+line.qty+'</b><button class="icon" data-i="'+i+'" data-step="1" aria-label="Adicionar uma unidade">+</button></div></div>'
  ).join('')+'<div class="total"><span>'+((table||waiter)?'Total':'Subtotal')+'</span><span>'+price(cartTotal())+'</span></div>'+
    '<form id="checkout">'+(waiter?'<label>Mesa<select name="table" required><option value="">Escolha a mesa</option>'+Array.from({length:10},(_,i)=>{
      const number=String(i+1).padStart(2,'0');
      return '<option value="'+number+'">Mesa '+number+'</option>';
    }).join('')+'</select></label>':'<label>'+ (table?'Seu nome na comanda':'Seu nome') +'<input name="name" required maxlength="70" autocomplete="given-name" placeholder="Ex. Pedro"></label>')+deliveryFields+
    '<label>Observações<textarea name="notes" rows="2" maxlength="400" placeholder="Ex. sem cebola"></textarea></label><p id="checkout-error" class="error" role="alert"></p>'+
    '<button class="primary wide">'+(waiter?'Enviar para a cozinha':table?'Enviar comanda para o balcão':'Abrir pedido no WhatsApp')+'</button></form>');
  const form=$('#checkout');
  for (const [name,value] of Object.entries(draft)) if(form.elements[name]) form.elements[name].value=value;
  function updateDelivery() {
    if(table||waiter) return;
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
    if ((!waiter&&!draft.name) || (draft.mode==='entrega'&&(!draft.address||!draft.district))) {
      $('#checkout-error').textContent='Preencha o nome e os dados obrigatórios.';return;
    }
    if (waiter) {
      const order={id:crypto.randomUUID(),table:draft.table,notes:draft.notes,items:cart.map(line=>({id:line.id,qty:line.qty,extras:line.extraIds}))};
      try {
        localStorage.setItem(waiterPrefix+order.id,JSON.stringify(order));
      } catch {
        $('#checkout-error').textContent='Não foi possível salvar neste aparelho. Mantenha esta tela aberta e tente novamente.';
        return;
      }
      cart=[];draft={table:order.table};refreshCart();
      show('Pedido salvo','<p>Acompanhe o envio para a cozinha na fila do garçom.</p>');
      updateWaiterQueue();
      syncWaiterOrders();
      return;
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
  $('#mode').textContent=waiter?'GARÇOM':table?'MESA '+table:'PEDIDO ONLINE';
  menu=await api('/api/menu?'+new URLSearchParams({table,k:token}));
  if (!menu.valid) {
    root.innerHTML='<p class="error">Este link de mesa está incompleto ou inválido. Peça ao balcão o link completo da sua mesa, com o código no final.</p><a href="/">Abrir cardápio online</a>';
    return;
  }
  root.innerHTML='<section class="hero"><div class="hero-copy"><p class="eyebrow">Petiscos • Lanches • Bebidas</p>'+
    (waiter?'<h1>Área do garçom</h1><p>Adicione os itens e escolha a mesa ao enviar a comanda.</p>':table?'<h1>Peça da sua mesa.</h1><p>Escolha seus itens e envie ao balcão com seu nome. Cada pessoa pode fazer o próprio pedido.</p>':
    '<h1>Sabor de verdade.</h1><p>Escolha seus favoritos e combine a entrega ou retirada pelo WhatsApp.</p>')+
    '</div><img src="/img/hero.webp" alt="J&C Cardápio com batatas fritas e hambúrguer"></section>'+
    (waiter?'<section class="box"><p id="waiter-status" role="status"></p><p class="muted" id="waiter-offline">Preparando acesso offline…</p><ul id="waiter-queue"></ul><div class="actions"><button class="secondary" id="waiter-sync">Sincronizar</button><button class="secondary" id="app-install">Instalar app</button></div></section>':'')+
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

const waiterPrefix='jc-waiter-order:';
let waiterSyncing=false;
function waiterOrders() {
  return Object.keys(localStorage).filter(key=>key.startsWith(waiterPrefix))
    .map(key=>JSON.parse(localStorage.getItem(key))).filter(Boolean);
}
function updateWaiterQueue() {
  $('#waiter-queue').innerHTML=waiterOrders().map(order=>'<li>Mesa '+escape(order.table)+' · '+escape(order.name||'Garçom')+' · Aguardando envio</li>').join('');
}
async function syncWaiterOrders() {
  if(waiterSyncing) return;
  waiterSyncing=true;
  const status=$('#waiter-status');
  try {
    const orders=waiterOrders();
    updateWaiterQueue();
    if(!navigator.onLine) {
      status.textContent='Sem internet. As comandas ficam salvas neste aparelho até o envio.';
      return;
    }
    let refused=0;
    for(const order of orders) {
      try {
        await api('/api/waiter-order',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(order),signal:AbortSignal.timeout(12000)});
      } catch(error) {
        if(![400,403,409,422].includes(error.status))throw error;
        refused++;
        continue;
      }
      localStorage.removeItem(waiterPrefix+order.id);
      updateWaiterQueue();
    }
    if(refused) status.textContent=refused+' comanda(s) recusada(s) pela cozinha continuam na fila. Confira no painel antes de refazer.';
    else if(orders.length) status.textContent='Comandas enviadas para a cozinha.';
    else if(!status.textContent.startsWith('Comandas enviadas')) status.textContent='Pronto para enviar à cozinha.';
  } catch(error) {
    status.textContent=error.status>=400&&error.status<500
        ? 'A cozinha recusou uma comanda. Ela continua na fila. '+error.message
        : 'Conexão indisponível. As comandas salvas serão reenviadas.';
  } finally {
    waiterSyncing=false;
  }
}
async function openWaiter() {
  await openMenu();
  const offlineStatus=$('#waiter-offline');
  if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/garcom-sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
      offlineStatus.textContent='Cardápio disponível neste aparelho sem internet.';
    }).catch(()=>{offlineStatus.textContent='Este aparelho ainda não está pronto para reabrir o cardápio offline.';});
  } else offlineStatus.textContent='Este navegador permite salvar pedidos com a página aberta.';
  setupInstallButton($('#app-install'));
  $('#waiter-sync').onclick=syncWaiterOrders;
  window.addEventListener('online',syncWaiterOrders);
  window.addEventListener('offline',syncWaiterOrders);
  setInterval(()=>{if(waiterOrders().length)syncWaiterOrders();},10000);
  syncWaiterOrders();
}

const statusLabels={novo:'Novo',preparo:'Em preparo',entregue:'Entregue',fechado:'Fechado',cancelado:'Cancelado'};
const nextSteps={novo:[['preparo','Iniciar preparo'],['cancelado','Cancelar']],preparo:[['entregue','Marcar entregue'],['cancelado','Cancelar']],entregue:[['fechado','Fechar comanda']]};
const localTime=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'});
let timer, audio, seen=new Set(), loading=false;
function adminApi(path,options={}) {
  return api('/api/admin/'+path,{...options,headers:{'X-JC-Session':'1',...options.headers}});
}
function enableAudio() {
  audio??=new (window.AudioContext||window.webkitAudioContext)();
  return audio.state==='running'?Promise.resolve():audio.resume();
}
function beep() {
  if(audio?.state!=='running')return;
  for(const [offset,frequency] of [[0,740],[.18,980],[.36,1140]]) {
    const start=audio.currentTime+offset;
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(.52,start);
    gain.gain.exponentialRampToValueAtTime(.001,start+.17);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.start(start);oscillator.stop(start+.18);
  }
}
function visibleOrders(orders) {
  const filter=$('#table-filter').value;
  const showHistory=$('#history').checked;
  return orders.filter(order=>(!filter||order.table_number===Number(filter))&&(showHistory||nextSteps[order.status]));
}
function renderBoard(orders) {
  const board=$('#board');
  const visible=visibleOrders(orders);
  const tables=[...new Set(visible.map(o=>o.table_number))].sort((a,b)=>a-b);
  board.innerHTML=tables.map(number=>{
    const rows=visible.filter(o=>o.table_number===number);
    const total=rows.filter(o=>nextSteps[o.status]).reduce((sum,o)=>sum+o.total,0);
    return '<section class="box"><div class="heading"><h2>Mesa '+String(number).padStart(2,'0')+'</h2><span class="pill">'+price(total)+' em aberto</span></div>'+rows.map(o=>
      '<article class="order"><div class="heading"><b>'+escape(o.customer)+'</b><span class="status">'+statusLabels[o.status]+'</span></div>'+
      '<small class="muted">#'+escape(o.id.slice(0,8).toUpperCase())+' · '+localTime.format(o.created_at)+'</small>'+
      '<ul>'+o.lines.map(line=>'<li>'+line.qty+'× '+escape(line.name)+(line.extras.length?' <small>+ '+escape(line.extras.join(', '))+'</small>':'')+' · '+price(line.unit*line.qty)+'</li>').join('')+'</ul>'+
      (o.notes?'<p>Obs. '+escape(o.notes)+'</p>':'')+'<p><b>'+price(o.total)+'</b></p>'+
      '<div class="actions"><button class="secondary" data-print="'+escape(o.id)+'">Imprimir comanda</button>'+(nextSteps[o.status]||[]).map(([to,label])=>'<button class="secondary" data-order="'+escape(o.id)+'" data-from="'+o.status+'" data-to="'+to+'">'+label+'</button>').join('')+'</div></article>'
    ).join('')+'</section>';
  }).join('')||'<p class="muted">Nenhuma comanda neste filtro.</p>';
}
function printOrders(orders) {
  if(!orders.length)return;
  const sheet=document.createElement('div');
  sheet.className='thermal-print thermal-'+($('#paper-size').value==='58'?'58':'80');
  sheet.innerHTML=orders.map(order=>'<section class="thermal-ticket"><h2>J&C · Mesa '+
    escape(String(order.table_number).padStart(2,'0'))+'</h2><p>Comanda #'+escape(order.id.slice(0,8).toUpperCase())+
    ' · '+localTime.format(order.created_at)+'</p><p>'+escape(order.customer)+'</p><ul>'+
    order.lines.map(line=>'<li><b>'+line.qty+' × '+escape(line.name)+'</b>'+
      (line.extras.length?'<div>+ '+escape(line.extras.join(', '))+'</div>':'')+
      '<div>'+price(line.unit*line.qty)+'</div></li>').join('')+'</ul>'+
    (order.notes?'<p><b>Obs.</b> '+escape(order.notes)+'</p>':'')+
    '<p class="thermal-total">Total '+price(order.total)+'</p></section>').join('');
  document.querySelector('.thermal-print')?.remove();
  document.body.append(sheet);
  document.body.classList.add('printing-thermal');
  window.addEventListener('afterprint',()=>{
    sheet.remove();
    document.body.classList.remove('printing-thermal');
  },{once:true});
  window.print();
}
async function openAdmin(restore=true) {
  $('#mode').textContent='PAINEL DO LOJISTA';
  root.className='wrap dashboard';
  root.innerHTML='<p class="eyebrow">Operação • J&C</p><h1>Comandas de mesa</h1><form class="box" id="login"><label>Usuário<input name="username" required autocomplete="username" autocapitalize="none"></label><label>Senha<input type="password" name="password" required autocomplete="current-password"></label><button class="primary">Entrar</button><p class="error" id="login-error" role="alert"></p></form>';
  const form=$('#login'), button=form.querySelector('button');
  async function signIn(login) {
    button.disabled=true;
    $('#login-error').textContent='';
    try {
      if(login) await adminApi('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(login)});
      const links=await adminApi('tables');
      const orders=await adminApi('orders');
      dashboard(links,orders);
    } catch(error) {
      if (login || error.status!==401) $('#login-error').textContent=error.message;
      button.disabled=false;
    }
  }
  form.onsubmit=event=>{
    event.preventDefault();
    const fields=new FormData(form);
    const login={username:fields.get('username').trim(),password:fields.get('password')};
    if(login.username&&login.password) {
      try { enableAudio().catch(()=>{}); } catch { /* Audio is optional. */ }
      signIn(login);
    }
  };
  if(restore) await signIn();
}
function dashboard(links,orders) {
  let current=orders;
  seen=new Set(orders.map(o=>o.id));
  root.innerHTML='<p class="eyebrow">Operação • J&C</p><h1>Comandas de mesa</h1><div class="actions"><button class="primary" id="sound">Testar alerta sonoro</button><label class="paper-size">Bobina <select id="paper-size"><option value="80">80 mm</option><option value="58">58 mm</option></select></label><button class="secondary" id="print">Imprimir comandas exibidas</button><button class="secondary" id="exit">Sair</button></div>'+
    '<p class="muted" id="connection" role="status"></p><details class="box"><summary>Links das 10 mesas</summary><div class="table-links">'+links.map(link=>
    '<div class="box"><a href="'+escape(link.path)+'" target="_blank" rel="noopener noreferrer">Mesa '+link.n+'</a><button class="secondary" data-copy="'+escape(link.path)+'">Copiar link</button></div>'
  ).join('')+'</div></details><div class="box"><label>Filtrar por mesa<select id="table-filter"><option value="">Todas as mesas</option>'+links.map(link=>'<option value="'+Number(link.n)+'">Mesa '+link.n+'</option>').join('')+'</select></label><label class="choice"><input type="checkbox" id="history"><span>Mostrar fechadas e canceladas das últimas 24h</span></label></div><p class="error" id="board-error" role="alert"></p><div class="board" id="board"></div>';
  function connection() {
    $('#connection').textContent='Atualização automática a cada 4 segundos. '+(audio?.state==='running'?'Som ativo. Mantenha o painel aberto.':'Alerta ligado. Se o navegador bloquear o som, toque no painel para liberar.');
  }
  async function refresh() {
    if(loading) return;
    loading=true;
    try {
      const data=await adminApi('orders');
      if(!$('#board'))return;
      if(data.some(o=>o.status==='novo'&&!seen.has(o.id)))beep();
      for(const order of data) seen.add(order.id);
      if(JSON.stringify(data)!==JSON.stringify(current)){current=data;renderBoard(current);}
      connection();
    } catch(error) {
      if(error.status===401 && $('#board')) { endSession(); return; }
      if($('#connection')) $('#connection').textContent='Falha de atualização. Tentando reconectar…';
    } finally {loading=false;}
  }
  const audioEvents=new AbortController();
  function startAudio() {
    if(audio?.state==='running')return;
    try {
      enableAudio().then(()=>{
        if(audioEvents.signal.aborted)return;
        connection();
      }).catch(()=>{});
    } catch { /* The browser may not support audio. */ }
  }
  for(const event of ['pointerup','keydown','touchend']) {
    root.addEventListener(event,startAudio,{signal:audioEvents.signal});
  }
  $('#sound').onclick=async()=>{
    try {
      await enableAudio();
      if(!$('#board'))return;
      beep();connection();
    } catch {$('#connection').textContent='Este navegador não conseguiu ativar o som.';}
  };
  $('#table-filter').onchange=$('#history').onchange=()=>renderBoard(current);
  $('#print').onclick=()=>printOrders(visibleOrders(current));
  function endSession() {
    clearInterval(timer);
    audioEvents.abort();
    audio?.close();
    audio=null;
    openAdmin(false);
  }
  $('#exit').onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try {
      await adminApi('logout',{method:'POST'});
      endSession();
    } catch(error) {
      button.disabled=false;
      $('#board-error').textContent=error.message;
    }
  };
  for(const button of root.querySelectorAll('[data-copy]'))button.onclick=async()=>{
    try {await navigator.clipboard.writeText(new URL(button.dataset.copy,location.origin).href);button.textContent='Link copiado';}
    catch {button.textContent='Abra o link para copiar';}
  };
  $('#board').onclick=async event=>{
    const printButton=event.target.closest('[data-print]');
    if(printButton) {
      printOrders(current.filter(order=>order.id===printButton.dataset.print));
      return;
    }
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
  connection();renderBoard(current);startAudio();timer=setInterval(refresh,4000);
}

(location.pathname==='/painel'?openAdmin():waiter?openWaiter():openMenu()).catch(()=>{
  if(waiter) {
    root.innerHTML='<h1>Área do garçom</h1><p>Conecte à internet para carregar o cardápio e tente novamente.</p><a class="primary" href="/garcom">Tentar novamente</a>';
    return;
  }
  root.innerHTML='<p class="error">Não foi possível carregar. Recarregue a página para tentar novamente.</p>';
});
