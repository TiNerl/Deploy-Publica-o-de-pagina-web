# RE:Vendas

Protótipo responsivo de marketplace para demonstração do fluxo de compra e venda. O repositório contém uma vitrine estática e uma API HTTP feita com módulos nativos do Node.js, sem frameworks e sem dependências externas.

> **Demonstração, não produção:** o checkout é fictício. Não há cobrança, gateway de pagamento, emissão de nota fiscal válida, entrega real, recuperação de senha ou garantias de segurança/privacidade para uso comercial. A nota fiscal e o comprovante exibidos são identificadores demonstrativos.

## Recursos

- Busca de produtos, filtros por categoria e catálogo servido pela API.
- Sessão persistente de visitante (guest) por navegador, carrinho próprio e migração do carrinho ao criar uma conta de cliente.
- Carrinho com inclusão, remoção, alteração de quantidade e aplicação/remoção de cupons.
- Checkout demonstrativo, baixa de estoque, página animada de confirmação e comprovante com pedido e identificadores de nota fiscal fictícios.
- Área do cliente para consultar pedidos e conversar com o vendedor depois do aceite do pedido.
- Painel exclusivo de vendedor para publicar/remover produtos, criar/desativar cupons, aceitar/recusar pedidos e responder mensagens.
- Rotas administrativas para criar contas de vendedor e produtos seguros reservados à administração.
- Persistência local em JSON e testes automatizados de integração, sem dependências de terceiros.

## Estrutura

- `frontend/web/index.html`: vitrine de produtos.
- `frontend/web/cart.html`: carrinho, cupons e identificação/checkout.
- `frontend/web/confirmation.html`: confirmação animada e comprovante fictício.
- `frontend/web/orders.html`: pedidos do cliente e conversas com vendedores.
- `frontend/web/seller.html`: painel de vendas.
- `frontend/web/api.js`: cliente HTTP compartilhado e sessão do navegador.
- `frontend/web/styles.css`: estilo da vitrine e das páginas do fluxo.
- `backend/server.js`: API, regras de negócio, autorização e persistência.
- `backend/server.test.js`: testes de integração com `node:test`.

## Requisitos

- Node.js 20 ou superior.
- Navegador moderno.

Não há pacotes para instalar. Para iniciar a API:

```sh
cd backend
npm start
```

A API fica disponível em `http://localhost:3000`. Em outro terminal, sirva a pasta `frontend/web` com Live Server ou outro servidor de arquivos estáticos e abra `index.html`. O cliente web usa `http://localhost:3000` por padrão.

Para apontar o frontend para uma API em outro endereço, defina `window.REVENDAS_API_URL` antes de carregar `api.js` (por exemplo, em um `<script>` no HTML). A API habilita CORS para facilitar o desenvolvimento local; para publicação, defina `API_ORIGIN` com a origem permitida do frontend ou configure um proxy e uma política de origem adequada.

## Testes

Execute os testes de integração a partir da pasta `backend`:

```sh
npm test
```

Os testes criam arquivos temporários isolados e cobrem migração do carrinho guest, cupons, pedidos, estoque, conversas, permissões do vendedor e acesso administrativo.

## Contas e operações de demonstração

- Vendedor inicial: `vendedor@revendas.test` / `vendedor123`.
- Cliente: criado no carrinho, durante a finalização.
- Visitante: criado automaticamente quando um navegador abre a vitrine pela primeira vez; o identificador de sessão fica no `localStorage`.
- Administrador: não há conta administrativa pública. Operações administrativas exigem o cabeçalho `X-Admin-Token`, cujo valor deve ser configurado no ambiente como `ADMIN_TOKEN`.

Exemplo para iniciar a API com um segredo administrativo:

```sh
ADMIN_TOKEN='substitua-por-um-segredo-local' npm start
```

Exemplos de rotas de administração (JSON):

```sh
curl -X POST http://localhost:3000/api/admin/sellers \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: substitua-por-um-segredo-local' \
  -d '{"name":"Loja Exemplo","email":"loja@example.test","password":"uma-senha-com-12"}'

curl -X POST http://localhost:3000/api/admin/products \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: substitua-por-um-segredo-local' \
  -d '{"name":"Produto com origem segura","price":12500,"stock":5}'
```

O preço das rotas de produto é sempre informado em centavos inteiros (R$ 125,00 = `12500`). A API protege as senhas com `scrypt`, valida os papéis e mantém produtos administrativos fora do catálogo público. A conta e o segredo de demonstração não substituem autenticação, armazenamento ou controles apropriados para um sistema real.

## Persistência e publicação

Os dados ficam em `backend/data/store.json`, criado automaticamente na primeira inicialização. Esse arquivo é dado local de execução; faça backup antes de removê-lo. Para redefinir os dados da demonstração, pare o servidor e remova somente esse arquivo.

O frontend pode ser publicado como arquivos estáticos, mas a API precisa permanecer hospedada e acessível pela origem configurada. O deploy apenas da pasta `frontend/web` não oferece backend. Configure também `ADMIN_TOKEN`, CORS/origem, HTTPS, armazenamento e autenticação apropriados antes de qualquer uso real.

## Publicar o frontend no Netlify

O frontend não tem processo de build. Para publicar somente as páginas estáticas:

1. No Netlify, conecte o repositório e defina `frontend/web` como diretório-base.
2. Deixe o comando de build vazio e configure `.` como diretório de publicação.
3. Configure `window.REVENDAS_API_URL` para o endereço público da API.
4. Publique a API separadamente; uma publicação estática, sozinha, não executa o backend.

Imagens e fontes externas dependem de conexão com a internet.

## Contribuições

Sugestões e melhorias são bem-vindas por meio de issues ou pull requests.
