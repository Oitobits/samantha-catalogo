/**
 * carrinho.js - Lógica da página de carrinho e geração de PDF
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Referências do DOM
    const cartItemsContainer = document.getElementById('cartItemsContainer');
    const cartSummaryCard = document.getElementById('cartSummaryCard');
    const summaryTotalItems = document.getElementById('summaryTotalItems');
    const summaryTotalPrice = document.getElementById('summaryTotalPrice');
    const checkoutForm = document.getElementById('checkoutForm');
    const clientNameInput = document.getElementById('clientName');
    const clientPhoneInput = document.getElementById('clientPhone');
    const successBlock = document.getElementById('successBlock');
    const btnDownloadAgain = document.getElementById('btnDownloadAgain');
    const btnClearCartSuccess = document.getElementById('btnClearCartSuccess');

    // Referências do PDF Template
    const pdfTemplate = document.getElementById('pdfTemplate');
    const pdfDate = document.getElementById('pdfDate');
    const pdfClientName = document.getElementById('pdfClientName');
    const pdfClientPhone = document.getElementById('pdfClientPhone');
    const pdfItemsBody = document.getElementById('pdfItemsBody');
    const pdfSubtotal = document.getElementById('pdfSubtotal');
    const pdfTotal = document.getElementById('pdfTotal');

    let cart = [];

    // Máscara de Telefone (00) 00000-0000
    if (clientPhoneInput) {
        clientPhoneInput.addEventListener('input', (e) => {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }

    // Inicialização da página
    loadCart();

    // Carrega o carrinho e renderiza os itens
    async function loadCart() {
        try {
            cart = JSON.parse(localStorage.getItem('samantha_cart')) || [];
        } catch (e) {
            cart = [];
        }

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                    <h3>Seu carrinho está vazio</h3>
                    <p>Volte à vitrine e escolha produtos para adicionar ao seu pedido.</p>
                    <a href="index.html" class="btn btn-primary" style="margin-top: 1rem; display: inline-flex;">Voltar à Vitrine</a>
                </div>
            `;
            cartSummaryCard.style.display = 'none';
            return;
        }

        cartItemsContainer.innerHTML = '';
        cartSummaryCard.style.display = 'block';

        // Renderiza cada item carregando a imagem atualizada
        for (const item of cart) {
            let imageSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1" style="background:%23f8fafc"><rect width="24" height="24" rx="2"/></svg>';
            try {
                const dbProduct = await getProductById(item.id);
                if (dbProduct) {
                    // Sincroniza dados caso o administrador tenha editado preço/nome
                    item.nome = dbProduct.nome || item.nome;
                    item.preco = dbProduct.preco !== undefined ? dbProduct.preco : item.preco;
                    item.codigo = dbProduct.codigo || item.codigo;
                    item.referencia = dbProduct.referencia || item.referencia;
                    
                    if (dbProduct.imagens && dbProduct.imagens.length > 0) {
                        imageSrc = dbProduct.imagens[0];
                    } else if (dbProduct.imagem) {
                        imageSrc = dbProduct.imagem;
                    }
                }
            } catch (err) {
                console.warn(`Erro ao buscar produto com ID ${item.id} do banco:`, err);
            }

            const itemTotalPrice = item.preco * item.quantidade;

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '1rem';
            row.style.backgroundColor = 'var(--card-bg)';
            row.style.border = '1px solid var(--border)';
            row.style.borderRadius = 'var(--radius-md)';
            row.style.padding = '1rem';
            row.style.boxShadow = 'var(--shadow-sm)';
            row.style.flexWrap = 'wrap';

            row.innerHTML = `
                <img src="${imageSrc}" alt="${item.nome}" style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); background-color: #f8fafc;">
                
                <div style="flex: 1; min-width: 150px;">
                    <div style="font-size: 0.8rem; color: var(--text-light); font-weight: 600;">CÓD: ${item.codigo || 'S/C'} | REF: ${item.referencia || 'S/R'}</div>
                    <h4 style="font-size: 0.95rem; font-weight: bold; color: var(--text-main); margin: 0.15rem 0;">${item.nome}</h4>
                    <div style="font-size: 0.9rem; color: var(--primary); font-weight: bold;">R$ ${item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                    <!-- Controles de Quantidade -->
                    <div class="quantity-selector" style="display: flex; align-items: center; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; background: #fff;">
                        <button type="button" class="btn btn-secondary btn-dec" data-id="${item.id}" style="padding: 0.35rem 0.75rem; border: none; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 0;">-</button>
                        <input type="number" class="qty-input" value="${item.quantidade}" style="width: 40px; text-align: center; border: none; height: 32px; font-weight: bold; font-size: 0.9rem; outline: none;" readonly>
                        <button type="button" class="btn btn-secondary btn-inc" data-id="${item.id}" style="padding: 0.35rem 0.75rem; border: none; height: 32px; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 0;">+</button>
                    </div>

                    <div style="font-size: 1rem; font-weight: bold; color: var(--text-main); min-width: 90px; text-align: right;">
                        R$ ${itemTotalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <button type="button" class="btn btn-danger btn-sm btn-remove" data-id="${item.id}" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; border-radius: var(--radius-sm);">
                        Excluir
                    </button>
                </div>
            `;

            // Configura os escutadores de eventos
            row.querySelector('.btn-dec').addEventListener('click', (e) => {
                updateItemQty(e.target.dataset.id, -1);
            });
            row.querySelector('.btn-inc').addEventListener('click', (e) => {
                updateItemQty(e.target.dataset.id, 1);
            });
            row.querySelector('.btn-remove').addEventListener('click', (e) => {
                removeItem(e.target.dataset.id);
            });

            cartItemsContainer.appendChild(row);
        }

        updateTotals();
    }

    // Altera a quantidade de itens de um produto
    function updateItemQty(id, change) {
        const item = cart.find(i => String(i.id) === String(id));
        if (item) {
            item.quantidade = (parseInt(item.quantidade) || 1) + change;
            if (item.quantidade < 1) item.quantidade = 1;
            
            localStorage.setItem('samantha_cart', JSON.stringify(cart));
            loadCart();
        }
    }

    // Exclui item do carrinho
    function removeItem(id) {
        cart = cart.filter(i => String(i.id) !== String(id));
        localStorage.setItem('samantha_cart', JSON.stringify(cart));
        loadCart();
    }

    // Recalcula totais gerais
    function updateTotals() {
        const totalItems = cart.reduce((acc, item) => acc + (parseInt(item.quantidade) || 0), 0);
        const totalPrice = cart.reduce((acc, item) => acc + (item.preco * (parseInt(item.quantidade) || 0)), 0);

        summaryTotalItems.textContent = totalItems;
        summaryTotalPrice.textContent = `R$ ${totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Função auxiliar para gerar e baixar o PDF
    async function generatePDF() {
        const nome = clientNameInput.value.trim();
        const telefone = clientPhoneInput.value.trim();

        // Preenche o template de PDF
        pdfClientName.textContent = nome;
        pdfClientPhone.textContent = telefone;
        pdfDate.textContent = new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        pdfItemsBody.innerHTML = '';
        let totalGeral = 0;

        cart.forEach(item => {
            const sub = item.preco * item.quantidade;
            totalGeral += sub;

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f1f5f9';
            tr.innerHTML = `
                <td style="padding: 0.75rem 0.5rem; font-size: 0.9rem; color: #475569;">
                    ${item.codigo || '-'}<br>
                    <span style="font-size: 0.75rem; color: #94a3b8;">REF: ${item.referencia || '-'}</span>
                </td>
                <td style="padding: 0.75rem 0.5rem; font-size: 0.95rem; font-weight: 500; color: #1e293b;">${item.nome}</td>
                <td style="padding: 0.75rem 0.5rem; font-size: 0.95rem; text-align: right; color: #1e293b; font-weight: bold;">${item.quantidade}</td>
                <td style="padding: 0.75rem 0.5rem; font-size: 0.95rem; text-align: right; color: #475569;">
                    R$ ${item.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td style="padding: 0.75rem 0.5rem; font-size: 0.95rem; text-align: right; color: #1e293b; font-weight: bold;">
                    R$ ${sub.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
            `;
            pdfItemsBody.appendChild(tr);
        });

        const formattedTotal = `R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        pdfSubtotal.textContent = formattedTotal;
        pdfTotal.textContent = formattedTotal;

        const options = {
            margin: 0.5,
            filename: `pedido-samantha-${nome.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        await html2pdf().set(options).from(pdfTemplate).save();
    }

    // Fechamento de Pedido
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = clientNameInput.value.trim();
        const telefone = clientPhoneInput.value.trim();

        if (!nome || !telefone) {
            alert('Por favor, preencha todos os campos obrigatórios!');
            return;
        }

        const submitBtn = checkoutForm.querySelector('button[type="submit"]');
        const origBtnHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Gerando seu PDF...`;

        try {
            await generatePDF();
            
            // Sucesso! Oculta formulário e exibe o bloco de opções de sucesso
            checkoutForm.style.display = 'none';
            if (successBlock) successBlock.style.display = 'block';
        } catch (err) {
            console.error('Erro ao gerar o PDF:', err);
            alert('Ocorreu um erro ao gerar o seu pedido em PDF. Por favor, tente novamente.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnHtml;
        }
    });

    // Baixar novamente
    if (btnDownloadAgain) {
        btnDownloadAgain.addEventListener('click', async () => {
            btnDownloadAgain.disabled = true;
            const origText = btnDownloadAgain.textContent;
            btnDownloadAgain.textContent = 'Gerando...';
            try {
                await generatePDF();
            } catch (err) {
                console.error('Erro ao gerar o PDF novamente:', err);
                alert('Erro ao gerar o PDF novamente.');
            } finally {
                btnDownloadAgain.disabled = false;
                btnDownloadAgain.textContent = origText;
            }
        });
    }

    // Limpar carrinho e voltar
    if (btnClearCartSuccess) {
        btnClearCartSuccess.addEventListener('click', () => {
            localStorage.removeItem('samantha_cart');
            alert('Carrinho limpo! Redirecionando para a vitrine.');
            window.location.href = 'index.html';
        });
    }
});
