(() => {
  'use strict';

  const INTEGRATION_CONFIG = {
    mode: 'mock',
    endpoint: '',
    apiKey: '',
    timeoutMs: 1500
  };

  const els = {
    input: document.getElementById('diff-input'),
    analyzeBtn: document.getElementById('analyze-btn'),
    clearBtn: document.getElementById('clear-btn'),
    sampleButtons: Array.from(document.querySelectorAll('.btn-sample')),
    empty: document.getElementById('result-empty'),
    loading: document.getElementById('result-loading'),
    error: document.getElementById('error-area'),
    card: document.getElementById('result-card'),
    riskCard: document.querySelector('.risk-score-card'),
    riskScore: document.getElementById('risk-score'),
    impactedAreas: document.getElementById('impacted-areas')
  };

  const SYSTEM_PROMPT =
    'You are a code review copilot. Analyze the given Git diff. ' +
    'Respond ONLY with valid JSON in exactly this shape: ' +
    '{"risk_score": "High", "impacted_areas": ["str", "str"]} ' +
    'where risk_score is exactly one of "Low", "Medium", or "High" ' +
    'and impacted_areas is a list of 1 to 5 short items describing the areas affected by the diff.';

  const FALLBACK_RULES = [
    { level: 'High', keywords: ['schema', 'auth', 'payment'] },
    { level: 'Medium', keywords: ['service', 'controller'] },
    { level: 'Low', keywords: ['ui', 'css'] }
  ];

  const SEMANTIC_AREA_RULES = [
    { label: 'Database Schema', keywords: ['migration', 'schema', 'sql', 'table', 'column'] },
    { label: 'Authentication', keywords: ['auth', 'token', 'login', 'session', 'secret', 'credential'] },
    { label: 'Payments', keywords: ['payment', 'billing', 'checkout', 'invoice', 'charge'] },
    { label: 'Public API', keywords: ['api', 'endpoint', 'route'] },
    { label: 'API Layer', keywords: ['controller', 'handler', 'service'] },
    { label: 'Order Processing', keywords: ['order'] },
    { label: 'Inventory', keywords: ['inventory', 'stock', 'warehouse'] },
    { label: 'UI Layer', keywords: ['ui', 'css', 'template', 'html', 'view', 'component', 'style'] }
  ];

  const MOCK_SAMPLES = {
    low: [
      'diff --git a/web/static/css/app.css b/web/static/css/app.css',
      'index 1a2b3c4..5d6e7f8 100644',
      '--- a/web/static/css/app.css',
      '+++ b/web/static/css/app.css',
      '@@ -45,7 +45,7 @@',
      ' .btn {',
      '-  background-color: #1f2933;',
      '+  background-color: #2563eb;',
      ' }',
      '',
      'diff --git a/web/templates/home.html b/web/templates/home.html',
      'index 9a8b7c6..0f1e2d3 100644',
      '--- a/web/templates/home.html',
      '+++ b/web/templates/home.html',
      '@@ -22,6 +22,6 @@',
      ' <button class="btn">',
      '-  Sign up',
      '+  Get started',
      ' </button>'
    ].join('\n'),
    medium: [
      'diff --git a/app/controllers/OrderController.php b/app/controllers/OrderController.php',
      'index a1b2c3d..e4f5a6b 100644',
      '--- a/app/controllers/OrderController.php',
      '+++ b/app/controllers/OrderController.php',
      '@@ -38,9 +38,10 @@ class OrderController',
      '-        $orders = $this->orderService->getAll();',
      '+        $orders = $this->orderService->getPage($request->get(\'page\', 1));',
      '+        $this->logger->info(\'Fetched order page\', [\'count\' => count($orders)]);',
      '',
      'diff --git a/app/services/InventoryService.php b/app/services/InventoryService.php',
      'index c3d4e5f..6a7b8c9 100644',
      '--- a/app/services/InventoryService.php',
      '+++ b/app/services/InventoryService.php',
      '@@ -12,7 +12,7 @@ class InventoryService',
      '-    public function reserve($sku, $qty)',
      '+    public function reserve($sku, $qty, $batchId = null)',
      '     {',
      '-        $this->stock->decrement($sku, $qty);',
      '+        $this->stock->decrement($sku, $qty);',
      '+        $this->stock->hold($batchId);'
    ].join('\n'),
    high: [
      'diff --git a/db/migrations/002_add_payments.sql b/db/migrations/002_add_payments.sql',
      'index 1112223..4445556 100644',
      '--- a/db/migrations/002_add_payments.sql',
      '+++ b/db/migrations/002_add_payments.sql',
      '@@ -1,9 +1,10 @@',
      '-ALTER TABLE payments ADD COLUMN status VARCHAR(20) DEFAULT \'pending\';',
      '+ALTER TABLE payments DROP COLUMN status;',
      '+DROP INDEX idx_payments_user;',
      '',
      'diff --git a/src/auth/AuthService.php b/src/auth/AuthService.php',
      'index 7f6e5d4..3c2b1a0 100644',
      '--- a/src/auth/AuthService.php',
      '+++ b/src/auth/AuthService.php',
      '@@ -55,8 +55,8 @@ class AuthService',
      '-        $token = $this->tokenStore->issue($user);',
      '+        $token = $this->tokenStore->issue($user, \'auto\');',
      '+        $this->secretStore->rotate();'
    ].join('\n')
  };

  function setLoading(isLoading) {
    els.analyzeBtn.disabled = isLoading;
    els.loading.classList.toggle('hidden', !isLoading);
    if (isLoading) {
      els.empty.classList.add('hidden');
      els.card.classList.add('hidden');
      hideError();
    }
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.remove('hidden');
  }

  function hideError() {
    els.error.classList.add('hidden');
    els.error.textContent = '';
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function extractImpactedAreas(diff) {
    const areas = [];
    const seen = new Set();

    const files = [];
    const fileRegex = /^diff --git a\/.+ b\/(.+)$/gm;
    let match;
    while ((match = fileRegex.exec(diff)) !== null) {
      const file = match[1].trim();
      if (!seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }

    const signal = [];
    diff.split('\n').forEach((line) => {
      if (/^@@/.test(line) || /^[+-][^+-]/.test(line)) {
        signal.push(line);
      }
    });

    const corpus = files.join('\n') + '\n' + signal.join('\n');

    SEMANTIC_AREA_RULES.forEach((rule) => {
      if (areas.length >= 5) return;
      if (rule.keywords.some((keyword) => hitsKeyword(corpus, keyword))) {
        areas.push(rule.label);
      }
    });

    if (areas.length === 0) {
      files.forEach((file) => {
        if (areas.length >= 5) return;
        const name = cleanModuleName(file);
        if (name && areas.indexOf(name) === -1) {
          areas.push(name);
        }
      });
    }

    if (areas.length === 0) {
      areas.push('Miscellaneous changes');
    }

    return areas;
  }

  function hitsKeyword(text, keyword) {
    if (keyword.length <= 3) {
      return new RegExp('(^|[^a-z0-9])' + keyword + '([^a-z0-9]|$)', 'i').test(text);
    }
    return text.indexOf(keyword) !== -1;
  }

  function cleanModuleName(file) {
    const base = file.replace(/\\/g, '/').split('/').pop();
    const name = base.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function fallbackAnalysis(text) {
    const lower = text.toLowerCase();
  
    const highRiskKeywords = [
      'auth',
      'authentication',
      'token',
      'password',
      'secret',
      'permission',
      'role',
      'payment',
      'billing',
      'schema',
      'migration',
      'drop table',
      'drop column',
      'alter table',
      'database'
    ];
  
    const mediumRiskKeywords = [
      'service',
      'controller',
      'api',
      'route',
      'endpoint',
      'query',
      'transaction',
      'cache',
      'queue'
    ];
  
    const hasHighRisk = highRiskKeywords.some((keyword) =>
      lower.includes(keyword)
    );
  
    const hasMediumRisk = mediumRiskKeywords.some((keyword) =>
      lower.includes(keyword)
    );
  
    let riskScore = 'Low';
  
    if (hasHighRisk) {
      riskScore = 'High';
    } else if (hasMediumRisk) {
      riskScore = 'Medium';
    }
  
    return {
      risk_score: riskScore,
      impacted_areas: extractImpactedAreas(text)
    };
  }
  
  function callApprovedModel(prompt) {
    if (INTEGRATION_CONFIG.mode === 'external') {
      return callExternalModel(prompt);
    }
    return callMockModel(prompt);
  }

  function callMockModel(prompt) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const mock = fallbackAnalysis(prompt);
          resolve(JSON.stringify({
            risk_score: mock.risk_score,
            impacted_areas: mock.impacted_areas
          }));
        } catch (err) {
          reject(err);
        }
      }, INTEGRATION_CONFIG.timeoutMs);
    });
  }

  function buildExternalRequest(prompt) {
    const headers = { 'Content-Type': 'application/json' };
    if (INTEGRATION_CONFIG.apiKey) {
      headers['Authorization'] = 'Bearer ' + INTEGRATION_CONFIG.apiKey;
    }
    return {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ prompt: prompt })
    };
  }

  function callExternalModel(prompt) {
    return new Promise((resolve, reject) => {
      if (!INTEGRATION_CONFIG.endpoint) {
        reject(new Error('Model endpoint is not configured'));
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), INTEGRATION_CONFIG.timeoutMs);
      fetch(INTEGRATION_CONFIG.endpoint, Object.assign(buildExternalRequest(prompt), { signal: controller.signal }))
        .then((response) => {
          if (!response.ok) {
            throw new Error('Model request failed with status ' + response.status);
          }
          return response.text();
        })
        .then((text) => {
          if (!text || !text.trim()) {
            throw new Error('Model returned an empty response');
          }
          const data = JSON.parse(text);
          if (!isValidResult(data)) {
            throw new Error('Model returned invalid JSON');
          }
          return data;
        })
        .then(
          (data) => resolve(JSON.stringify(data)),
          (err) => {
            clearTimeout(timer);
            reject(err && err.name === 'AbortError' ? new Error('Model request timed out') : err);
          }
        );
    });
  }

  function isValidResult(data) {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.risk_score === 'string' &&
      Array.isArray(data.impacted_areas)
    );
  }

  function renderResult(data) {
    const level = String(data.risk_score).toLowerCase();
    const badgeClass = ['low', 'medium', 'high'].includes(level) ? level : 'medium';

    els.riskScore.textContent = capitalize(level);
    els.riskScore.className = 'risk-score ' + badgeClass;
    els.riskCard.className = 'risk-score-card ' + badgeClass;

    els.impactedAreas.innerHTML = '';
    data.impacted_areas.slice(0, 5).forEach((area) => {
      const li = document.createElement('li');
      li.textContent = area;
      els.impactedAreas.appendChild(li);
    });

    els.empty.classList.add('hidden');
    els.card.classList.remove('hidden');
  }

  async function analyzeDiff(text) {
    setLoading(true);
    try {
      const prompt = SYSTEM_PROMPT + '\n\nHere is the Git diff to analyze:\n"""\n' + text + '\n"""';
      const raw = await callApprovedModel(prompt);
      const data = JSON.parse(raw);
      if (!isValidResult(data)) {
        throw new Error('Invalid model response');
      }
      renderResult(data);
    } catch (err) {
      renderResult(fallbackAnalysis(text));
    } finally {
      setLoading(false);
    }
  }

  async function loadSample(type) {
    try {
      const response = await fetch('samples/' + type + '.diff');
      if (!response.ok) {
        throw new Error('Sample not found');
      }
      els.input.value = await response.text();
    } catch (err) {
      els.input.value = MOCK_SAMPLES[type] || '';
    }
    hideError();
  }
  
  function clearAnalysis() {
    els.input.value = '';
  
    els.empty.classList.remove('hidden');
    els.loading.classList.add('hidden');
    els.card.classList.add('hidden');
  
    els.riskScore.textContent = '';
    els.riskScore.className = 'risk-score';
    els.riskCard.className = 'risk-score-card';
  
    els.impactedAreas.innerHTML = '';
    hideError();
  }
  
  els.analyzeBtn.addEventListener('click', () => {
    const text = els.input.value.trim();
  
    if (!text) {
      showError('Please paste a Git diff before analyzing.');
      return;
    }
  
    const looksLikeDiff = /(^|\n)(diff --git|@@ )|\n[+-][^+-]/.test(text);
  
    if (!looksLikeDiff) {
      showError('Input does not look like a Git diff.');
      return;
    }
  
    analyzeDiff(text);
  });
  
  els.clearBtn.addEventListener('click', clearAnalysis);
  
  els.sampleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      loadSample(btn.dataset.sample);
    });
  });
})();
