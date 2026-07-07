window.TRANSLATIONS = {
  it: {
    nav: {
      brandSub: 'Documentazione v0.3',
      navSection: 'Guida',
      navOverview: 'Panoramica',
      navConfig: 'Configurazione',
      navCommands: 'Comandi',
      navProblems: 'Problemi & soluzioni',
      searchPlaceholder: 'Cerca nella docs…',
      searchNoResults: 'Nessun comando corrisponde alla ricerca.',
      copyLabel: 'Copia',
      copiedLabel: 'Copiato!',
    },
    pages: {
      index: {
        title: 'skillctl — Documentazione',
        html: `
<section class="hero">
  <div class="hero-glow"></div>
  <div class="hero-content">
    <p class="hero-badge">v0.3 · Agent Skills</p>
    <h1 class="hero-title">skillctl</h1>
    <p class="hero-lead">CLI universale in stile package manager per gestire <strong>Agent Skills</strong> su più agenti di coding AI.</p>
    <div class="hero-terminal">
      <div class="terminal-bar">
        <span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-dot"></span>
        <span class="terminal-label">~/my-project</span>
      </div>
      <pre class="terminal-body"><code id="hero-cmd">skillctl init</code><span class="terminal-cursor"></span></pre>
    </div>
  </div>
</section>

<div class="alert alert-info">
  <strong>Versione 0.3</strong>
  Store canonico in <code>~/.skillctl/skills/</code>, manifest dichiarativo, <code>import from-project</code> per migrare skill da <code>.codex/skills</code> e altre directory agente, link relativi portabili in git, sincronizzazione verso Claude Code, Cursor, OpenCode, Codex, Gemini CLI e altri agenti <a href="https://agentskills.io" target="_blank" rel="noopener">agentskills.io</a>.
</div>

<h2>Cos'è skillctl</h2>
<p>skillctl centralizza le skill in un unico archivio locale e le materializza negli agenti tramite symlink, junction (Windows) o copia. Il progetto mantiene <code>agent-skills.json</code> (come <code>package.json</code>) e <code>agent-skills.lock</code> (lockfile YAML riproducibile, in stile pnpm).</p>
<ul>
  <li><strong>Store canonico</strong> — <code>~/.skillctl/skills/&lt;name&gt;/SKILL.md</code> + eventuali <code>scripts/</code>, <code>references/</code></li>
  <li><strong>Provenienza e audit</strong> — integrità, sicurezza statica, import da altri tool</li>
  <li><strong>Adattatori built-in</strong> — link automatici verso le directory skill di ogni agente</li>
</ul>

<h2>Installazione rapida</h2>
<pre><code>npm install -g @skillctl/cli
# oppure
pnpm add -g @skillctl/cli
# oppure senza installazione globale
npx @skillctl/cli --help</code></pre>
<p>Il pacchetto pubblicato è <code>@skillctl/cli</code> (scoped). Il comando in PATH resta <code>skillctl</code>. Il nome non scoped su npm è lasciato libero per evitare collisioni con il vecchio skillctl Python.</p>

<h2>Flusso tipico</h2>
<div class="card-grid">
  <div class="card workflow-card">
    <span class="workflow-step">1</span>
    <h3>init</h3>
    <p>Crea <code>agent-skills.json</code> e propone import da directory agente se presenti.</p>
  </div>
  <div class="card workflow-card">
    <span class="workflow-step">2</span>
    <h3>add</h3>
    <p>Aggiunge skill da GitHub, npm, skills.sh, path locali. Aggiorna manifest e lock.</p>
  </div>
  <div class="card workflow-card">
    <span class="workflow-step">3</span>
    <h3>install</h3>
    <p>Scarica/verifica tutte le dipendenze nello store canonico e sincronizza gli agenti.</p>
  </div>
  <div class="card workflow-card">
    <span class="workflow-step">4</span>
    <h3>sync</h3>
    <p>Ricrea i link verso gli agenti rilevati senza rifetch (utile dopo cambio config).</p>
  </div>
</div>

<pre><code>skillctl init
skillctl import from-project --dry-run   # se hai già skill in .codex/.claude/...
skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl install
# oppure, passo per passo:
skillctl add owner/repo
skillctl sync</code></pre>

<h2>Agenti supportati</h2>
<table>
  <thead>
    <tr><th>Agente</th><th>Percorso progetto</th><th>Percorso globale</th></tr>
  </thead>
  <tbody>
    <tr><td>Claude Code</td><td><code>.claude/skills</code></td><td><code>~/.claude/skills</code></td></tr>
    <tr><td>Cursor</td><td><code>.agents/skills</code></td><td><code>~/.cursor/skills</code></td></tr>
    <tr><td>OpenCode</td><td><code>.opencode/skills</code></td><td><code>~/.config/opencode/skills</code></td></tr>
    <tr><td>Codex</td><td><code>.codex/skills</code></td><td><code>~/.codex/skills</code></td></tr>
    <tr><td>Gemini CLI</td><td><code>.gemini/skills</code></td><td><code>~/.gemini/skills</code></td></tr>
  </tbody>
</table>
<p>Altri agenti tramite plugin (sperimentale) o futuri adattatori. Abilita/disabilita ogni agente in <code>~/.skillctl/config.json</code>.</p>

<h2>Sviluppo da sorgente</h2>
<pre><code>pnpm install
pnpm build
pnpm test
pnpm -r lint

# CLI locale
node packages/cli/bin/skillctl.js --help
node packages/cli/bin/skillctl.js doctor</code></pre>
<p>Monorepo: <code>cli</code>, <code>core</code>, <code>manifest</code>, <code>lockfile</code>, <code>registry</code>, <code>link-manager</code>, <code>adapters</code>, <code>import</code>, <code>security</code>, <code>plugin-system</code>.</p>

<h2>Navigazione</h2>
<div class="card-grid">
  <a href="#config" class="card card-interactive" data-nav="config">
    <h3>Configurazione</h3>
    <p>Installazione, <code>config.json</code>, manifest, lockfile, variabili d'ambiente e specifier.</p>
    <span class="card-arrow">→</span>
  </a>
  <a href="#commands" class="card card-interactive" data-nav="commands">
    <h3>Comandi</h3>
    <p>Riferimento completo CLI: init, add, install, sync, audit, doctor, import, plugin.</p>
    <span class="card-arrow">→</span>
  </a>
  <a href="#problems" class="card card-interactive" data-nav="problems">
    <h3>Problemi &amp; soluzioni</h3>
    <p>Troubleshooting, coesistenza con npx/Python, Windows, CI e tabella diagnosi rapida.</p>
    <span class="card-arrow">→</span>
  </a>
</div>

<footer class="page-footer">
  skillctl v0.3 — creato da <a href="https://github.com/xFurti" target="_blank" rel="noopener">xFurti</a> e <a href="https://github.com/gabry848" target="_blank" rel="noopener">Gabry848</a><br>
  <a href="#config">Configurazione</a> · <a href="#commands">Comandi</a> · <a href="#problems">Problemi</a>
</footer>
`,
      },
      config: {
        title: 'Configurazione — skillctl',
        html: `
<h1>Configurazione</h1>
<p class="lead">Installazione del pacchetto, file di configurazione globale, manifest di progetto e convenzioni per specifier e plugin.</p>

<h2>Installazione npm</h2>
<pre><code>npm install -g @skillctl/cli
# verifica
skillctl --version
skillctl doctor</code></pre>
<div class="alert alert-warn">
  <strong>Nota sul nome</strong>
  Usa sempre <code>@skillctl/cli</code>. Esiste un altro progetto Python omonimo che condivide il path <code>~/.skillctl/</code>; controlla l'output di <code>doctor</code> dopo l'installazione.
</div>

<h2>Setup sviluppo (pnpm)</h2>
<pre><code>git clone https://github.com/xFurti/skillctl.git
cd skillctl
pnpm install
pnpm build
node packages/cli/bin/skillctl.js init</code></pre>

<h2>~/.skillctl/config.json</h2>
<p>Configurazione globale letta da tutti i comandi. Creata automaticamente al primo utilizzo se assente.</p>
<pre><code>{
  "version": 1,
  "store": "~/.skillctl/skills",
  "defaultMode": "symlink",
  "agents": {
    "claude-code": true,
    "cursor": true,
    "opencode": true,
    "codex": true,
    "gemini-cli": true
  },
  "trustedSources": ["github:vercel-labs/*", "skills.sh/*"],
  "experimental": { "plugins": false },
  "plugins": []
}</code></pre>

<table>
  <thead>
    <tr><th>Campo</th><th>Descrizione</th></tr>
  </thead>
  <tbody>
    <tr><td><code>version</code></td><td>Versione schema config (attualmente <code>1</code>).</td></tr>
    <tr><td><code>store</code></td><td>Percorso dello store canonico delle skill (default <code>~/.skillctl/skills</code>).</td></tr>
    <tr><td><code>defaultMode</code></td><td>Modalità link: <code>symlink</code>, <code>junction</code> (default su Windows), <code>copy</code>.</td></tr>
    <tr><td><code>agents</code></td><td>Mappa agente → booleano; solo gli agenti abilitati ricevono sync.</td></tr>
    <tr><td><code>trustedSources</code></td><td>Pattern opzionali per fonti considerate attendibili (audit/informazioni).</td></tr>
    <tr><td><code>registries</code></td><td>Elenco opzionale di registry custom (estensioni future).</td></tr>
    <tr><td><code>experimental.plugins</code></td><td>Abilita caricamento plugin al avvio CLI (<code>skillctl plugin enable</code>).</td></tr>
    <tr><td><code>plugins</code></td><td>Array di plugin registrati: <code>name</code>, <code>path</code>, <code>enabled</code>.</td></tr>
  </tbody>
</table>

<h2>agent-skills.json e agent-skills.lock</h2>
<p>File di progetto da versionare nel repository:</p>
<ul>
  <li><code>agent-skills.json</code> — manifest con <code>agentSkills.dependencies</code> e <code>devDependencies</code></li>
  <li><code>agent-skills.lock</code> — lock YAML con integrità sha256, percorsi canonici e provenienza</li>
</ul>
<pre><code>{
  "name": "my-frontend-project",
  "version": "1.2.0",
  "agentSkills": {
    "dependencies": {
      "web-design-guidelines": "github:vercel-labs/agent-skills#web-design-guidelines",
      "playwright": "skills.sh/playwright@^1.0",
      "local-review": "file:./skills/my-review",
      "my-codex-skill": "local:imported/my-codex-skill"
    },
    "devDependencies": {}
  }
}</code></pre>
<p>Le skill migrate da directory agente usano <code>local:imported/&lt;name&gt;</code> e puntano allo store canonico, non al path legacy.</p>

<h3>Provenienza nel lock</h3>
<p>Ogni entry in <code>agent-skills.lock</code> può includere campi di provenienza utili per audit e migrazione:</p>
<ul>
  <li><code>migratedFrom</code> — <code>project-scan</code>, <code>npx</code> o <code>python-skillctl</code></li>
  <li><code>originalPath</code> — percorso sorgente al momento dell'import (es. <code>.codex/skills/demo</code>)</li>
  <li><code>adapter</code> — id adapter che ha fornito la skill (es. <code>codex</code>)</li>
</ul>

<h2>Struttura cartelle</h2>
<pre><code>~/.skillctl/
├── config.json          # config globale
├── skills/              # store canonico
│   └── &lt;skill-name&gt;/
│       ├── SKILL.md
│       ├── scripts/
│       └── references/
├── cache/               # cache content-addressable
│   └── downloads/       # tarball scaricati
└── plugins/             # plugin installati (sperimentale)

progetto/
├── agent-skills.json
├── agent-skills.lock
├── .claude/skills/      # symlink relativi → store (Claude)
├── .agents/skills/      # symlink relativi → store (Cursor)
├── .codex/skills/       # symlink relativi → store (Codex)
└── ...</code></pre>
<p>I link nelle directory agente <strong>del progetto</strong> sono symlink relativi (portabili tra macchine). I path globali (<code>~/.cursor/skills</code>, ecc.) restano assoluti.</p>

<h2>Variabili d'ambiente</h2>
<table>
  <thead>
    <tr><th>Variabile</th><th>Effetto</th></tr>
  </thead>
  <tbody>
    <tr><td><code>SKILLCTL_PARALLEL</code></td><td>Numero massimo di fetch paralleli verso i registry (default 6, max 16). Esempio: <code>SKILLCTL_PARALLEL=4 skillctl install</code></td></tr>
    <tr><td><code>GITHUB_TOKEN</code></td><td>Token GitHub per tarball API; consigliato con molte dipendenze <code>github:</code> per evitare rate limit 403.</td></tr>
  </tbody>
</table>

<h2>Formati specifier</h2>
<table>
  <thead>
    <tr><th>Formato</th><th>Esempio</th><th>Note</th></tr>
  </thead>
  <tbody>
    <tr><td>GitHub (esplicito)</td><td><code>github:owner/repo#skill-name</code></td><td>Repo + skill in sottocartella.</td></tr>
    <tr><td>GitHub (shorthand)</td><td><code>owner/repo#skill-name</code></td><td>Equivalente al prefisso <code>github:</code>.</td></tr>
    <tr><td>npm</td><td><code>npm:package-name</code></td><td>Pacchetto npm che espone una skill.</td></tr>
    <tr><td>skills.sh</td><td><code>skills.sh/owner/repo</code></td><td>Richiede forma <code>owner/repo</code>; il solo nome skill fallisce.</td></tr>
    <tr><td>Locale</td><td><code>file:./path/to/skill</code> o <code>./path</code></td><td>Directory con <code>SKILL.md</code>.</td></tr>
    <tr><td>Importata</td><td><code>local:imported/my-skill</code></td><td>Skill migrata nello store canonico (da <code>import from-project</code> o simili).</td></tr>
  </tbody>
</table>

<h2>Plugin (sperimentale)</h2>
<div class="alert alert-warn">
  <strong>Sicurezza</strong>
  I plugin eseguono codice arbitrario all'avvio. Abilita solo sorgenti attendibili. Vedi threat model nel design doc del progetto.
</div>
<pre><code># Abilita nel config
skillctl plugin enable

# Registra plugin locale (package.json con entry skillctl.plugin)
skillctl plugin add ./my-skillctl-plugin
skillctl plugin list
skillctl plugin remove my-plugin</code></pre>
<p>I plugin possono registrare comandi CLI, adattatori agente e sorgenti registry aggiuntive.</p>

<h2>Primi passi</h2>
<ol>
  <li>Installa <code>@skillctl/cli</code> globalmente o usa <code>npx</code>.</li>
  <li>Esegui <code>skillctl doctor</code> per verificare ambiente e agenti rilevati.</li>
  <li>Nel progetto: <code>skillctl init</code> (wizard di import se ci sono skill in <code>.codex/skills</code>, <code>.claude/skills</code>, …).</li>
  <li>Se hai skill legacy: <code>skillctl import from-project --dry-run</code>, poi import senza <code>--dry-run</code>.</li>
  <li>Altrimenti: <code>skillctl add &lt;spec&gt;</code> e <code>skillctl install</code>.</li>
  <li>Opzionale: <code>skillctl audit</code> in CI con <code>--strict</code>.</li>
</ol>

<footer>
  <a href="#index">Panoramica</a> · <a href="#commands">Comandi</a> · <a href="#problems">Problemi</a>
</footer>
`,
      },
      commands: {
        title: 'Comandi — skillctl',
        html: `
<h1>Comandi CLI</h1>
<p class="lead">Riferimento completo ai comandi skillctl v0.3. I blocchi comando restano in inglese come nell'interfaccia CLI.</p>

<h2>Workflow principali</h2>
<div class="card-grid">
  <div class="card">
    <h3>Nuovo progetto</h3>
    <p><code>init</code> → <code>add</code> → <code>install</code></p>
  </div>
  <div class="card">
    <h3>Aggiornamento</h3>
    <p><code>update [names...]</code> → rifetch + re-sync</p>
  </div>
  <div class="card">
    <h3>CI / riproducibilità</h3>
    <p><code>install --frozen</code> + <code>audit --strict --json</code></p>
  </div>
  <div class="card">
    <h3>Migrazione</h3>
    <p><code>import from-project</code> · <code>from-npx</code> · <code>from-skillctl</code></p>
  </div>
</div>

<h2>Comandi base</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl init</div>
  <p class="cmd-desc">Crea <code>agent-skills.json</code> di partenza nella directory corrente. Se rileva skill in directory agente (es. <code>.codex/skills</code>), propone un wizard di import. Non sovrascrive un file esistente.</p>
  <pre><code>skillctl init
skillctl init --no-prompt</code></pre>
  <p>Flag: <code>--no-prompt</code> — salta il wizard di import post-init.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl add &lt;spec&gt;</div>
  <p class="cmd-desc">Risolve lo specifier, scarica nella cache, installa nello store canonico, aggiorna manifest e lock.</p>
  <pre><code>skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl add skills.sh/vercel-labs/agent-skills
skillctl add ./local-skills/my-review
skillctl add owner/repo --no-manifest</code></pre>
  <p>Flag: <code>--no-manifest</code> — non aggiorna <code>agent-skills.json</code> (solo lock/store).</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl install | i</div>
  <p class="cmd-desc">Garantisce che tutte le dipendenze del manifest siano nello store; sincronizza gli agenti per default.</p>
  <pre><code>skillctl install
skillctl install --frozen
skillctl install --no-sync
SKILLCTL_PARALLEL=4 skillctl install</code></pre>
  <p>Flag: <code>--frozen</code> — fallisce (exit 2) se l'integrità lock ≠ store; <code>--no-sync</code> — salta il linking agli agenti.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl update [names...]</div>
  <p class="cmd-desc">Ri-scarica le skill indicate (o tutte se omesso) dai specifier nel manifest e re-sincronizza.</p>
  <pre><code>skillctl update
skillctl update web-design-guidelines playwright
skillctl update --no-sync</code></pre>
  <p>Flag: <code>--no-sync</code> — aggiorna store/lock senza ricollegare gli agenti.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl sync</div>
  <p class="cmd-desc">Collega le skill del lockfile agli agenti abilitati senza nuovi download. I link nelle directory agente del progetto sono <strong>relativi</strong> (portabili in git).</p>
  <pre><code>skillctl sync
skillctl sync --dry-run</code></pre>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl list</div>
  <p class="cmd-desc">Elenca skill da lockfile con riepilogo manifest.</p>
  <pre><code>skillctl list
skillctl list --json</code></pre>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl remove &lt;name&gt; | rm</div>
  <p class="cmd-desc">Rimuove dal manifest/lock e scollega dagli agenti.</p>
  <pre><code>skillctl remove web-design-guidelines
skillctl rm my-skill --purge</code></pre>
  <p>Flag: <code>--purge</code> — elimina anche la copia nello store canonico.</p>
</div>

<h2>Diagnostica e sicurezza</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl doctor</div>
  <p class="cmd-desc">Verifica config, manifest, lock, adattatori, coesistenza (directory agente del progetto, npx, Python) e riepilogo audit. Suggerisce <code>import from-project --dry-run</code> se trova skill in <code>.codex/skills</code>, <code>.claude/skills</code>, ecc.</p>
  <pre><code>skillctl doctor
skillctl doctor --fix
skillctl doctor --json</code></pre>
  <p>Flag: <code>--fix</code> — re-sincronizza i link dagli entry del lock; <code>--json</code> — report strutturato (exit 2 se problemi).</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl audit</div>
  <p class="cmd-desc">Scansione statica: integrità, nome SKILL.md, script sospetti, path traversal, limiti dimensione. Nessuna esecuzione di script.</p>
  <pre><code>skillctl audit
skillctl audit --json
skillctl audit --strict
skillctl audit --json --strict</code></pre>
  <p>Exit code: 0 ok, 1 errori, 2 warning (o warning trattati come errori con <code>--strict</code>).</p>
</div>

<h2>Import e migrazione</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl import from-project</div>
  <p class="cmd-desc">Scopre e importa skill nelle directory agente del progetto (<code>.codex/skills</code>, <code>.claude/skills</code>, <code>.agents/skills</code>, …). Aggiorna manifest e lock di default con specifier <code>local:imported/&lt;name&gt;</code>.</p>
  <pre><code>skillctl import from-project --dry-run
skillctl import from-project
skillctl import from-project --sync
skillctl import from-project --yes
skillctl import from-project --no-manifest</code></pre>
  <p>Flag: <code>--dry-run</code> — piano migrazione; <code>--sync</code> — sync agenti dopo import; <code>--no-manifest</code> / <code>--lock-only</code> — solo lock; <code>--sources codex,claude-code</code> — limita gli adapter; <code>--yes</code> — salta conferme.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl import from-npx</div>
  <p class="cmd-desc">Migra da <code>npx skills</code> (<code>skills-lock.json</code>, <code>.agents/skills/</code>). L'installazione npx originale resta invariata.</p>
  <pre><code>skillctl import from-npx --dry-run
skillctl import from-npx --write-manifest
skillctl import from-npx --sync --write-manifest
skillctl import from-npx --yes</code></pre>
  <p>Flag: <code>--dry-run</code> — piano migrazione; <code>--write-manifest</code> — aggiorna <code>agent-skills.json</code>; <code>--sync</code> — sync agenti dopo import (<code>--adopt</code> alias deprecato); <code>--yes</code> — salta conferme.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl import from-skillctl</div>
  <p class="cmd-desc">Migra dal skillctl Python (<code>~/.skillctl/repos/</code>, <code>manifest.json</code>).</p>
  <pre><code>skillctl import from-skillctl --dry-run
skillctl import from-skillctl --sync
skillctl import from-skillctl --write-manifest</code></pre>
</div>

<h2>Plugin (sperimentale)</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl plugin list | enable | add | remove</div>
  <p class="cmd-desc">Gestione plugin locali. Richiede <code>experimental.plugins: true</code> in config.</p>
  <pre><code>skillctl plugin enable
skillctl plugin add ./my-skillctl-plugin
skillctl plugin list
skillctl plugin list --json
skillctl plugin remove my-plugin</code></pre>
</div>

<h2>Opzioni globali</h2>
<pre><code>skillctl --version
skillctl -v
skillctl --help
skillctl &lt;comando&gt; --help</code></pre>

<footer>
  <a href="#index">Panoramica</a> · <a href="#config">Configurazione</a> · <a href="#problems">Problemi</a>
</footer>
`,
      },
      problems: {
        title: 'Problemi — skillctl',
        html: `
<h1>Problemi &amp; soluzioni</h1>
<p class="lead">Troubleshooting per installazione, registry, Windows, coesistenza con altri tool e CI.</p>

<div class="alert alert-info">
  <strong>Primo passo consigliato</strong>
  Esegui sempre <code>skillctl doctor</code> (o <code>skillctl doctor --json</code>) per un quadro strutturato di config, manifest, lock e adattatori.
</div>

<h2>Comando non trovato</h2>
<p><strong>Sintomo:</strong> <code>skillctl: command not found</code> dopo installazione npm.</p>
<ul>
  <li>Verifica installazione: <code>npm list -g @skillctl/cli</code></li>
  <li>Controlla che la directory bin globale npm sia nel <code>PATH</code></li>
  <li>Alternativa immediata: <code>npx @skillctl/cli doctor</code></li>
  <li>In sviluppo: <code>node packages/cli/bin/skillctl.js doctor</code></li>
</ul>

<h2>Build fallisce (sviluppo)</h2>
<p><strong>Sintomo:</strong> errori TypeScript o pnpm in <code>pnpm build</code>.</p>
<ul>
  <li><code>pnpm install</code> dalla root del monorepo</li>
  <li>Node.js ≥ 22.13 e pnpm 11.x (vedi README del repo)</li>
  <li><code>pnpm -r build</code> per ricostruire tutti i pacchetti</li>
  <li>Pulisci artefatti: rimuovi <code>dist/</code> e ricompila</li>
</ul>

<h2>Link assoluti in git (portabilità)</h2>
<p><strong>Sintomo:</strong> su un altro computer i link in <code>.codex/skills</code> o <code>.claude/skills</code> puntano a path assoluti della macchina precedente.</p>
<ul>
  <li>Da v0.3, <code>sync</code> crea symlink <strong>relativi</strong> nelle directory agente del progetto</li>
  <li>Esegui <code>skillctl sync</code> o <code>skillctl doctor --fix</code> dopo l'upgrade</li>
  <li>Non committare link assoluti verso <code>~/.skillctl</code> — rigenerali con sync</li>
</ul>

<h2>GitHub 403 / rate limit</h2>
<p><strong>Sintomo:</strong> fetch tarball GitHub fallisce con 403 o rate limit.</p>
<ul>
  <li>Imposta <code>GITHUB_TOKEN</code> con un PAT con scope lettura repo pubblici</li>
  <li>Riduci parallelismo: <code>SKILLCTL_PARALLEL=2 skillctl install</code></li>
  <li>Riprova dopo il reset del rate limit; verifica URL repo e nome skill</li>
</ul>

<h2>Spec non riconosciuto</h2>
<p><strong>Sintomo:</strong> <code>Could not resolve</code> o registry non trovato.</p>
<ul>
  <li>Usa prefissi espliciti: <code>github:</code>, <code>npm:</code>, <code>file:</code></li>
  <li>GitHub: <code>owner/repo#skill-folder</code> se la skill è in sottodirectory</li>
  <li>Path locale: directory deve contenere <code>SKILL.md</code></li>
  <li><code>skillctl add &lt;spec&gt;</code> mostra l'errore di risoluzione dettagliato</li>
</ul>

<h2>skills.sh — errore name-only</h2>
<p><strong>Sintomo:</strong> messaggio che richiede forma <code>owner/repo</code>.</p>
<pre><code># ❌ non valido
skills.sh/web-design-guidelines

# ✓ valido
skills.sh/vercel-labs/agent-skills</code></pre>

<h2>Integrità npm / lock drift</h2>
<p><strong>Sintomo:</strong> <code>install --frozen</code> fallisce; audit segnala sha256 mismatch.</p>
<ul>
  <li>Non modificare manualmente file nello store canonico</li>
  <li><code>skillctl update &lt;name&gt;</code> per riallineare lock e store</li>
  <li>In CI: committa <code>agent-skills.lock</code> aggiornato dopo ogni <code>add</code></li>
  <li><code>skillctl audit</code> elenca le skill con integrità compromessa</li>
</ul>

<h2>Windows — symlink / junction</h2>
<p><strong>Sintomo:</strong> EPERM, link non creati, warning su copy fallback.</p>
<ul>
  <li>Default su Windows: <code>junction</code> in <code>config.json</code> (<code>defaultMode</code>)</li>
  <li>Symlink richiede spesso privilegi Developer Mode o amministratore</li>
  <li>Fallback automatico a <code>copy</code> con warning in log</li>
  <li><code>skillctl doctor --fix</code> per ricreare i link dopo cambio modalità</li>
</ul>

<h2>Agente non rilevato</h2>
<p><strong>Sintomo:</strong> <code>sync</code> riporta zero adapter o agente specifico assente.</p>
<ul>
  <li>Verifica <code>agents.&lt;id&gt;: true</code> in <code>~/.skillctl/config.json</code></li>
  <li>ID validi: <code>claude-code</code>, <code>cursor</code>, <code>opencode</code>, <code>codex</code>, <code>gemini-cli</code></li>
  <li><code>skillctl doctor</code> mostra adapter registrati vs abilitati</li>
  <li>Per agenti custom: plugin sperimentale con adattatore dedicato</li>
</ul>

<h2>Link rotti</h2>
<p><strong>Sintomo:</strong> directory agente punta a path inesistente o skill mancante nell'IDE.</p>
<ul>
  <li><code>skillctl doctor --fix</code></li>
  <li><code>skillctl sync</code> dopo <code>install</code></li>
  <li>Verifica che la skill esista in <code>~/.skillctl/skills/&lt;name&gt;/</code></li>
</ul>

<h2>Install frozen in CI</h2>
<p><strong>Sintomo:</strong> pipeline fallisce con exit 2 su <code>install --frozen</code>.</p>
<ul>
  <li>Lockfile non committato o non aggiornato → committa <code>agent-skills.lock</code></li>
  <li>Cache CI non include <code>~/.skillctl/skills</code> → esegui <code>install</code> senza frozen in build, frozen in verify</li>
  <li>Drift tra runner → usa stesso lock e stessa versione <code>@skillctl/cli</code></li>
</ul>

<h2>Lock mancante</h2>
<p><strong>Sintomo:</strong> <code>doctor</code> segnala assenza di <code>agent-skills.lock</code>.</p>
<p>Normale subito dopo <code>init</code>. Esegui <code>skillctl add</code> o <code>skillctl install</code> per generarlo. Versiona il lock nel repository.</p>

<h2>Coesistenza npx / Python skillctl</h2>
<p><strong>Sintomo:</strong> skill duplicate, path condivisi, confusione su quale tool gestisce le skill.</p>
<ul>
  <li><code>skillctl doctor</code> rileva <code>skills-lock.json</code> (npx) e <code>~/.skillctl/repos/</code> (Python)</li>
  <li>Skill già in directory agente? Prova <code>import from-project --dry-run</code></li>
  <li>Migra da npx con <code>import from-npx --dry-run</code> prima di sincronizzare</li>
  <li>Lo store canonico Node è <code>~/.skillctl/skills/</code>; <code>.agents/skills</code> è solo target Cursor/npx, non lo store</li>
  <li>Installa via <code>@skillctl/cli</code> per distinguere dal CLI Python</li>
</ul>

<h2>Problemi import</h2>
<ul>
  <li><strong>Piano vuoto (from-project):</strong> nessuna directory agente con skill — verifica <code>.codex/skills</code>, <code>.claude/skills</code>, ecc.</li>
  <li><strong>Piano vuoto (from-npx/skillctl):</strong> nessun marker npx/Python — verifica <code>skills-lock.json</code> o repos Python</li>
  <li><strong>Skill già nel lock:</strong> vengono saltate (<code>skip-existing</code> nel piano dry-run)</li>
  <li><strong>Errori parziali:</strong> controlla stderr; exit 1 se errori fatali</li>
  <li>Usa sempre <code>--dry-run</code> prima di import definitivi</li>
  <li>Per <code>from-project</code>, manifest e lock si aggiornano di default; usa <code>--sync</code> per ricollegare subito gli agenti</li>
</ul>

<h2>Warning audit</h2>
<p>Pattern sospetti in <code>scripts/</code>, riferimenti path traversal, SKILL.md troppo grande. In CI usa <code>audit --strict --json</code>. Correggi o rimuovi la skill problematica; non ignorare warning su fonti non attendibili.</p>

<h2>Plugin non caricato</h2>
<ul>
  <li><code>experimental.plugins</code> deve essere <code>true</code> (<code>skillctl plugin enable</code>)</li>
  <li>Riavvia la CLI dopo abilitazione</li>
  <li><code>plugin add</code> richiede <code>skillctl.plugin</code> in <code>package.json</code> del plugin</li>
  <li><code>skillctl plugin list</code> mostra stato abilitato (✓) o disabilitato (○)</li>
</ul>

<h2>Diagnosi rapida</h2>
<table>
  <thead>
    <tr><th>Sintomo</th><th>Comando / azione</th><th>Exit atteso</th></tr>
  </thead>
  <tbody>
    <tr><td>Setup generale</td><td><code>skillctl doctor</code></td><td>0 se ok</td></tr>
    <tr><td>Link agenti rotti</td><td><code>skillctl doctor --fix</code></td><td>0</td></tr>
    <tr><td>CI riproducibile</td><td><code>skillctl install --frozen</code></td><td>0 o 2 se drift</td></tr>
    <tr><td>Sicurezza pipeline</td><td><code>skillctl audit --json --strict</code></td><td>0 / 1 / 2</td></tr>
    <tr><td>Skill in directory agente</td><td><code>skillctl import from-project --dry-run</code></td><td>0</td></tr>
    <tr><td>Piano migrazione npx</td><td><code>skillctl import from-npx --dry-run</code></td><td>0</td></tr>
    <tr><td>Lista skill installate</td><td><code>skillctl list --json</code></td><td>0</td></tr>
    <tr><td>Versione CLI</td><td><code>skillctl --version</code></td><td>0</td></tr>
    <tr><td>Plugin attivi</td><td><code>skillctl plugin list --json</code></td><td>0</td></tr>
  </tbody>
</table>

<footer>
  <a href="#index">Panoramica</a> · <a href="#config">Configurazione</a> · <a href="#commands">Comandi</a>
</footer>
`,
      },
    },
  },
  en: {
    nav: {
      brandSub: 'Documentation v0.3',
      navSection: 'Guide',
      navOverview: 'Overview',
      navConfig: 'Configuration',
      navCommands: 'Commands',
      navProblems: 'Problems & solutions',
      searchPlaceholder: 'Search docs…',
      searchNoResults: 'No commands match your search.',
      copyLabel: 'Copy',
      copiedLabel: 'Copied!',
    },
    pages: {
      index: {
        title: 'skillctl — Documentation',
        html: `
<section class="hero">
  <div class="hero-glow"></div>
  <div class="hero-content">
    <p class="hero-badge">v0.3 · Agent Skills</p>
    <h1 class="hero-title">skillctl</h1>
    <p class="hero-lead">Universal package-manager-style CLI for managing <strong>Agent Skills</strong> across AI coding agents.</p>
    <div class="hero-terminal">
      <div class="terminal-bar">
        <span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-dot"></span>
        <span class="terminal-label">~/my-project</span>
      </div>
      <pre class="terminal-body"><code id="hero-cmd">skillctl init</code><span class="terminal-cursor"></span></pre>
    </div>
  </div>
</section>

<div class="alert alert-info">
  <strong>Version 0.3</strong>
  Canonical store at <code>~/.skillctl/skills/</code>, declarative manifest, <code>import from-project</code> to migrate skills from <code>.codex/skills</code> and other agent dirs, git-portable relative links, and sync to Claude Code, Cursor, OpenCode, Codex, Gemini CLI, and other <a href="https://agentskills.io" target="_blank" rel="noopener">agentskills.io</a> agents.
</div>

<h2>What is skillctl</h2>
<p>skillctl centralizes skills in a single local store and materializes them into agents via symlink, junction (Windows), or copy. Projects keep <code>agent-skills.json</code> (like <code>package.json</code>) and <code>agent-skills.lock</code> (reproducible YAML lockfile, pnpm-style).</p>
<ul>
  <li><strong>Canonical store</strong> — <code>~/.skillctl/skills/&lt;name&gt;/SKILL.md</code> plus optional <code>scripts/</code>, <code>references/</code></li>
  <li><strong>Provenance &amp; audit</strong> — integrity checks, static security scan, import from other tools</li>
  <li><strong>Built-in adapters</strong> — automatic links to each agent's skill directories</li>
</ul>

<h2>Quick install</h2>
<pre><code>npm install -g @skillctl/cli
# or
pnpm add -g @skillctl/cli
# or without global install
npx @skillctl/cli --help</code></pre>
<p>The published package is <code>@skillctl/cli</code> (scoped). The command on PATH remains <code>skillctl</code>. The unscoped npm name is left unclaimed to avoid collision with the legacy Python skillctl.</p>

<h2>Typical flow</h2>
<div class="card-grid">
  <div class="card workflow-card">
    <span class="workflow-step">1</span>
    <h3>init</h3>
    <p>Creates <code>agent-skills.json</code> and offers import from agent dirs when detected.</p>
  </div>
  <div class="card workflow-card">
    <span class="workflow-step">2</span>
    <h3>add</h3>
    <p>Adds skills from GitHub, npm, skills.sh, or local paths. Updates manifest and lock.</p>
  </div>
  <div class="card workflow-card">
    <span class="workflow-step">3</span>
    <h3>install</h3>
    <p>Fetches/verifies all dependencies into the canonical store and syncs agents.</p>
  </div>
  <div class="card workflow-card">
    <span class="workflow-step">4</span>
    <h3>sync</h3>
    <p>Recreates agent links without re-fetching (useful after config changes).</p>
  </div>
</div>

<pre><code>skillctl init
skillctl import from-project --dry-run   # if you already have skills in .codex/.claude/...
skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl install
# or step-wise:
skillctl add owner/repo
skillctl sync</code></pre>

<h2>Supported agents</h2>
<table>
  <thead>
    <tr><th>Agent</th><th>Project path</th><th>Global path</th></tr>
  </thead>
  <tbody>
    <tr><td>Claude Code</td><td><code>.claude/skills</code></td><td><code>~/.claude/skills</code></td></tr>
    <tr><td>Cursor</td><td><code>.agents/skills</code></td><td><code>~/.cursor/skills</code></td></tr>
    <tr><td>OpenCode</td><td><code>.opencode/skills</code></td><td><code>~/.config/opencode/skills</code></td></tr>
    <tr><td>Codex</td><td><code>.codex/skills</code></td><td><code>~/.codex/skills</code></td></tr>
    <tr><td>Gemini CLI</td><td><code>.gemini/skills</code></td><td><code>~/.gemini/skills</code></td></tr>
  </tbody>
</table>
<p>Additional agents via plugins (experimental) or future adapters. Enable or disable each agent in <code>~/.skillctl/config.json</code>.</p>

<h2>Develop from source</h2>
<pre><code>pnpm install
pnpm build
pnpm test
pnpm -r lint

# Local CLI
node packages/cli/bin/skillctl.js --help
node packages/cli/bin/skillctl.js doctor</code></pre>
<p>Monorepo packages: <code>cli</code>, <code>core</code>, <code>manifest</code>, <code>lockfile</code>, <code>registry</code>, <code>link-manager</code>, <code>adapters</code>, <code>import</code>, <code>security</code>, <code>plugin-system</code>.</p>

<h2>Navigation</h2>
<div class="card-grid">
  <a href="#config" class="card card-interactive" data-nav="config">
    <h3>Configuration</h3>
    <p>Installation, <code>config.json</code>, manifest, lockfile, environment variables, and specifiers.</p>
    <span class="card-arrow">→</span>
  </a>
  <a href="#commands" class="card card-interactive" data-nav="commands">
    <h3>Commands</h3>
    <p>Full CLI reference: init, add, install, sync, audit, doctor, import, plugin.</p>
    <span class="card-arrow">→</span>
  </a>
  <a href="#problems" class="card card-interactive" data-nav="problems">
    <h3>Problems &amp; solutions</h3>
    <p>Troubleshooting, coexistence with npx/Python, Windows, CI, and quick diagnosis table.</p>
    <span class="card-arrow">→</span>
  </a>
</div>

<footer class="page-footer">
  skillctl v0.3 — created by <a href="https://github.com/xFurti" target="_blank" rel="noopener">xFurti</a> and <a href="https://github.com/gabry848" target="_blank" rel="noopener">Gabry848</a><br>
  <a href="#config">Configuration</a> · <a href="#commands">Commands</a> · <a href="#problems">Problems</a>
</footer>
`,
      },
      config: {
        title: 'Configuration — skillctl',
        html: `
<h1>Configuration</h1>
<p class="lead">Package installation, global configuration, project manifest, and conventions for specifiers and plugins.</p>

<h2>npm install</h2>
<pre><code>npm install -g @skillctl/cli
# verify
skillctl --version
skillctl doctor</code></pre>
<div class="alert alert-warn">
  <strong>Name collision note</strong>
  Always use <code>@skillctl/cli</code>. A separate Python project shares the <code>~/.skillctl/</code> path; review <code>doctor</code> output after install.
</div>

<h2>Development setup (pnpm)</h2>
<pre><code>git clone https://github.com/xFurti/skillctl.git
cd skillctl
pnpm install
pnpm build
node packages/cli/bin/skillctl.js init</code></pre>

<h2>~/.skillctl/config.json</h2>
<p>Global configuration read by all commands. Created automatically on first use if missing.</p>
<pre><code>{
  "version": 1,
  "store": "~/.skillctl/skills",
  "defaultMode": "symlink",
  "agents": {
    "claude-code": true,
    "cursor": true,
    "opencode": true,
    "codex": true,
    "gemini-cli": true
  },
  "trustedSources": ["github:vercel-labs/*", "skills.sh/*"],
  "experimental": { "plugins": false },
  "plugins": []
}</code></pre>

<table>
  <thead>
    <tr><th>Field</th><th>Description</th></tr>
  </thead>
  <tbody>
    <tr><td><code>version</code></td><td>Config schema version (currently <code>1</code>).</td></tr>
    <tr><td><code>store</code></td><td>Path to the canonical skill store (default <code>~/.skillctl/skills</code>).</td></tr>
    <tr><td><code>defaultMode</code></td><td>Link mode: <code>symlink</code>, <code>junction</code> (Windows default), or <code>copy</code>.</td></tr>
    <tr><td><code>agents</code></td><td>Agent ID → boolean map; only enabled agents receive sync.</td></tr>
    <tr><td><code>trustedSources</code></td><td>Optional patterns for sources considered trusted (audit/info).</td></tr>
    <tr><td><code>registries</code></td><td>Optional list of custom registries (future extensions).</td></tr>
    <tr><td><code>experimental.plugins</code></td><td>Enable plugin loading at CLI startup (<code>skillctl plugin enable</code>).</td></tr>
    <tr><td><code>plugins</code></td><td>Array of registered plugins: <code>name</code>, <code>path</code>, <code>enabled</code>.</td></tr>
  </tbody>
</table>

<h2>agent-skills.json and agent-skills.lock</h2>
<p>Project files to commit in your repository:</p>
<ul>
  <li><code>agent-skills.json</code> — manifest with <code>agentSkills.dependencies</code> and <code>devDependencies</code></li>
  <li><code>agent-skills.lock</code> — YAML lock with sha256 integrity, canonical paths, and provenance</li>
</ul>
<pre><code>{
  "name": "my-frontend-project",
  "version": "1.2.0",
  "agentSkills": {
    "dependencies": {
      "web-design-guidelines": "github:vercel-labs/agent-skills#web-design-guidelines",
      "playwright": "skills.sh/playwright@^1.0",
      "local-review": "file:./skills/my-review",
      "my-codex-skill": "local:imported/my-codex-skill"
    },
    "devDependencies": {}
  }
}</code></pre>
<p>Skills migrated from agent directories use <code>local:imported/&lt;name&gt;</code> and point at the canonical store, not legacy paths.</p>

<h3>Lock provenance</h3>
<p>Each <code>agent-skills.lock</code> entry may include provenance fields for audit and migration:</p>
<ul>
  <li><code>migratedFrom</code> — <code>project-scan</code>, <code>npx</code>, or <code>python-skillctl</code></li>
  <li><code>originalPath</code> — source path at import time (e.g. <code>.codex/skills/demo</code>)</li>
  <li><code>adapter</code> — adapter id that supplied the skill (e.g. <code>codex</code>)</li>
</ul>

<h2>Folder structure</h2>
<pre><code>~/.skillctl/
├── config.json          # global config
├── skills/              # canonical store
│   └── &lt;skill-name&gt;/
│       ├── SKILL.md
│       ├── scripts/
│       └── references/
├── cache/               # content-addressable cache
│   └── downloads/       # downloaded tarballs
└── plugins/             # installed plugins (experimental)

project/
├── agent-skills.json
├── agent-skills.lock
├── .claude/skills/      # relative symlinks → store (Claude)
├── .agents/skills/      # relative symlinks → store (Cursor)
├── .codex/skills/       # relative symlinks → store (Codex)
└── ...</code></pre>
<p>Links under <strong>project</strong> agent directories are relative symlinks (portable across machines). Global paths (<code>~/.cursor/skills</code>, etc.) remain absolute.</p>

<h2>Environment variables</h2>
<table>
  <thead>
    <tr><th>Variable</th><th>Effect</th></tr>
  </thead>
  <tbody>
    <tr><td><code>SKILLCTL_PARALLEL</code></td><td>Max parallel registry fetches (default 6, max 16). Example: <code>SKILLCTL_PARALLEL=4 skillctl install</code></td></tr>
    <tr><td><code>GITHUB_TOKEN</code></td><td>GitHub token for tarball API; recommended with many <code>github:</code> deps to avoid 403 rate limits.</td></tr>
  </tbody>
</table>

<h2>Specifier formats</h2>
<table>
  <thead>
    <tr><th>Format</th><th>Example</th><th>Notes</th></tr>
  </thead>
  <tbody>
    <tr><td>GitHub (explicit)</td><td><code>github:owner/repo#skill-name</code></td><td>Repo + skill in subfolder.</td></tr>
    <tr><td>GitHub (shorthand)</td><td><code>owner/repo#skill-name</code></td><td>Equivalent to <code>github:</code> prefix.</td></tr>
    <tr><td>npm</td><td><code>npm:package-name</code></td><td>npm package exposing a skill.</td></tr>
    <tr><td>skills.sh</td><td><code>skills.sh/owner/repo</code></td><td>Requires <code>owner/repo</code> form; name-only specs fail.</td></tr>
    <tr><td>Local</td><td><code>file:./path/to/skill</code> or <code>./path</code></td><td>Directory containing <code>SKILL.md</code>.</td></tr>
    <tr><td>Imported</td><td><code>local:imported/my-skill</code></td><td>Skill migrated into the canonical store (via <code>import from-project</code> or similar).</td></tr>
  </tbody>
</table>

<h2>Plugins (experimental)</h2>
<div class="alert alert-warn">
  <strong>Security</strong>
  Plugins execute arbitrary code at startup. Enable only trusted sources. See the project design doc threat model.
</div>
<pre><code># Enable in config
skillctl plugin enable

# Register local plugin (package.json with skillctl.plugin entry)
skillctl plugin add ./my-skillctl-plugin
skillctl plugin list
skillctl plugin remove my-plugin</code></pre>
<p>Plugins can register CLI commands, agent adapters, and additional registry sources.</p>

<h2>First-time setup</h2>
<ol>
  <li>Install <code>@skillctl/cli</code> globally or use <code>npx</code>.</li>
  <li>Run <code>skillctl doctor</code> to verify environment and detected agents.</li>
  <li>In your project: <code>skillctl init</code> (import wizard if skills exist under <code>.codex/skills</code>, <code>.claude/skills</code>, …).</li>
  <li>If you have legacy skills: <code>skillctl import from-project --dry-run</code>, then import without <code>--dry-run</code>.</li>
  <li>Otherwise: <code>skillctl add &lt;spec&gt;</code> and <code>skillctl install</code>.</li>
  <li>Optional: <code>skillctl audit</code> in CI with <code>--strict</code>.</li>
</ol>

<footer>
  <a href="#index">Overview</a> · <a href="#commands">Commands</a> · <a href="#problems">Problems</a>
</footer>
`,
      },
      commands: {
        title: 'Commands — skillctl',
        html: `
<h1>CLI commands</h1>
<p class="lead">Complete reference for skillctl v0.3 commands. Command blocks remain in English as in the CLI interface.</p>

<h2>Main workflows</h2>
<div class="card-grid">
  <div class="card">
    <h3>New project</h3>
    <p><code>init</code> → <code>add</code> → <code>install</code></p>
  </div>
  <div class="card">
    <h3>Update skills</h3>
    <p><code>update [names...]</code> → re-fetch + re-sync</p>
  </div>
  <div class="card">
    <h3>CI / reproducibility</h3>
    <p><code>install --frozen</code> + <code>audit --strict --json</code></p>
  </div>
  <div class="card">
    <h3>Migration</h3>
    <p><code>import from-project</code> · <code>from-npx</code> · <code>from-skillctl</code></p>
  </div>
</div>

<h2>Core commands</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl init</div>
  <p class="cmd-desc">Creates a starter <code>agent-skills.json</code> in the current directory. If agent skill directories are detected (e.g. <code>.codex/skills</code>), offers an import wizard. Does not overwrite an existing file.</p>
  <pre><code>skillctl init
skillctl init --no-prompt</code></pre>
  <p>Flag: <code>--no-prompt</code> — skip the post-init import wizard.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl add &lt;spec&gt;</div>
  <p class="cmd-desc">Resolves the specifier, downloads to cache, installs into the canonical store, updates manifest and lock.</p>
  <pre><code>skillctl add vercel-labs/agent-skills#web-design-guidelines
skillctl add npm:some-skill-pkg
skillctl add skills.sh/vercel-labs/agent-skills
skillctl add ./local-skills/my-review
skillctl add owner/repo --no-manifest</code></pre>
  <p>Flag: <code>--no-manifest</code> — do not update <code>agent-skills.json</code> (lock/store only).</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl install | i</div>
  <p class="cmd-desc">Ensures all manifest dependencies are in the store; syncs agents by default.</p>
  <pre><code>skillctl install
skillctl install --frozen
skillctl install --no-sync
SKILLCTL_PARALLEL=4 skillctl install</code></pre>
  <p>Flags: <code>--frozen</code> — fail (exit 2) if lock integrity ≠ store; <code>--no-sync</code> — skip agent linking.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl update [names...]</div>
  <p class="cmd-desc">Re-fetches named skills (or all if omitted) from manifest specifiers and re-syncs.</p>
  <pre><code>skillctl update
skillctl update web-design-guidelines playwright
skillctl update --no-sync</code></pre>
  <p>Flag: <code>--no-sync</code> — update store/lock without re-linking agents.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl sync</div>
  <p class="cmd-desc">Links lockfile skills to enabled agents without new downloads. Project agent directory links are <strong>relative</strong> (git-portable).</p>
  <pre><code>skillctl sync
skillctl sync --dry-run</code></pre>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl list</div>
  <p class="cmd-desc">Lists skills from the lockfile with manifest summary.</p>
  <pre><code>skillctl list
skillctl list --json</code></pre>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl remove &lt;name&gt; | rm</div>
  <p class="cmd-desc">Removes from manifest/lock and unlinks from agents.</p>
  <pre><code>skillctl remove web-design-guidelines
skillctl rm my-skill --purge</code></pre>
  <p>Flag: <code>--purge</code> — also deletes the copy in the canonical store.</p>
</div>

<h2>Diagnostics &amp; security</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl doctor</div>
  <p class="cmd-desc">Checks config, manifest, lock, adapters, coexistence (project agent dirs, npx, Python), and audit summary. Recommends <code>import from-project --dry-run</code> when skills are found under <code>.codex/skills</code>, <code>.claude/skills</code>, etc.</p>
  <pre><code>skillctl doctor
skillctl doctor --fix
skillctl doctor --json</code></pre>
  <p>Flags: <code>--fix</code> — re-sync links from lock entries; <code>--json</code> — structured report (exit 2 on issues).</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl audit</div>
  <p class="cmd-desc">Static scan: integrity, SKILL.md name, suspicious scripts, path traversal, size limits. No script execution.</p>
  <pre><code>skillctl audit
skillctl audit --json
skillctl audit --strict
skillctl audit --json --strict</code></pre>
  <p>Exit codes: 0 ok, 1 errors, 2 warnings (or warnings as errors with <code>--strict</code>).</p>
</div>

<h2>Import &amp; migration</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl import from-project</div>
  <p class="cmd-desc">Discovers and imports skills from project agent directories (<code>.codex/skills</code>, <code>.claude/skills</code>, <code>.agents/skills</code>, …). Updates manifest and lock by default with <code>local:imported/&lt;name&gt;</code> specifiers.</p>
  <pre><code>skillctl import from-project --dry-run
skillctl import from-project
skillctl import from-project --sync
skillctl import from-project --yes
skillctl import from-project --no-manifest</code></pre>
  <p>Flags: <code>--dry-run</code> — migration plan; <code>--sync</code> — sync agents after import; <code>--no-manifest</code> / <code>--lock-only</code> — lock only; <code>--sources codex,claude-code</code> — limit adapters; <code>--yes</code> — skip prompts.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl import from-npx</div>
  <p class="cmd-desc">Migrates from <code>npx skills</code> (<code>skills-lock.json</code>, <code>.agents/skills/</code>). Original npx install is left in place.</p>
  <pre><code>skillctl import from-npx --dry-run
skillctl import from-npx --write-manifest
skillctl import from-npx --sync --write-manifest
skillctl import from-npx --yes</code></pre>
  <p>Flags: <code>--dry-run</code> — migration plan; <code>--write-manifest</code> — update <code>agent-skills.json</code>; <code>--sync</code> — sync agents after import (<code>--adopt</code> deprecated alias); <code>--yes</code> — skip prompts.</p>
</div>

<div class="cmd-block">
  <div class="cmd-name">skillctl import from-skillctl</div>
  <p class="cmd-desc">Migrates from Python skillctl (<code>~/.skillctl/repos/</code>, <code>manifest.json</code>).</p>
  <pre><code>skillctl import from-skillctl --dry-run
skillctl import from-skillctl --sync
skillctl import from-skillctl --write-manifest</code></pre>
</div>

<h2>Plugin (experimental)</h2>

<div class="cmd-block">
  <div class="cmd-name">skillctl plugin list | enable | add | remove</div>
  <p class="cmd-desc">Manage local plugins. Requires <code>experimental.plugins: true</code> in config.</p>
  <pre><code>skillctl plugin enable
skillctl plugin add ./my-skillctl-plugin
skillctl plugin list
skillctl plugin list --json
skillctl plugin remove my-plugin</code></pre>
</div>

<h2>Global options</h2>
<pre><code>skillctl --version
skillctl -v
skillctl --help
skillctl &lt;command&gt; --help</code></pre>

<footer>
  <a href="#index">Overview</a> · <a href="#config">Configuration</a> · <a href="#problems">Problems</a>
</footer>
`,
      },
      problems: {
        title: 'Problems — skillctl',
        html: `
<h1>Problems &amp; solutions</h1>
<p class="lead">Troubleshooting for installation, registries, Windows, coexistence with other tools, and CI.</p>

<div class="alert alert-info">
  <strong>Recommended first step</strong>
  Always run <code>skillctl doctor</code> (or <code>skillctl doctor --json</code>) for a structured view of config, manifest, lock, and adapters.
</div>

<h2>Command not found</h2>
<p><strong>Symptom:</strong> <code>skillctl: command not found</code> after npm install.</p>
<ul>
  <li>Verify install: <code>npm list -g @skillctl/cli</code></li>
  <li>Ensure the global npm bin directory is on <code>PATH</code></li>
  <li>Immediate alternative: <code>npx @skillctl/cli doctor</code></li>
  <li>From source: <code>node packages/cli/bin/skillctl.js doctor</code></li>
</ul>

<h2>Build fails (development)</h2>
<p><strong>Symptom:</strong> TypeScript or pnpm errors during <code>pnpm build</code>.</p>
<ul>
  <li><code>pnpm install</code> from monorepo root</li>
  <li>Node.js ≥ 22.13 and pnpm 11.x (see repo README)</li>
  <li><code>pnpm -r build</code> to rebuild all packages</li>
  <li>Clean artifacts: remove <code>dist/</code> and rebuild</li>
</ul>

<h2>Absolute links in git (portability)</h2>
<p><strong>Symptom:</strong> on another machine, links under <code>.codex/skills</code> or <code>.claude/skills</code> point at absolute paths from the previous machine.</p>
<ul>
  <li>Since v0.3, <code>sync</code> creates <strong>relative</strong> symlinks in project agent directories</li>
  <li>Run <code>skillctl sync</code> or <code>skillctl doctor --fix</code> after upgrading</li>
  <li>Do not commit absolute links to <code>~/.skillctl</code> — regenerate them with sync</li>
</ul>

<h2>GitHub 403 / rate limit</h2>
<p><strong>Symptom:</strong> GitHub tarball fetch fails with 403 or rate limit.</p>
<ul>
  <li>Set <code>GITHUB_TOKEN</code> with a PAT scoped for public repo read</li>
  <li>Reduce parallelism: <code>SKILLCTL_PARALLEL=2 skillctl install</code></li>
  <li>Retry after rate limit reset; verify repo URL and skill name</li>
</ul>

<h2>Spec not matched</h2>
<p><strong>Symptom:</strong> <code>Could not resolve</code> or registry not found.</p>
<ul>
  <li>Use explicit prefixes: <code>github:</code>, <code>npm:</code>, <code>file:</code></li>
  <li>GitHub: <code>owner/repo#skill-folder</code> when the skill lives in a subfolder</li>
  <li>Local path: directory must contain <code>SKILL.md</code></li>
  <li><code>skillctl add &lt;spec&gt;</code> prints detailed resolution errors</li>
</ul>

<h2>skills.sh name-only error</h2>
<p><strong>Symptom:</strong> message requiring <code>owner/repo</code> form.</p>
<pre><code># ❌ invalid
skills.sh/web-design-guidelines

# ✓ valid
skills.sh/vercel-labs/agent-skills</code></pre>

<h2>npm integrity / lock drift</h2>
<p><strong>Symptom:</strong> <code>install --frozen</code> fails; audit reports sha256 mismatch.</p>
<ul>
  <li>Do not manually edit files in the canonical store</li>
  <li><code>skillctl update &lt;name&gt;</code> to realign lock and store</li>
  <li>In CI: commit updated <code>agent-skills.lock</code> after every <code>add</code></li>
  <li><code>skillctl audit</code> lists skills with compromised integrity</li>
</ul>

<h2>Windows — symlink / junction</h2>
<p><strong>Symptom:</strong> EPERM, links not created, copy fallback warnings.</p>
<ul>
  <li>Windows default: <code>junction</code> in <code>config.json</code> (<code>defaultMode</code>)</li>
  <li>Symlinks often require Developer Mode or administrator privileges</li>
  <li>Automatic fallback to <code>copy</code> with a log warning</li>
  <li><code>skillctl doctor --fix</code> to recreate links after mode changes</li>
</ul>

<h2>Agent not detected</h2>
<p><strong>Symptom:</strong> <code>sync</code> reports zero adapters or a specific agent is missing.</p>
<ul>
  <li>Check <code>agents.&lt;id&gt;: true</code> in <code>~/.skillctl/config.json</code></li>
  <li>Valid IDs: <code>claude-code</code>, <code>cursor</code>, <code>opencode</code>, <code>codex</code>, <code>gemini-cli</code></li>
  <li><code>skillctl doctor</code> shows registered vs enabled adapters</li>
  <li>For custom agents: experimental plugin with a dedicated adapter</li>
</ul>

<h2>Broken links</h2>
<p><strong>Symptom:</strong> agent directory points to a missing path or skill absent in the IDE.</p>
<ul>
  <li><code>skillctl doctor --fix</code></li>
  <li><code>skillctl sync</code> after <code>install</code></li>
  <li>Verify the skill exists at <code>~/.skillctl/skills/&lt;name&gt;/</code></li>
</ul>

<h2>Frozen install in CI</h2>
<p><strong>Symptom:</strong> pipeline fails with exit 2 on <code>install --frozen</code>.</p>
<ul>
  <li>Lockfile not committed or outdated → commit <code>agent-skills.lock</code></li>
  <li>CI cache missing <code>~/.skillctl/skills</code> → run <code>install</code> without frozen in build, frozen in verify</li>
  <li>Runner drift → use the same lock and same <code>@skillctl/cli</code> version</li>
</ul>

<h2>Missing lock</h2>
<p><strong>Symptom:</strong> <code>doctor</code> reports missing <code>agent-skills.lock</code>.</p>
<p>Expected right after <code>init</code>. Run <code>skillctl add</code> or <code>skillctl install</code> to generate it. Commit the lock to your repository.</p>

<h2>Coexistence with npx / Python skillctl</h2>
<p><strong>Symptom:</strong> duplicate skills, shared paths, unclear which tool manages skills.</p>
<ul>
  <li><code>skillctl doctor</code> detects <code>skills-lock.json</code> (npx) and <code>~/.skillctl/repos/</code> (Python)</li>
  <li>Skills already in agent dirs? Try <code>import from-project --dry-run</code></li>
  <li>Migrate from npx with <code>import from-npx --dry-run</code> before syncing</li>
  <li>Node canonical store is <code>~/.skillctl/skills/</code>; <code>.agents/skills</code> is a Cursor/npx target, not the store</li>
  <li>Install via <code>@skillctl/cli</code> to distinguish from the Python CLI</li>
</ul>

<h2>Import issues</h2>
<ul>
  <li><strong>Empty plan (from-project):</strong> no agent directories with skills — check <code>.codex/skills</code>, <code>.claude/skills</code>, etc.</li>
  <li><strong>Empty plan (from-npx/skillctl):</strong> no npx/Python markers — check <code>skills-lock.json</code> or Python repos</li>
  <li><strong>Skill already in lock:</strong> skipped (<code>skip-existing</code> in dry-run plan)</li>
  <li><strong>Partial errors:</strong> check stderr; exit 1 on fatal errors</li>
  <li>Always use <code>--dry-run</code> before final imports</li>
  <li>For <code>from-project</code>, manifest and lock update by default; use <code>--sync</code> to refresh agent links immediately</li>
</ul>

<h2>Audit warnings</h2>
<p>Suspicious patterns in <code>scripts/</code>, path traversal references, oversized SKILL.md. In CI use <code>audit --strict --json</code>. Fix or remove the problematic skill; do not ignore warnings from untrusted sources.</p>

<h2>Plugin not loaded</h2>
<ul>
  <li><code>experimental.plugins</code> must be <code>true</code> (<code>skillctl plugin enable</code>)</li>
  <li>Restart the CLI after enabling</li>
  <li><code>plugin add</code> requires <code>skillctl.plugin</code> in the plugin's <code>package.json</code></li>
  <li><code>skillctl plugin list</code> shows enabled (✓) or disabled (○) status</li>
</ul>

<h2>Quick diagnosis</h2>
<table>
  <thead>
    <tr><th>Symptom</th><th>Command / action</th><th>Expected exit</th></tr>
  </thead>
  <tbody>
    <tr><td>General setup</td><td><code>skillctl doctor</code></td><td>0 if ok</td></tr>
    <tr><td>Broken agent links</td><td><code>skillctl doctor --fix</code></td><td>0</td></tr>
    <tr><td>Reproducible CI</td><td><code>skillctl install --frozen</code></td><td>0 or 2 on drift</td></tr>
    <tr><td>Pipeline security</td><td><code>skillctl audit --json --strict</code></td><td>0 / 1 / 2</td></tr>
    <tr><td>Skills in agent directories</td><td><code>skillctl import from-project --dry-run</code></td><td>0</td></tr>
    <tr><td>npx migration plan</td><td><code>skillctl import from-npx --dry-run</code></td><td>0</td></tr>
    <tr><td>List installed skills</td><td><code>skillctl list --json</code></td><td>0</td></tr>
    <tr><td>CLI version</td><td><code>skillctl --version</code></td><td>0</td></tr>
    <tr><td>Active plugins</td><td><code>skillctl plugin list --json</code></td><td>0</td></tr>
  </tbody>
</table>

<footer>
  <a href="#index">Overview</a> · <a href="#config">Configuration</a> · <a href="#commands">Commands</a>
</footer>
`,
      },
    },
  },
};