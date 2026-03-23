// SHIELD Prospector v3 - popup.js

let extracted = null;
let hasKey = false;
let generatedOptions = [];
let feedbackLog = [];

const $ = id => document.getElementById(id);

const settingsToggle = $('settings-toggle');
const settingsPanel = $('settings-panel');
const apiInput = $('api-key-input');
const saveKeyBtn = $('save-key-btn');
const genBtn = $('generate-btn');
const regenBtn = $('regen-btn');
const loadingEl = $('loading');
const loadStep = $('load-step');
const errBox = $('err-box');
const errMsg = $('err-msg');
const optsCont = $('options-container');
const optsList = $('options-list');
const notLi = $('not-linkedin');
const liContent = $('li-content');
const noKeyWarn = $('no-key-warn');
const fbToggleBtn = $('fb-toggle-btn');
const fbPanel = $('feedback-panel');
const fbList = $('fb-list');
const fbItemCount = $('fb-item-count');
const fbCountBadge = $('fb-count-badge');
const exportBtn = $('export-btn');
const clearFbBtn = $('clear-fb-btn');

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadKey();
  await loadFeedback();
  await checkPage();
  renderFeedbackPanel();
});

// ── Settings ───────────────────────────────────────────────────────────────
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});

saveKeyBtn.addEventListener('click', async () => {
  const k = apiInput.value.trim();
  if (!k) return;
  await chrome.storage.local.set({ apiKey: k });
  hasKey = true;
  noKeyWarn.classList.remove('show');
  settingsPanel.classList.remove('open');
  updateGenBtn();
  saveKeyBtn.textContent = '✓ Salvo!';
  setTimeout(() => { saveKeyBtn.textContent = 'Salvar chave'; }, 1500);
});

async function loadKey() {
  const r = await chrome.storage.local.get('apiKey');
  if (r.apiKey) {
    hasKey = true;
    apiInput.value = r.apiKey;
  } else {
    noKeyWarn.classList.add('show');
  }
}

// ── Page detection ─────────────────────────────────────────────────────────
async function checkPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || !tab.url.includes('linkedin.com')) {
    notLi.classList.add('show');
    liContent.style.display = 'none';
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
    if (res && res.profileData) {
      extracted = res;
      renderProfileCard(res);
    }
  } catch (e) {
    // Content script not ready yet — still show UI
  }
  updateGenBtn();
}

function renderProfileCard(data) {
  const { profileData, messageHistory, language } = data;
  if (!profileData.name && !profileData.currentRole && !profileData.headline) return;

  $('profile-card').classList.add('show');
  const initials = (profileData.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  $('p-avatar').textContent = initials;
  $('p-name').textContent = profileData.name || 'Nome não identificado';

  const role = [profileData.currentRole, profileData.currentCompany].filter(Boolean).join(' · ');
  $('p-role').textContent = role || profileData.headline || '—';

  const tagsEl = $('p-tags');
  tagsEl.innerHTML = '';
  if (profileData.source === 'salesnav_profile') {
    addTag(tagsEl, '⚡ Sales Nav', 'tag-src');
  } else {
    addTag(tagsEl, '🔗 LinkedIn', 'tag-src');
  }
  if (language) {
    addTag(tagsEl, language === 'es' ? '🇪🇸 Espanhol' : '🇧🇷 Português', 'tag-lang');
  }
  if (messageHistory && messageHistory.length > 0) {
    addTag(tagsEl, messageHistory.length + ' msgs', 'tag-hist');
  }
}

function addTag(container, text, cls) {
  const t = document.createElement('span');
  t.className = 'tag ' + cls;
  t.textContent = text;
  container.appendChild(t);
}

function updateGenBtn() {
  genBtn.disabled = !hasKey;
}

// ── Generate ───────────────────────────────────────────────────────────────
genBtn.addEventListener('click', generate);
regenBtn.addEventListener('click', generate);

async function generate() {
  const r = await chrome.storage.local.get('apiKey');
  if (!r.apiKey) {
    noKeyWarn.classList.add('show');
    return;
  }

  setLoading(true);
  optsCont.style.display = 'none';
  errBox.classList.remove('show');

  const steps = [
    'lendo perfil do LinkedIn...',
    'identificando segmento e cargo...',
    'verificando histórico de mensagens...',
    'selecionando value prop...',
    'gerando no estilo do David...'
  ];
  let si = 0;
  const iv = setInterval(() => {
    si = (si + 1) % steps.length;
    loadStep.textContent = steps[si];
  }, 900);

  try {
    const fbData = await chrome.storage.local.get('feedbackLog');
    const feedbackContext = (fbData.feedbackLog || []).map(f => f.analysis).filter(Boolean);

    const res = await chrome.runtime.sendMessage({
      action: 'callClaude',
      payload: {
        profileData: extracted ? extracted.profileData : {},
        messageHistory: extracted ? extracted.messageHistory : [],
        language: extracted ? extracted.language : 'pt',
        apiKey: r.apiKey,
        feedbackContext: feedbackContext
      }
    });

    clearInterval(iv);
    setLoading(false);

    if (!res.success) throw new Error(res.error);
    generatedOptions = res.data;
    renderOptions(res.data);

  } catch (e) {
    clearInterval(iv);
    setLoading(false);
    genBtn.style.display = 'flex';
    errBox.classList.add('show');
    errMsg.textContent = e.message || 'Erro desconhecido. Verifique sua API key.';
  }
}

function setLoading(on) {
  loadingEl.classList.toggle('show', on);
  genBtn.style.display = on ? 'none' : 'flex';
}

// ── Render options ─────────────────────────────────────────────────────────
function renderOptions(options) {
  optsList.innerHTML = '';

  options.forEach(function(opt, i) {
    const card = document.createElement('div');
    card.className = 'opt-card';
    card.dataset.idx = i;

    card.innerHTML =
      '<div class="opt-head">' +
        '<div class="opt-label">' + escHtml(opt.label || 'Opção ' + (i + 1)) + '</div>' +
      '</div>' +
      '<div class="opt-body">' +
        '<div class="opt-text">' + escHtml(opt.message) + '</div>' +
      '</div>' +
      '<textarea class="opt-edit" rows="4">' + escHtmlPlain(opt.message) + '</textarea>' +
      '<div class="opt-foot">' +
        '<div class="foot-left">' +
          '<button class="act-btn edit-btn">✏ Editar</button>' +
          '<button class="act-btn save-edit-btn" style="display:none">✓ Salvar</button>' +
          '<button class="act-btn cancel-edit-btn" style="display:none">✕ Cancelar</button>' +
        '</div>' +
        '<div class="foot-right">' +
          '<button class="act-btn copy-btn">Copiar</button>' +
        '</div>' +
      '</div>' +
      '<div class="analyzing" id="analyzing-' + i + '">' +
        '<div class="mini-spin"></div>' +
        '<span>Analisando edição...</span>' +
      '</div>';

    const editBtn = card.querySelector('.edit-btn');
    const saveBtn = card.querySelector('.save-edit-btn');
    const cancelBtn = card.querySelector('.cancel-edit-btn');
    const copyBtn = card.querySelector('.copy-btn');
    const textarea = card.querySelector('.opt-edit');
    const bodyDiv = card.querySelector('.opt-body');
    const analyzingEl = card.querySelector('.analyzing');

    editBtn.addEventListener('click', function() {
      card.classList.add('editing');
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      textarea.focus();
      editBtn.style.display = 'none';
      saveBtn.style.display = 'flex';
      cancelBtn.style.display = 'flex';
    });

    cancelBtn.addEventListener('click', function() {
      textarea.value = opt.message;
      card.classList.remove('editing');
      editBtn.style.display = 'flex';
      saveBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
    });

    textarea.addEventListener('input', function() {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });

    saveBtn.addEventListener('click', async function() {
      const edited = textarea.value.trim();
      if (!edited || edited === opt.message) {
        cancelBtn.click();
        return;
      }

      bodyDiv.querySelector('.opt-text').innerHTML = escHtml(edited);
      card.classList.remove('editing');
      editBtn.style.display = 'flex';
      saveBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      analyzingEl.classList.add('show');

      const r = await chrome.storage.local.get('apiKey');
      if (!r.apiKey) {
        analyzingEl.classList.remove('show');
        return;
      }

      const res = await chrome.runtime.sendMessage({
        action: 'analyzeEdit',
        payload: {
          original: opt.message,
          edited: edited,
          profileData: extracted ? extracted.profileData : {},
          apiKey: r.apiKey
        }
      });

      analyzingEl.classList.remove('show');

      if (res.success) {
        const entry = {
          ts: new Date().toISOString(),
          prospect: {
            name: extracted && extracted.profileData ? extracted.profileData.name : null,
            role: extracted && extracted.profileData ? extracted.profileData.currentRole : null,
            company: extracted && extracted.profileData ? extracted.profileData.currentCompany : null
          },
          original: opt.message,
          edited: edited,
          analysis: res.data
        };

        feedbackLog.push(entry);
        await chrome.storage.local.set({ feedbackLog: feedbackLog });
        opt.message = edited;

        const badge = document.createElement('span');
        badge.className = 'fb-badge';
        badge.textContent = '✓ aprendizado salvo';
        badge.style.cssText = 'display:inline-block;margin:0 12px 8px;';
        card.querySelector('.opt-foot').after(badge);

        renderFeedbackPanel();
        updateFbBadge();
      }
    });

    copyBtn.addEventListener('click', function() {
      const msg = card.classList.contains('editing')
        ? textarea.value
        : bodyDiv.querySelector('.opt-text').innerText;

      navigator.clipboard.writeText(msg).then(function() {
        copyBtn.textContent = '✓ Copiado!';
        copyBtn.classList.add('copied');
        setTimeout(function() {
          copyBtn.textContent = 'Copiar';
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    });

    optsList.appendChild(card);
  });

  optsCont.style.display = 'block';
}

// ── Feedback ───────────────────────────────────────────────────────────────
fbToggleBtn.addEventListener('click', function() {
  fbPanel.classList.toggle('show');
  fbToggleBtn.classList.toggle('active-btn', fbPanel.classList.contains('show'));
});

async function loadFeedback() {
  const r = await chrome.storage.local.get('feedbackLog');
  feedbackLog = r.feedbackLog || [];
  updateFbBadge();
}

function updateFbBadge() {
  const n = feedbackLog.length;
  fbCountBadge.textContent = n > 0 ? n : '';
}

function renderFeedbackPanel() {
  fbItemCount.textContent = feedbackLog.length;
  fbList.innerHTML = '';

  if (feedbackLog.length === 0) {
    fbList.innerHTML = '<div style="font-size:11px;color:var(--dim);padding:8px 0">Nenhum aprendizado ainda. Edite uma mensagem gerada para criar o primeiro.</div>';
    return;
  }

  const reversed = feedbackLog.slice().reverse();
  reversed.forEach(function(entry) {
    const el = document.createElement('div');
    el.className = 'fb-item';
    const rules = entry.analysis && entry.analysis.style_rules ? entry.analysis.style_rules : [];
    const parts = [entry.prospect && entry.prospect.name, entry.prospect && entry.prospect.role].filter(Boolean);
    const prospect = parts.join(' · ');

    let html = '<div class="fb-item-sum">' + escHtml(entry.analysis && entry.analysis.summary ? entry.analysis.summary : 'Edição registrada') + '</div>';
    if (prospect) {
      html += '<div style="font-size:10px;color:var(--dim);margin-bottom:4px">' + escHtml(prospect) + '</div>';
    }
    html += '<div class="fb-rules">';
    rules.slice(0, 3).forEach(function(rule) {
      html += '<div class="fb-rule">' + escHtml(rule) + '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
    fbList.appendChild(el);
  });
}

exportBtn.addEventListener('click', function() {
  const blob = new Blob([JSON.stringify(feedbackLog, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shield-feedback-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
  exportBtn.textContent = '✓ Exportado!';
  setTimeout(function() {
    exportBtn.textContent = '↓ Exportar JSON para enviar ao Claude';
  }, 2000);
});

clearFbBtn.addEventListener('click', async function() {
  if (!confirm('Limpar todos os aprendizados salvos?')) return;
  feedbackLog = [];
  await chrome.storage.local.set({ feedbackLog: [] });
  renderFeedbackPanel();
  updateFbBadge();
});

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtmlPlain(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
