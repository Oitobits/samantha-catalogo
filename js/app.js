/**
 * app.js - Lógica do Catálogo de Clientes para Samantha Catálogo
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Referências do DOM
    const productsContainer = document.getElementById('productsContainer');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const categoriesBar = document.getElementById('categoriesBar');
    
    // Modal de Detalhes
    const detailsModal = document.getElementById('detailsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalImage = document.getElementById('modalImage');
    const modalCode = document.getElementById('modalCode');
    const modalRef = document.getElementById('modalRef');
    const modalTitle = document.getElementById('modalTitle');
    const modalDescription = document.getElementById('modalDescription');
    const modalPrice = document.getElementById('modalPrice');

    // Estado local da aplicação
    let allProducts = [];
    let filteredProducts = [];
    let categories = [];
    let activeCategoryId = 'all'; // 'all', 'none' ou id da categoria

    // Inicialização da base de dados e carregamento dos produtos
    try {
        await loadCatalog();
    } catch (error) {
        console.error('Falha ao inicializar o banco de dados:', error);
        productsContainer.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h3>Erro no Banco de Dados</h3>
                <p>Não foi possível carregar o banco de dados local. Detalhes: ${error.message || error}</p>
            </div>
        `;
    }

    // Carrega dados da base de dados local
    async function loadCatalog() {
        allProducts = await getAllProducts();
        try {
            categories = await getAllCategories();
            categories.sort((a, b) => a.nome.localeCompare(b.nome));
        } catch (err) {
            console.error('Erro ao carregar categorias na vitrine:', err);
        }
        
        renderCategoryPills();
        applyFiltersAndSort();
    }

    // Renderiza os botões (pills) de categorias no catálogo
    function renderCategoryPills() {
        categoriesBar.innerHTML = '';
        if (categories.length === 0) {
            categoriesBar.style.display = 'none';
            return;
        }
        categoriesBar.style.display = 'flex';

        // Botão "Todas"
        const btnAll = document.createElement('button');
        btnAll.className = `category-pill ${activeCategoryId === 'all' ? 'active' : ''}`;
        const totalCount = allProducts.filter(p => p.status === 'ativo').length;
        btnAll.innerHTML = `Todas <span class="category-count">${totalCount}</span>`;
        btnAll.addEventListener('click', () => {
            activeCategoryId = 'all';
            updateActivePill();
            applyFiltersAndSort();
        });
        categoriesBar.appendChild(btnAll);

        // Botões para cada categoria
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `category-pill ${activeCategoryId === String(cat.id) ? 'active' : ''}`;
            const count = allProducts.filter(p => p.status === 'ativo' && String(p.categoriaId) === String(cat.id)).length;
            btn.innerHTML = `${cat.nome} <span class="category-count">${count}</span>`;
            btn.addEventListener('click', () => {
                activeCategoryId = String(cat.id);
                updateActivePill();
                applyFiltersAndSort();
            });
            categoriesBar.appendChild(btn);
        });

        // Botão "Outros" (Sem Categoria) se houver algum produto ativo sem categoria
        const unassignedCount = allProducts.filter(p => p.status === 'ativo' && !p.categoriaId).length;
        if (unassignedCount > 0) {
            const btnNone = document.createElement('button');
            btnNone.className = `category-pill ${activeCategoryId === 'none' ? 'active' : ''}`;
            btnNone.innerHTML = `Outros <span class="category-count">${unassignedCount}</span>`;
            btnNone.addEventListener('click', () => {
                activeCategoryId = 'none';
                updateActivePill();
                applyFiltersAndSort();
            });
            categoriesBar.appendChild(btnNone);
        }
    }

    function updateActivePill() {
        const pills = categoriesBar.querySelectorAll('.category-pill');
        if (pills.length === 0) return;
        
        pills.forEach(pill => pill.classList.remove('active'));

        const index = activeCategoryId === 'all' ? 0 : 
                      activeCategoryId === 'none' ? pills.length - 1 :
                      categories.findIndex(c => String(c.id) === activeCategoryId) + 1;
        
        if (pills[index]) {
            pills[index].classList.add('active');
        }
    }

    // Auxiliar: Extrai o título e a descrição amigável a partir da descrição cadastrada
    function parseProductText(fullDesc) {
        if (!fullDesc) return { title: 'Sem descrição', details: '' };
        
        // Se houver um traço " - ", tratamos o lado esquerdo como título e o direito como detalhes
        const parts = fullDesc.split(/\s+-\s+/);
        if (parts.length > 1) {
            return {
                title: parts[0].trim(),
                details: parts.slice(1).join(' - ').trim()
            };
        }
        
        // Caso contrário, pega as primeiras 4 palavras como título e o restante como detalhes
        const words = fullDesc.split(/\s+/);
        if (words.length > 5) {
            const title = words.slice(0, 4).join(' ');
            const details = words.slice(4).join(' ');
            return { title: title + '...', details: fullDesc };
        }
        
        return { title: fullDesc, details: fullDesc };
    }

    // Auxiliar: Retorna o título amigável do produto (usa campo nome ou fallback)
    function getProductTitle(produto) {
        return produto.nome || parseProductText(produto.descricao).title;
    }

    // Filtra e ordena os produtos baseado nas escolhas do usuário
    function applyFiltersAndSort() {
        const query = searchInput.value.toLowerCase().trim();
        const sortBy = sortSelect.value;

        // 1. Filtrar ativos
        let result = allProducts.filter(p => p.status === 'ativo');

        // 1.5. Filtrar por categoria ativa
        if (activeCategoryId === 'none') {
            result = result.filter(p => !p.categoriaId);
        } else if (activeCategoryId !== 'all') {
            result = result.filter(p => String(p.categoriaId) === activeCategoryId);
        }

        // 2. Aplicar busca por texto (nome, código, referência, descrição)
        if (query) {
            result = result.filter(p => 
                (p.nome && p.nome.toLowerCase().includes(query)) ||
                (p.codigo && p.codigo.toLowerCase().includes(query)) ||
                (p.referencia && p.referencia.toLowerCase().includes(query)) ||
                (p.descricao && p.descricao.toLowerCase().includes(query))
            );
        }

        // 3. Aplicar ordenação
        if (sortBy === 'price-asc') {
            result.sort((a, b) => a.preco - b.preco);
        } else if (sortBy === 'price-desc') {
            result.sort((a, b) => b.preco - a.preco);
        } else if (sortBy === 'alpha-asc') {
            result.sort((a, b) => {
                const titleA = getProductTitle(a).toLowerCase();
                const titleB = getProductTitle(b).toLowerCase();
                return titleA.localeCompare(titleB);
            });
        } else if (sortBy === 'alpha-desc') {
            result.sort((a, b) => {
                const titleA = getProductTitle(a).toLowerCase();
                const titleB = getProductTitle(b).toLowerCase();
                return titleB.localeCompare(titleA);
            });
        }

        filteredProducts = result;
        renderProducts();
    }

    // Renderiza a lista de produtos na tela
    function renderProducts() {
        productsContainer.innerHTML = '';

        if (filteredProducts.length === 0) {
            productsContainer.innerHTML = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <h3>Nenhum produto encontrado</h3>
                    <p>Tente alterar os termos da busca ou ajustar a ordenação.</p>
                </div>
            `;
            return;
        }

        filteredProducts.forEach(produto => {
            const displayTitle = getProductTitle(produto);
            
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.id = produto.id;
            
            // Tratamento da imagem (se não houver, usa um placeholder SVG)
            const imgSrc = produto.imagem || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1" style="background:%23f8fafc"><rect width="24" height="24" rx="2"/></svg>';

            card.innerHTML = `
                <div class="product-image-container">
                    <img src="${imgSrc}" alt="${displayTitle}" loading="lazy">
                </div>
                <div class="product-info">
                    <div class="product-meta">
                        <span class="product-code">CÓD: ${produto.codigo || 'S/C'}</span>
                        <span class="product-ref">${produto.referencia || 'S/R'}</span>
                    </div>
                    <h3 class="product-desc" title="${displayTitle}">${displayTitle}</h3>
                    <div class="product-footer">
                        <span class="product-price">R$ ${produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span class="badge badge-success" style="font-size: 0.7rem; font-weight: 500;">Disponível</span>
                    </div>
                </div>
            `;

            // Adiciona evento de clique para exibir detalhes no modal
            card.addEventListener('click', () => showProductDetails(produto));

            productsContainer.appendChild(card);
        });
    }

    // Abre o modal com os detalhes do produto
    function showProductDetails(produto) {
        const displayTitle = getProductTitle(produto);
        const displayDescription = produto.nome ? (produto.descricao || '') : (parseProductText(produto.descricao).details || produto.descricao || '');
        const imgSrc = produto.imagem || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1" style="background:%23f8fafc"><rect width="24" height="24" rx="2"/></svg>';

        modalImage.src = imgSrc;
        modalImage.alt = displayTitle;
        modalCode.textContent = `Código: ${produto.codigo || 'Não informado'}`;
        modalRef.textContent = `Ref: ${produto.referencia || 'Não informado'}`;
        modalTitle.textContent = displayTitle;
        
        // Exibe ou esconde a descrição dependendo do conteúdo
        const descTitleElement = document.querySelector('.modal-desc-title');
        if (displayDescription) {
            modalDescription.textContent = displayDescription;
            modalDescription.style.display = 'block';
            if (descTitleElement) descTitleElement.style.display = 'block';
        } else {
            modalDescription.textContent = '';
            modalDescription.style.display = 'none';
            if (descTitleElement) descTitleElement.style.display = 'none';
        }
        
        modalPrice.textContent = `R$ ${produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        detailsModal.classList.add('open');
        document.body.style.overflow = 'hidden'; // Impede scroll do body
    }

    // Fecha o modal
    function closeModal() {
        detailsModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    // Eventos
    searchInput.addEventListener('input', applyFiltersAndSort);
    sortSelect.addEventListener('change', applyFiltersAndSort);
    closeModalBtn.addEventListener('click', closeModal);

    // Fechar ao clicar fora do conteúdo do modal
    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            closeModal();
        }
    });

    // Fechar com a tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailsModal.classList.contains('open')) {
            closeModal();
        }
    });
});
