import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Serve os arquivos do front-end (HTML, CSS, JS)
app.use(express.static(__dirname));

// Configuração do Multer para receber o arquivo PDF e campos de texto (apiKey) em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // limite de 15MB
});

// Modelos prioritários com fallback automático
const AVAILABLE_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

// Rota de extração da nota fiscal
app.post('/api/extrair-nota', upload.single('pdf'), async (req, res) => {
  try {
    const userApiKey = req.body?.apiKey?.trim();

    // Validação estrita da chave informada pelo usuário
    if (!userApiKey) {
      return res.status(400).json({
        error: 'Chave da API Gemini não informada.',
        details: 'É obrigatório inserir sua chave da API Gemini no campo no topo da página para processar a nota fiscal.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado.' });
    }

    console.log(`Recebida requisição de extração. Usando chave informada pelo usuário: ${userApiKey.substring(0, 8)}...`);

    // Inicializa a instância do Gemini exclusivamente com a chave fornecida pelo usuário
    const genAI = new GoogleGenerativeAI(userApiKey);

    const pdfBase64 = req.file.buffer.toString('base64');

    const prompt = `
    Você é um especialista em extração e processamento de documentos fiscais brasileiros (DANFE, NF-e, NFS-e, NFC-e) para um Sistema Administrativo-Financeiro (Contas a Pagar).

    Sua tarefa é analisar o arquivo PDF da nota fiscal fornecido e:
    1. Extrair rigorosamente todos os dados cadastrais e financeiros obrigatórios.
    2. INTERPRETAR e CLASSIFICAR a(s) DESPESA(S) com base nos produtos/serviços descritos na nota, associando a uma ou mais das CATEGORIAS OFICIAIS listadas abaixo.

    ==================================================
    TABELA DE CLASSIFICAÇÃO DE DESPESAS (Regra de Negócio):
    ==================================================
    - "INSUMOS AGRÍCOLAS": Sementes, Fertilizantes, Defensivos Agrícolas, Corretivos, Adubos.
    - "MANUTENÇÃO E OPERAÇÃO": Combustíveis (Diesel, Gasolina), Lubrificantes, Peças, Parafusos, Componentes Mecânicos, Manutenção de Máquinas e Equipamentos, Pneus, Filtros, Correias, Ferramentas e Utensílios.
    - "RECURSOS HUMANOS": Mão de Obra Temporária, Salários e Encargos, Treinamentos.
    - "SERVIÇOS OPERACIONAIS": Frete e Transporte, Colheita Terceirizada, Secagem e Armazenagem, Pulverização e Aplicação.
    - "INFRAESTRUTURA E UTILIDADES": Energia Elétrica, Arrendamento de Terras, Construções e Reformas, Materiais de Construção, Materiais Hidráulicos, Água.
    - "ADMINISTRATIVAS": Honorários (Contábeis, Advocatícios, Agronômicos), Despesas Bancárias, Material de Escritório, Softwares.
    - "SEGUROS E PROTEÇÃO": Seguro Agrícola, Seguro de Ativos (Máquinas/Veículos), Seguro Prestamista, EPIs.
    - "IMPOSTOS E TAXAS": ITR, IPTU, IPVA, INCRA-CCIR, Taxas Governamentais.
    - "INVESTIMENTOS": Aquisição de Máquinas e Implementos, Aquisição de Veículos, Aquisição de Imóveis, Infraestrutura Rural.

    ==================================================
    ESTRUTURA JSON ESTRITA DE RESPOSTA OBRIGATÓRIA:
    ==================================================
    {
      "fornecedor": {
        "razaoSocial": "Razão Social do emitente",
        "nomeFantasia": "Nome Fantasia (se houver, ou repetir Razão Social)",
        "cnpj": "CNPJ ou CPF do emitente formatado"
      },
      "faturado": {
        "nomeCompleto": "Nome Completo ou Razão Social do Destinatário/Comprador",
        "cpf": "CPF ou CNPJ do Destinatário formatado"
      },
      "numeroNotaFiscal": "Número da nota fiscal",
      "dataEmissao": "Data de emissão no formato YYYY-MM-DD",
      "descricaoProdutos": [
        "Descrição detalhada do produto 1",
        "Descrição detalhada do produto 2"
      ],
      "quantidadeParcelas": 1,
      "parcelas": [
        {
          "numero": 1,
          "dataVencimento": "YYYY-MM-DD",
          "valor": 0.0
        }
      ],
      "dataVencimento": "Data de vencimento principal no formato YYYY-MM-DD",
      "valorTotal": 0.0,
      "classificacaoDespesa": "Categoria principal (ex: MANUTENÇÃO E OPERAÇÃO)",
      "classificacoesDespesas": [
        "Categoria 1 (ex: MANUTENÇÃO E OPERAÇÃO)"
      ]
    }

    NOTAS ADICIONAIS:
    - Se a data de vencimento não for explicitamente informada na nota ou na fatura/duplicata, utilize a data de emissão ou 30 dias após emissão como padrão.
    - O campo 'classificacoesDespesas' deve ser um array com a(s) categoria(s) identificada(s), permitindo uma ou múltiplas classificações.
    - O campo 'quantidadeParcelas' deve ser um inteiro correspondente ao total de parcelas encontradas no array 'parcelas'.
    - Retorne APENAS o JSON válido puro, sem marcações ou textos adicionais.
    `;

    let lastError = null;
    let extractedData = null;

    // Tenta os modelos com fallback
    for (const modelName of AVAILABLE_MODELS) {
      try {
        console.log(`Tentando extração com o modelo ${modelName}...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          }
        });

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64
            }
          },
          prompt
        ]);

        const responseText = result.response.text().trim();
        const cleanJson = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        extractedData = JSON.parse(cleanJson);
        console.log(`✅ Sucesso na extração com o modelo ${modelName}!`);
        break;
      } catch (err) {
        console.warn(`Aviso: falha no modelo ${modelName}:`, err.message);
        lastError = err;
      }
    }

    if (!extractedData) {
      throw lastError || new Error('Não foi possível processar o documento com os modelos disponíveis.');
    }

    return res.json(extractedData);
  } catch (error) {
    console.error('Erro na extração com Gemini:', error);
    return res.status(500).json({
      error: 'Erro ao processar o PDF com a IA Gemini.',
      details: error.message
    });
  }
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}!`);
  console.log(`🔗 Acesse no navegador: http://localhost:${PORT}`);
});
