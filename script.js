// Elementos do DOM
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

// Exemplo inicial de JSON extraído (modelo dos prints)
const sampleExtractedData = {
  "numero": "000123456",
  "serie": "001",
  "dataEmissao": "2024-01-15",
  "fornecedor": {
    "nome": "EMPRESA FORNECEDORA LTDA",
    "cnpj": "12.345.678/0001-90",
    "endereco": "Rua das Empresas, 123 - São Paulo, SP"
  },
  "cliente": {
    "nome": "CLIENTE EXEMPLO S.A.",
    "cnpj": "98.765.432/0001-10",
    "endereco": "Av. dos Clientes, 456 - Rio de Janeiro, RJ"
  },
  "itens": [
    {
      "descricao": "Produto A",
      "quantidade": 10,
      "valorUnitario": 25.5
    }
  ]
};

// 1. Manipulação do Upload do Arquivo (Estado 1 -> Estado 2)
pdfInput.addEventListener('change', (event) => {
  const file = event.target.files[0];

  if (file) {
    // Atualiza texto do input
    fileInputText.textContent = file.name;

    // Exibe caixa de arquivo selecionado com detalhes
    fileNameDisplay.textContent = file.name;
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    fileSizeDisplay.textContent = `${sizeInMB} MB`;
    fileSelectedBox.style.display = 'flex';

    // Ativa o botão de Extrair Dados
    btnExtract.disabled = false;
    btnExtract.classList.add('active');
  } else {
    // Volta para o estado inicial se remover/cancelar seleção
    fileInputText.textContent = 'Nenhum arquivo escolhido';
    fileSelectedBox.style.display = 'none';
    btnExtract.disabled = true;
    btnExtract.classList.remove('active');
  }
});

// 2. Ação de Extrair Dados (Estado 2 -> Estado 3)
btnExtract.addEventListener('click', async () => {
  const file = pdfInput.files[0];
  if (!file) return;

  // Feedback de carregamento (você pode customizar como preferir)
  btnExtractText.textContent = 'EXTRAINDO DADOS...';
  btnExtract.disabled = true;

  try {
    /* ==========================================================================
       AQUI É ONDE VOCÊ IRÁ CONECTAR O SEU BACKEND / API DO GEMINI
       Exemplo:
       const formData = new FormData();
       formData.append('pdf', file);
       const response = await fetch('/api/extrair-nota', { method: 'POST', body: formData });
       const extractedData = await response.json();
    ========================================================================== */
    
    // Simulação visual de resposta da API
    await new Promise((resolve) => setTimeout(resolve, 800));
    const extractedData = sampleExtractedData;

    // Renderiza o JSON
    renderJSON(extractedData);
    renderFormattedView(extractedData);

    // Exibe o card de resultado
    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (error) {
    console.error('Erro ao extrair dados:', error);
    alert('Ocorreu um erro ao extrair os dados da nota fiscal.');
  } finally {
    btnExtractText.textContent = 'EXTRAIR DADOS';
    btnExtract.disabled = false;
  }
});

// 3. Renderização do JSON no terminal/bloco de código
function renderJSON(data) {
  jsonCodeOutput.textContent = JSON.stringify(data, null, 2);
}

// Renderização simples para a aba de "Visualização Formatada"
function renderFormattedView(data) {
  formattedOutput.innerHTML = `
    <div class="formatted-section">
      <div class="formatted-section-title">Informações Gerais</div>
      <div class="formatted-grid">
        <div class="formatted-item"><strong>Número:</strong> ${data.numero || '-'}</div>
        <div class="formatted-item"><strong>Série:</strong> ${data.serie || '-'}</div>
        <div class="formatted-item"><strong>Data de Emissão:</strong> ${data.dataEmissao || '-'}</div>
      </div>
    </div>
    <div class="formatted-section">
      <div class="formatted-section-title">Fornecedor</div>
      <div class="formatted-item"><strong>Nome:</strong> ${data.fornecedor?.nome || '-'}</div>
      <div class="formatted-item"><strong>CNPJ:</strong> ${data.fornecedor?.cnpj || '-'}</div>
      <div class="formatted-item"><strong>Endereço:</strong> ${data.fornecedor?.endereco || '-'}</div>
    </div>
    <div class="formatted-section">
      <div class="formatted-section-title">Cliente</div>
      <div class="formatted-item"><strong>Nome:</strong> ${data.cliente?.nome || '-'}</div>
      <div class="formatted-item"><strong>CNPJ:</strong> ${data.cliente?.cnpj || '-'}</div>
      <div class="formatted-item"><strong>Endereço:</strong> ${data.cliente?.endereco || '-'}</div>
    </div>
  `;
}

// 4. Alternância de Abas (JSON / Visualização Formatada)
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => (c.style.display = 'none'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    document.getElementById(targetId).style.display = 'block';
  });
});

// 5. Botão de Copiar JSON para a área de transferência
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
