# 📑 Crom Markdown Editor App

Um **editor de Markdown** multiplataforma feito com **Electron**, com suporte a **pré-visualização em tempo real**, **explorador de arquivos/pastas**, **drag & drop**, e integração com **IA (Gemini API)** para auxiliar na edição de textos.

---

## 🚀 Funcionalidades

* 📝 **Editor de Markdown** com pré-visualização em tempo real
* 📂 **Explorador de arquivos e pastas** (com suporte ao File System Access API ou fallback via input)
* ✨ **Atalhos úteis** (`Ctrl+S`, `Ctrl+B`, `Ctrl+I`)
* 🗂️ Criar, renomear e excluir arquivos e pastas
* 📥 Salvar no disco ou gerar download no modo fallback
* 🎨 Tema claro/escuro
* 🤖 **Integração com Gemini AI**: aplique instruções no arquivo aberto e receba o conteúdo revisado em Markdown

---

## 🛠️ Pré-requisitos

* [Node.js](https://nodejs.org) instalado (versão 18 ou superior recomendada)
* [Git](https://git-scm.com/) (opcional, para clonar o repositório)

---

## 📦 Instalação e uso em desenvolvimento

1. Clone o repositório ou baixe os arquivos:

   ```bash
   git clone https://github.com/MrJs01/crom-markdown-editor-app.git
   cd crom-markdown-editor-app
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Rode o app em modo desenvolvimento:

   ```bash
   npm start
   ```

---

## 🏗️ Gerar instalador para Windows

O projeto já está configurado com **electron-builder** no `package.json`.
Para gerar o instalador `.exe`:

1. Execute:

   ```bash
   npm run dist
   ```

2. O instalador será gerado na pasta:

   ```
   dist/
   ```

3. Basta rodar o `.exe` para instalar o editor no Windows.

---

## ⚙️ Configurações do App

Abra o menu **Configurações** dentro do app para:

* Definir **Gemini API Key**
* Alterar o **Model ID** usado
* Ativar/desativar **tema escuro**

---

## 📂 Estrutura do projeto

```
crom-markdown-editor-app/
├── main.js             # Processo principal do Electron
├── renderer.js         # Renderer process
├── package.json        # Configuração do projeto
├── www/                # Frontend da aplicação
│   ├── index.html      # Interface principal
│   ├── app.js          # Lógica da aplicação (explorador, editor, AI, etc.)
│   └── styles.css      # Estilos
└── dist/               # Pasta onde o instalador é gerado (após build)
```

---

## 📜 Licença

Este projeto está sob a licença **MIT**.
Autor: **MrJ**

Se possivel, colabore <3>

---
