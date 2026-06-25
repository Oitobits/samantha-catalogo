# Samantha Catálogo 🌟

Um catálogo/vitrine de produtos moderno, objetivo, limpo e totalmente funcional, desenvolvido especialmente para rodar localmente no navegador (ideal para tablets e computadores de vendedores externos).

O projeto é **100% offline-first**: ele funciona sem internet, utilizando o banco de dados interno do navegador (**IndexedDB**) para persistir os produtos e as fotos cadastradas.

---

## 🛠️ Tecnologias Utilizadas

1. **HTML5**: Estrutura semântica das páginas.
2. **CSS3**: Estilização premium, limpa e responsiva (adaptada para telas de celulares, tablets e desktops).
3. **Vanilla JavaScript (ES6+)**: Toda a lógica de funcionamento e controle.
4. **IndexedDB**: Banco de dados local para salvar as informações de forma persistente.
5. **Canvas API**: Redimensionamento e compressão automática de fotos de upload para o formato `.webp`, otimizando o armazenamento interno.

---

## 📂 Estrutura de Arquivos do Projeto

```text
Samantha Catalogo/
├── index.html          # Vitrine pública (lado do cliente / vendedor)
├── admin.html          # Painel de controle (cadastro, edição, ativação/inativação)
├── css/
│   └── style.css       # Estilo visual centralizado (Premium e Clean)
└── js/
    ├── db.js           # Banco de dados local (IndexedDB) e compressão de imagens
    ├── app.js          # Lógica da vitrine (busca, filtros de preço, modal de detalhes)
    └── admin.js        # Lógica do painel de administração (CRUD de produtos)
```

---

## 🚀 Como Executar

Como o projeto é feito com tecnologias web puras e banco de dados local IndexedDB:

1. **Abrindo diretamente**:
   Você pode simplesmente dar um duplo clique no arquivo `index.html` para abri-lo no seu navegador favorito. O IndexedDB funciona diretamente de forma local na maioria dos navegadores modernos.

2. **Executando via Servidor Local (Recomendado)**:
   Se preferir rodar sob um protocolo HTTP (o que garante 100% de compatibilidade em todos os navegadores para recursos locais):
   * Se tiver o Python instalado, abra o terminal na pasta do projeto e digite:
     ```bash
     python -m http.server 8000
     ```
     Depois, abra no navegador o endereço `http://localhost:8000`.
   * Se tiver o Node.js instalado, você pode usar:
     ```bash
     npx serve
     ```

---

## 💡 Recursos de Destaque

* **Compressão para WebP**: Ao fazer o upload de uma imagem do seu dispositivo (como a foto tirada pela câmera de um tablet), a aplicação redimensiona e comprime automaticamente o arquivo para o formato **WebP** com tamanho máximo de 800x800 pixels. Isso faz com que imagens de 5MB passem a ocupar cerca de 60KB, permitindo que você armazene centenas de produtos diretamente no navegador sem lentidão.
* **Busca Dinâmica com Lupa**: O cliente ou vendedor pode pesquisar produtos instantaneamente digitando o código, a referência ou qualquer parte da descrição.
* **Ordenação Inteligente**: Ordene por menor preço, maior preço, ou em ordem alfabética.
* **Toggle de Status Rápido**: No painel de administração (`admin.html`), você pode ativar ou desativar um produto instantaneamente usando o botão deslizante (switch). Produtos inativos somem da vitrine do cliente imediatamente, mas continuam listados no admin para reativação posterior.
* **Modo Escrita/Edição Único**: O formulário de cadastro de produtos detecta quando você clica em "Editar" e preenche os campos automaticamente, alternando o botão para "Salvar Alterações".

---

## 📝 Dados Iniciais de Demonstração
Ao abrir o site pela primeira vez, o banco de dados é inicializado automaticamente com **4 produtos ativos** e **1 inativo** de exemplo, para que você possa ver a vitrine funcionando imediatamente sem precisar cadastrar tudo do zero.
