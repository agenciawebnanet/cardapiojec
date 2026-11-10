# J&C Cardápio e Mesas

O cardápio em `/` monta pedidos de entrega ou retirada para WhatsApp. Em `/painel`,
o balcão acompanha e atualiza comandas individuais, agrupadas por mesa. Os links
das 10 mesas são copiados pelo painel e incluem um código de validação.

## Publicação na Vercel

1. Importe este repositório como um projeto separado.
2. Crie um PostgreSQL Neon dedicado no Marketplace e conecte-o ao projeto,
   com `DATABASE_URL` (ou `POSTGRES_URL`) no ambiente de produção.
3. Configure `ADMIN_KEY` como variável sensível, com uma chave aleatória forte.
   Essa chave também assina os links de mesa. Ao trocá-la, redistribua os links.
4. Publique. O comando de build aplica o esquema de comandas de forma idempotente.
5. Abra `/painel`, entre com a chave e clique em **Ativar alerta sonoro**.
   Copie os links das mesas no mesmo painel.

O PostgreSQL guarda as comandas enviadas pelos links das mesas. Pedidos de
entrega ou retirada são concluídos pelo WhatsApp. Para um ambiente de preview
com comandas, conecte um banco de teste separado.

## Usar o banco já publicado

Configure `ORDERS_BACKEND_URL` com a origem do backend J&C existente para manter
as comandas no mesmo banco. Nesse modo, a Vercel serve o cardápio e encaminha as
requisições do painel e das mesas para esse backend. Uma conexão PostgreSQL
configurada tem prioridade. Exporte e importe as comandas antes de trocar de
banco, se houver histórico a preservar.
