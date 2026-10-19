# RE:Vendas

## Sobre o projeto

RE:Vendas é um protótipo responsivo de marketplace inspirado em grandes lojas online. A vitrine reúne produtos de diferentes categorias, ofertas, informações de frete e benefícios para compradores. O projeto é uma página estática de demonstração, feita com HTML, CSS e JavaScript, sem dependências ou processo de compilação.

## Recursos da página

- Layout adaptável para celular, tablet e desktop.
- Busca de produtos por nome e termos relacionados.
- Filtros por categoria com atualização imediata da vitrine.
- Carrinho demonstrativo com contador e confirmação visual ao adicionar itens.
- Controles demonstrativos para favoritar produtos.
- Cartões com preço, parcelamento, avaliações, vendedor e indicação de frete.
- Navegação por seções, estados vazios e suporte a foco pelo teclado.

O carrinho e os favoritos funcionam apenas durante a visita atual: não há checkout, conta de usuário, persistência de dados ou integração com pagamentos. Os preços, avaliações e vendedores são ilustrativos. As fotografias e fontes externas dependem de conexão com a internet.

## Estrutura

- `index.html`: conteúdo, estrutura semântica e catálogo de demonstração.
- `styles.css`: identidade visual, layout responsivo e estados de interação.
- `script.js`: busca, filtros, contador do carrinho, favoritos e avisos.
- `live-server-sample.html`: página independente para testar o Live Server.

## Executar localmente

Não é necessário instalar dependências. Abra `index.html` em um navegador ou inicie um servidor local a partir desta pasta. Por exemplo, com a extensão Live Server do Visual Studio Code:

1. Abra a pasta `web` no Visual Studio Code.
2. Clique com o botão direito em `index.html` e escolha **Open with Live Server**.
3. Para testar a atualização automática do servidor, repita os passos com `live-server-sample.html`.

## Publicar no Netlify

Este projeto não precisa de comando de build. Como os arquivos do site estão na pasta `web`, configure a publicação conforme a forma de importação:

### Repositório conectado

1. No Netlify, escolha **Add new site** e conecte o repositório Git.
2. Se solicitado, defina `web` como **Base directory**.
3. Deixe **Build command** vazio e informe `.` como **Publish directory** (relativo à pasta base).
4. Inicie o deploy. O arquivo de entrada publicado é `index.html`.

Se o repositório conectado já tiver `web` configurada como diretório-base, não acrescente `web` novamente no diretório de publicação.

### Envio manual

Arraste a pasta `web` — que contém `index.html`, `styles.css` e `script.js` — para a área de deploy manual do Netlify.

Após a publicação, confira o endereço fornecido pelo Netlify em computador e celular. As imagens e as fontes carregadas de serviços externos podem não aparecer quando não houver conexão com a internet.

## Contribuições

Sugestões e melhorias são bem-vindas por meio de issues ou pull requests no repositório.
