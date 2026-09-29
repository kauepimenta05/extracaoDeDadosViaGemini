// Elementos do DOM
const apiKeyInput = document.getElementById('api-key-input');
const btnToggleKey = document.getElementById('btn-toggle-key');
const eyeIcon = document.getElementById('eye-icon');

const pdfInput = document.getElementById('pdf-input');
const fileInputText = document.getElementById('file-input-text');
const fileSelectedBox = document.getElementById('file-selected-box');
const fileNameDisplay = document.getElementById('file-name-display');
const fileSizeDisplay = document.getElementById('file-size-display');
const btnExtract = document.getElementById('btn-extract');
const btnExtractText = document.getElementById('btn-extract-text');
const resultCard = document.getElementById('result-card');
const jsonCodeOutput = document.getElementById('json-code-output');
const btnCopy = document.getElementById('btn-copy');
const btnCopyText = document.getElementById('btn-copy-text');
const formattedOutput = document.getElementById('formatted-output');

const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// 0. Carrega chave salva localmente no navegador (se houver)
const savedApiKey = localStorage.getItem('user_gemini_api_key');
if (savedApiKey) {
  apiKeyInput.value = savedApiKey;
}

// Alternar visibilidade da chave (mostrar / ocultar)
btnToggleKey.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  eyeIcon.innerHTML = isPassword
    ? `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>`
    : `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`;
});

// Salvar chave no LocalStorage ao digitar
apiKeyInput.addEventListener('input', () => {
  localStorage.setItem('user_gemini_api_key', apiKeyInput.value.trim());
});

// 1. Manipulação do Upload do Arquivo (Estado 1 -> Estado 2)
pdfInput.addEventListener('change', (event) => {
  const file = event.target.files[0];

  if (file) {
    fileInputText.textContent = file.name;
    fileNameDisplay.textContent = file.name;
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    fileSizeDisplay.textContent = `${sizeInMB} MB`;
    fileSelectedBox.style.display = 'flex';

    btnExtract.disabled = false;
    btnExtract.classList.add('active');
  } else {
    fileInputText.textContent = 'Nenhum arquivo escolhido';
    fileSelectedBox.style.display = 'none';
    btnExtract.disabled = true;
    btnExtract.classList.remove('active');
  }
});

// 2. Ação de Extrair Dados via Backend / API Gemini (Estado 2 -> Estado 3)
btnExtract.addEventListener('click', async () => {
  const file = pdfInput.files[0];
  const userApiKey = apiKeyInput.value.trim();

  // Validação no front-end
  if (!userApiKey) {
    alert('Por favor, informe sua Chave da API Gemini antes de extrair os dados.');
    apiKeyInput.focus();
    return;
  }

  if (!file) {
    alert('Por favor, selecione um arquivo PDF de nota fiscal.');
    return;
  }

  // Feedback de carregamento
  btnExtractText.textContent = 'EXTRAINDO DADOS COM GEMINI...';
  btnExtract.disabled = true;

  try {
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('apiKey', userApiKey);

    // Faz a chamada para a rota do nosso servidor Node.js
    const response = await fetch('/api/extrair-nota', {
      method: 'POST',
      body: formData,
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(responseData.error || responseData.details || `Erro do servidor: ${response.status}`);
    }

    // Recebe os dados reais extraídos pela IA do Gemini
    const extractedData = responseData;

    // Renderiza o JSON e a visualização formatada
    renderJSON(extractedData);
    renderFormattedView(extractedData);

    // Exibe o card de resultado
    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (error) {
    console.error('Erro ao extrair dados:', error);
    alert(`Erro ao extrair dados: ${error.message}`);
  } finally {
    btnExtractText.textContent = 'EXTRAIR DADOS';
    btnExtract.disabled = false;
  }
});

// 3. Renderização do JSON no bloco de código
function renderJSON(data) {
  jsonCodeOutput.textContent = JSON.stringify(data, null, 2);
}

// 4. Renderização na aba de "Visualização Formatada" (Conforme Requisitos N2)
function renderFormattedView(data) {
  const produtosHtml = Array.isArray(data.descricaoProdutos) && data.descricaoProdutos.length > 0
    ? data.descricaoProdutos.map((desc, idx) => `
        <li style="margin-bottom: 6px; padding: 4px 8px; background: #ffffff; border-radius: 4px; border: 1px solid #e2e8f0;">
          <strong>Produto ${idx + 1}:</strong> ${desc}
        </li>
      `).join('')
    : '<div class="formatted-item">Nenhum produto identificado.</div>';

  const parcelasHtml = Array.isArray(data.parcelas) && data.parcelas.length > 0
    ? data.parcelas.map(p => `
        <div class="formatted-item" style="padding: 4px 0;">
          • <strong>Parcela ${p.numero || 1}:</strong> Vencimento: ${p.dataVencimento || data.dataVencimento || '-'} | Valor: R$ ${(p.valor ?? data.valorTotal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      `).join('')
    : `<div class="formatted-item">• Parcela 1: Vencimento: ${data.dataVencimento || '-'} | Valor: R$ ${(data.valorTotal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>`;

  const categorias = Array.isArray(data.classificacoesDespesas) && data.classificacoesDespesas.length > 0
    ? data.classificacoesDespesas
    : [data.classificacaoDespesa || 'NÃO CLASSIFICADO'];

  const categoriasBadges = categorias.map(c => `
    <span style="display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; margin-right: 6px; margin-top: 4px; border: 1px solid #bae6fd;">
      🏷️ ${c}
    </span>
  `).join('');

  formattedOutput.innerHTML = `
    <!-- Classificação de Despesa (Interpretada por IA) -->
    <div class="formatted-section" style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
      <div class="formatted-section-title" style="color: #166534; font-size: 0.95rem;">
        🧠 Classificação da DESPESA (Interpretada por IA):
      </div>
      <div>${categoriasBadges}</div>
    </div>

    <!-- Fornecedor -->
    <div class="formatted-section">
      <div class="formatted-section-title">🏢 Fornecedor (Emitente)</div>
      <div class="formatted-grid">
        <div class="formatted-item"><strong>Razão Social:</strong> ${data.fornecedor?.razaoSocial || '-'}</div>
        <div class="formatted-item"><strong>Nome Fantasia:</strong> ${data.fornecedor?.nomeFantasia || '-'}</div>
        <div class="formatted-item"><strong>CNPJ:</strong> ${data.fornecedor?.cnpj || '-'}</div>
      </div>
    </div>

    <!-- Faturado -->
    <div class="formatted-section">
      <div class="formatted-section-title">👤 Faturado (Destinatário)</div>
      <div class="formatted-grid">
        <div class="formatted-item"><strong>Nome Completo:</strong> ${data.faturado?.nomeCompleto || '-'}</div>
        <div class="formatted-item"><strong>CPF/CNPJ:</strong> ${data.faturado?.cpf || '-'}</div>
      </div>
    </div>

    <!-- Dados da Nota Fiscal e Financeiro -->
    <div class="formatted-section">
      <div class="formatted-section-title">📄 Dados da Nota Fiscal</div>
      <div class="formatted-grid">
        <div class="formatted-item"><strong>Número da Nota:</strong> ${data.numeroNotaFiscal || '-'}</div>
        <div class="formatted-item"><strong>Data de Emissão:</strong> ${data.dataEmissao || '-'}</div>
        <div class="formatted-item"><strong>Data de Vencimento:</strong> ${data.dataVencimento || '-'}</div>
        <div class="formatted-item"><strong>Valor Total:</strong> R$ ${(data.valorTotal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="formatted-item"><strong>Qtd. de Parcelas:</strong> ${data.quantidadeParcelas || (data.parcelas ? data.parcelas.length : 1)}</div>
      </div>
    </div>

    <!-- Parcelas Detalhadas -->
    <div class="formatted-section">
      <div class="formatted-section-title">💳 Parcelas</div>
      ${parcelasHtml}
    </div>

    <!-- Descrição dos Produtos -->
    <div class="formatted-section">
      <div class="formatted-section-title">📦 Descrição dos Produtos</div>
      <ul style="list-style: none; padding-left: 0; margin-top: 6px;">
        ${produtosHtml}
      </ul>
    </div>
  `;
}

// 5. Alternância de Abas (JSON / Visualização Formatada)
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => (c.style.display = 'none'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    document.getElementById(targetId).style.display = 'block';
  });
});

// 6. Botão de Copiar JSON para a área de transferência
btnCopy.addEventListener('click', async () => {
  const jsonText = jsonCodeOutput.textContent;
  if (!jsonText) return;

  try {
    await navigator.clipboard.writeText(jsonText);
    btnCopyText.textContent = 'Copiado!';
    setTimeout(() => {
      btnCopyText.textContent = 'Copiar JSON';
    }, 2000);
  } catch (err) {
    console.error('Falha ao copiar:', err);
  }
});
