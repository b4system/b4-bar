# 🍺 B4 Bar

Sistema completo de **cardápio digital e gestão operacional para bares e restaurantes**, com painel para garçons, controle de pedidos em tempo real, gestão de mercadorias, equipe e dashboard de vendas.

🌐 **Repositório:** [github.com/b4system/b4-bar](https://github.com/b4system/b4-bar)

---

## ✨ Funcionalidades

### 🍽️ Cardápio público
- Catálogo de produtos com imagens, descrição e preços
- Busca por nome ou descrição
- Filtro por categoria com chips horizontais
- Filtros **fixos no topo** ao rolar (sticky)
- Tipografia clássica de menu de bar (Cormorant Garamond para preços)

### 📝 Área do garçom
- Anotar pedidos por mesa de forma rápida
- Carrinho persistente (localStorage)
- Modal único para **observações + adicionais** com preço dinâmico
- Item com observação ou adicionais especiais entra como linha separada
- Validação obrigatória da mesa antes de enviar
- Reset automático do fluxo após enviar (gaveta fecha no mobile)
- Nome do garçom puxado automaticamente do usuário logado

### 🧾 Painel de pedidos
- Atualização automática a cada 10 segundos
- **Checklist por item** — funcionários marcam o que foi feito
- Barra de progresso (X/Y prontos)
- Cronômetro **desde a criação** do pedido com:
  - Tempo restante (azul)
  - Item pronto (verde)
  - Item atrasado (vermelho pulsante)
- Horário previsto de conclusão "Pronto às HH:MM"
- Card inteiro destacado quando algum item atrasou
- Filtros por status com workflow personalizável

### 📊 Dashboard de vendas
- KPIs do dia: faturamento, pedidos, ticket médio, itens vendidos
- Gráficos de vendas por hora/dia (Chart.js)
- Vendas por categoria (donut com legenda)
- Top 10 produtos mais vendidos
- Top 5 garçons por faturamento
- **Seção de pedidos atrasados** para análise do administrador
- Status dos pedidos com contadores
- Filtros: Hoje · 7 dias · 30 dias

### 🍴 Cadastro de mercadoria
- CRUD completo de produtos com upload de imagem (drag-and-drop)
- Gestão de categorias com picker de emoji
- Filtro por categoria + busca
- Modal único para criar/editar produtos
- Campos: nome, descrição, preço, **tempo de preparo (min)**, categoria, imagem
- Toggle "Permitir observação" para pratos
- **Adicionais** opcionais por item (ex: bacon extra +R$ 5,00)

### 👥 Gestão de funcionários
- Cadastro com nome, usuário, senha, cargo
- **Permissões granulares por página**: cardápio, garçom, pedidos, produtos, funcionários, dashboard, configurações
- Ativar/desativar funcionários
- Senhas com **bcrypt + salt** (10 rounds)

### ⚙️ Configurações (workflow customizável)
- **Status do pedido totalmente editáveis** pelo administrador
- Criar, renomear, reordenar, excluir status
- Cores semânticas (alerta, em andamento, concluído, neutro, crítico)
- "Cancelado" é fixo e sempre disponível

### 🔐 Autenticação e segurança
- Login com sessão por token (256 bits)
- Senhas com bcrypt
- Páginas protegidas redirecionam para login
- Middleware de permissão por endpoint

### 🎨 UI/UX
- Design responsivo (mobile, tablet, desktop)
- **Tema claro (sand/wheat) e escuro (grafite)** alternáveis
- Menu hamburger com drawer lateral no mobile
- Modais bottom-sheet no celular
- Animações suaves, micro-interações e haptic feedback

---

## 🛠️ Stack

**Backend**
- Node.js (18+)
- Express 4
- Multer (upload de imagens)
- bcryptjs (hash de senhas)
- Persistência em JSON

**Frontend**
- HTML/CSS/JS vanilla — sem frameworks
- Chart.js (dashboard)
- Fontes: Nunito + Cormorant Garamond (Google Fonts)
- Tema com CSS Variables + `data-theme`

**Ferramentas**
- Nodemon para hot reload em dev

---

## 🚀 Instalação

```bash
git clone https://github.com/b4system/b4-bar.git
cd b4-bar
npm install
```

## ▶️ Executar

```bash
npm start
```

A aplicação fica disponível em `http://localhost:3000`.

O servidor inicia com **hot reload** (nodemon), reiniciando automaticamente a cada alteração.

### Credenciais padrão (admin)
- **Usuário:** `admin`
- **Senha:** `admin123`

> ⚠️ Recomenda-se trocar a senha após o primeiro acesso.

---

## 📁 Estrutura

```
b4-bar/
├── app.js                    # Servidor Express + API
├── package.json
├── data/                     # Persistência (gerado em runtime)
│   ├── menu.json             # Categorias e produtos
│   ├── orders.json           # Pedidos
│   ├── staff.json            # Funcionários
│   └── statuses.json         # Workflow do pedido
└── public/
    ├── index.html            # Cardápio (cliente)
    ├── login.html
    ├── garcom.html           # Área do garçom
    ├── pedidos.html          # Painel de pedidos
    ├── area-interna.html     # Hub que agrega abaixo
    ├── dashboard.html        # Sub-aba: dashboard
    ├── admin.html            # Sub-aba: produtos
    ├── funcionarios.html     # Sub-aba: funcionários
    ├── configuracoes.html    # Sub-aba: configurações
    ├── css/style.css         # Design system completo
    ├── js/
    │   ├── auth.js           # Sessão + navegação dinâmica
    │   ├── menu.js
    │   ├── garcom.js
    │   ├── pedidos.js
    │   ├── dashboard.js
    │   ├── admin.js
    │   ├── funcionarios.js
    │   └── configuracoes.js
    └── uploads/              # Imagens enviadas (gerado em runtime)
```

---

## 🌐 Rotas

### Páginas
| Rota | Descrição | Permissão |
|------|-----------|-----------|
| `/` | Cardápio público | — |
| `/login` | Entrar como funcionário | — |
| `/garcom` | Anotar pedidos | `garcom` |
| `/pedidos` | Painel de pedidos | `pedidos` |
| `/area-interna` | Hub administrativo (redireciona) | qualquer admin |
| `/dashboard` | Resumo de vendas | `dashboard` |
| `/admin` | Cadastro de produtos | `produtos` |
| `/funcionarios` | Gestão da equipe | `funcionarios` |
| `/configuracoes` | Workflow do pedido | `configuracoes` |

### API
| Método | Rota | Auth |
|--------|------|------|
| `POST` | `/api/auth/login` | — |
| `GET` | `/api/auth/me` | bearer |
| `POST` | `/api/auth/logout` | bearer |
| `GET` | `/api/menu` | — |
| `GET` | `/api/statuses` | — |
| `GET` `POST` | `/api/orders` | — |
| `PATCH` | `/api/orders/:id` | — |
| `PATCH` | `/api/orders/:id/items/:idx` | — |
| `DELETE` | `/api/orders/:id` | — |
| `GET` | `/api/dashboard/summary` | `dashboard` |
| `POST` `PATCH` `DELETE` | `/api/admin/categories[/:id]` | `produtos` |
| `POST` `PATCH` `DELETE` | `/api/admin/items[/:id]` | `produtos` |
| `POST` | `/api/admin/upload` | — |
| `GET` `POST` `PATCH` `DELETE` | `/api/admin/staff[/:id]` | `funcionarios` |
| `POST` `PATCH` `DELETE` | `/api/admin/statuses[/:id]` | `configuracoes` |
| `PUT` | `/api/admin/statuses/reorder` | `configuracoes` |

---

## 📄 Licença

MIT
