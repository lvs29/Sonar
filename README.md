# Sonar

Self-hosted music client para download e organização de músicas do Spotify.

## Descrição

O Sonar é um aplicativo desktop que permite:
- Buscar e baixar músicas do Spotify
- Organizar playlists
- Reproduzir músicas localmente
- Sincronizar playlists automaticamente

## Arquitetura

- **Backend**: Flask (Python) - API web e gerenciamento de downloads
- **Frontend**: Electron (Node.js) - Interface desktop
- **Banco de dados**: SQLite
- **Downloads**: yt-dlp + YouTube

## Dependências

Veja o arquivo [DEPENDENCIES.md](./DEPENDENCIES.md) para a lista completa.

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/lvs29/sonar
   cd Sonar
   ```

2. Instale as dependências do sistema:
   ```bash
   python3 sqlite3 ffmpeg nodejs npm yt-dlp
   ```

3. Instale dependências Node.js:
   ```bash
   cd client
   npm install
   cd ..
   ```

## Uso

**Opção 1 - Cliente Electron (recomendado):**

1. Inicie o frontend Electron:
   ```bash
   cd client
   npm start
   ```

2. Configure suas credenciais do Spotify na interface

**Opção 2 - Apenas Flask (interface web):**
1. Inicie o backend Flask:
   ```bash
   source venv/bin/activate
   python3 app.py
   ```

2. Acesse no navegador: http://localhost:8000

## Estrutura do Projeto

```
Sonar/
├── app.py              # Aplicação Flask principal
├── config.py           # Configurações do sistema
├── models/             # Modelos SQLAlchemy
│   ├── __init__.py
│   └── database.py
├── routes/             # Rotas da API Flask
│   ├── auth.py
│   ├── library.py
│   ├── media.py
│   ├── playlists.py
│   └── ui.py
├── services/           # Lógica de negócio
│   ├── downloader.py   # Gerenciador de downloads
│   ├── library.py      # Sincronização
│   └── spotify.py      # API Spotify
├── utils/              # Utilitários
│   └── token_manager.py
├── client/             # Frontend Electron
│   ├── main.js
│   ├── package.json
│   └── (outros arquivos frontend)
├── media/              # Mídias locais
│   ├── music/          # Arquivos MP3
│   └── covers/         # Capas dos álbuns
├── static/             # Arquivos estáticos Flask
└── sonar.db           # Banco de dados SQLite
```

## Configuração

O arquivo `config.json` é criado automaticamente com as configurações padrão:
- `host`: Endereço do servidor Flask (padrão: "0.0.0.0")
- `port`: Porta do servidor Flask (padrão: 8000)
- `yt_dlp_browser`: Navegador para cookies do yt-dlp (padrão: "chromium")

## Licença

MIT License
