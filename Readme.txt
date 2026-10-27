PROJETO ADMINISTRATIVO-FINANCEIRO - AVALIAÇÃO N2
==================================================

- Link Hospedagem:
https://extracao-nota-fiscal.onrender.com
(Ou acesse localmente em: http://localhost:3000)

- Login:
coordenador

- Senha:
admin123

- Key (LLM):git commit -am "Remove chave de API do versionamento publico"
[Chave enviada diretamente no anexo do Google Classroom por segurança]

- Código Última Atualização no GitHub:
8bbe7ae
(Este código também é exibido em destaque no topo e na tela principal do projeto)

==================================================
DESCRIÇÃO DAS ETAPAS IMPLEMENTADAS:
==================================================
1ª ETAPA:
- Upload e extração de dados fiscais (NF-e, DANFE, NFS-e) via PDF utilizando Google Gemini.
- Extração de Fornecedor (Razão Social, Nome Fantasia, CNPJ), Faturado (Nome Completo, CPF),
  Número da Nota, Data de Emissão, Vencimento, Valor Total, Produtos e Parcelas.
- Classificação automática da DESPESA interpretada pela IA nas categorias oficiais da N2.

2ª ETAPA:
- Banco de dados relacional SQLite integrado com as tabelas:
  PESSOAS, CLASSIFICACAO, MOVIMENTOCONTAS, MOVIMENTO_CLASSIFICACOES e PARCELACONTAS.
- Consulta prévia no Banco de Dados informando se FORNECEDOR, FATURADO e DESPESA existem ou não.
- Lançamento automático gerando os cadastros faltantes e o movimento no Contas a Pagar
  com identificação ÚNICA de parcelas.
- CRUDs completos com inativação lógica (status = INATIVO), reativação e busca por múltiplos campos.
- Tabelas de registros inicialmente vazias com carregamento sob demanda via busca ou botão 'Todos' (status = ATIVO).
