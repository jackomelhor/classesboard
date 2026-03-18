# ClassBoard v0.4 — GitHub Pages + Supabase

Esta versão foi reestruturada para ficar simples de publicar e, ao mesmo tempo, manter **banco de dados real**, **login** e **dados compartilhados**.

## O que ela já entrega

- login e cadastro com Supabase Auth
- dashboard no estilo SaaS escolar
- visual de login inspirado na referência escura que você enviou
- criação de workspace
- entrada por código de convite
- alternância entre workspaces
- criação, edição e exclusão de tarefas
- checklist por tarefa
- agenda dos próximos 30 dias
- membros e papéis (`owner`, `admin`, `member`)
- transferência de ownership via função RPC
- regeneração de código de convite via função RPC
- persistência real no banco de dados

## Estrutura do projeto

```text
index.html
404.html
.nojekyll
assets/
  css/style.css
  js/config.js
  js/supabase-client.js
  js/app.js
supabase/
  schema.sql
```

## Publicação mais simples

### 1. Criar projeto no Supabase
- crie um projeto novo
- copie a **Project URL**
- copie a **anon / publishable key**
- no menu **Authentication > Providers > Email**, desligue a confirmação de email durante os testes

### 2. Rodar o schema
- abra o **SQL Editor** no Supabase
- cole todo o conteúdo de `supabase/schema.sql`
- execute o script

### 3. Preencher a configuração do frontend
Abra `assets/js/config.js` e troque:

```js
window.CLASSBOARD_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE_AQUI_SUA_ANON_KEY',
  APP_NAME: 'ClassBoard',
  APP_VERSION: 'v0.4',
};
```

### 4. Publicar no GitHub Pages
- envie os arquivos para a raiz do repositório
- no GitHub, vá em **Settings > Pages**
- escolha a branch `main`
- escolha a pasta `/root`
- salve

## Observações importantes

- esta versão **não usa backend Python**
- a **anon key** pode ficar no frontend **desde que o RLS esteja ativo** e bem configurado
- **nunca** coloque a **service role key** no frontend
- as regras de acesso dependem das policies do `schema.sql`

## Fluxo recomendado de teste

1. criar sua conta
2. criar um workspace
3. abrir um segundo navegador ou usuário
4. entrar no mesmo workspace com o código de convite
5. criar tarefas e testar atualização compartilhada

## O que ainda falta

- notificações push e por email
- upload de arquivos com Supabase Storage
- comentários por tarefa
- quadro kanban
- painel de professor
- analytics e histórico de auditoria
- plano de assinatura / cobrança
- PWA e modo offline

## Arquivos que você mais vai mexer

### Visual
- `assets/css/style.css`

### Configuração
- `assets/js/config.js`

### Regras da interface e chamadas ao banco
- `assets/js/app.js`

### Banco, funções RPC e policies
- `supabase/schema.sql`

## Dica prática
Se quiser começar bem simples:
- configure o Supabase
- publique no GitHub Pages
- teste primeiro com 2 contas e 1 workspace
- só depois pense em anexos, notificações e cobrança
